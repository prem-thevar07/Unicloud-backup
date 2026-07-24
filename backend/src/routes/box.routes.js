import express from "express";
import jwt from "jsonwebtoken";
import axios from "axios";
import CloudAccount from "../models/CloudAccount.js";
import auth from "../middleware/auth.middleware.js";
import { fileCache } from "../utils/cache.js";
import { logActivity } from "../utils/activityLogger.js";
import { fetchBoxStorage } from "../services/providers/box.provider.js";

const router = express.Router();

/* ===============================
   🔗 CONNECT BOX
=============================== */
router.get("/connect", (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      console.log("❌ Missing token");
      return res.status(401).send("Unauthorized");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    console.log("🔗 Box auth start for user:", userId);

    const redirectUri = `${process.env.BASE_URL}/api/box/callback`;
    const url = `https://account.box.com/api/oauth2/authorize?client_id=${process.env.BOX_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${userId}`;

    res.redirect(url);
  } catch (err) {
    console.error("❌ Box connect error:", err.message);
    res.status(500).send("OAuth start failed");
  }
});

/* ===============================
   🔁 BOX CALLBACK
=============================== */
router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send("Missing OAuth data");
    }

    const userId = state;
    console.log("🔁 Box callback for user:", userId);

    const redirectUri = `${process.env.BASE_URL}/api/box/callback`;
    
    // Swap code for tokens
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("client_id", process.env.BOX_CLIENT_ID);
    params.append("client_secret", process.env.BOX_CLIENT_SECRET);
    params.append("redirect_uri", redirectUri);

    const tokenResponse = await axios.post("https://api.box.com/oauth2/token", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    const { access_token, refresh_token } = tokenResponse.data;

    // Fetch user details for email
    const accountInfoRes = await axios.get("https://api.box.com/2.0/users/me", {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const email = accountInfoRes.data.login || accountInfoRes.data.name || "box-user@unicloud.com";
    console.log("📧 Box account email:", email);

    // Save cloud account in MongoDB
    const account = await CloudAccount.findOneAndUpdate(
      {
        userId,
        provider: "box",
        email,
      },
      {
        userId,
        provider: "box",
        email,
        accessToken: access_token,
        refreshToken: refresh_token,
        status: "connected",
        lastSyncedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Fetch and save initial storage metrics
    const storage = await fetchBoxStorage(account);
    account.storage = storage;
    await account.save();

    console.log("💾 Box account saved:", email);

    // Log connection event
    await logActivity(userId, "account_connected",
      `Connected Box account (${email})`,
      { provider: "box", email }
    );

    // Invalidate photos cache for the user
    fileCache.invalidateUserPhotos(userId);

    res.redirect(`${process.env.FRONTEND_URL}/manage-accounts`);
  } catch (err) {
    console.error("❌ Box callback error:", err.response?.data || err.message);
    res.status(500).send("OAuth callback failed");
  }
});

/* ===============================
   🔄 SYNC BOX STORAGE
=============================== */
router.post("/sync/:accountId", auth, async (req, res) => {
  try {
    const { accountId } = req.params;
    console.log("🔄 Sync request for Box account:", accountId);

    const account = await CloudAccount.findOne({
      _id: accountId,
      userId: req.user.id,
      provider: "box",
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const storage = await fetchBoxStorage(account);
    account.storage = storage;
    account.lastSyncedAt = new Date();
    await account.save();

    // Log sync event
    await logActivity(req.user.id, "account_synced",
      `Synced Box account`,
      { provider: "box", email: account.email }
    );

    // Clear local caches
    fileCache.clear();

    res.json({ success: true, account });
  } catch (err) {
    console.error("❌ Box sync error:", err.message);
    res.status(500).json({ message: "Sync failed" });
  }
});

/* ===============================
   📥 BOX DOWNLOAD STREAM
=============================== */
router.get("/download/:id", auth, async (req, res) => {
  try {
    const accountId = req.params.id;
    const { fileId } = req.query;

    if (!fileId) {
      return res.status(400).json({ message: "File ID is required" });
    }

    const account = await CloudAccount.findOne({
      _id: accountId,
      userId: req.user.id,
      provider: "box",
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Return secure download link in JSON for frontend trigger
    const downloadUrl = `https://api.box.com/2.0/files/${fileId}/content?access_token=${account.accessToken}`;
    res.json({ link: downloadUrl });
  } catch (err) {
    console.error("❌ Box download link error:", err.message);
    res.status(500).json({ message: "Failed to retrieve Box link" });
  }
});

/* ===============================
   📂 BOX OPEN / PREVIEW STREAM
=============================== */
router.get("/open/:id", auth, async (req, res) => {
  try {
    const accountId = req.params.id;
    const { fileId } = req.query;

    if (!fileId) {
      return res.status(400).json({ message: "File ID is required" });
    }

    const account = await CloudAccount.findOne({
      _id: accountId,
      userId: req.user.id,
      provider: "box",
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // 1. Fetch file metadata (name, extension, expiring_embed_link)
    let fileInfoRes;
    try {
      fileInfoRes = await axios.get(`https://api.box.com/2.0/files/${fileId}?fields=id,name,extension,expiring_embed_link`, {
        headers: { Authorization: `Bearer ${account.accessToken}` }
      });
    } catch (err) {
      if (err.response?.status === 401 && account.refreshToken) {
        const { refreshBoxToken } = await import("../services/providers/box.provider.js");
        account.accessToken = await refreshBoxToken(account);
        fileInfoRes = await axios.get(`https://api.box.com/2.0/files/${fileId}?fields=id,name,extension,expiring_embed_link`, {
          headers: { Authorization: `Bearer ${account.accessToken}` }
        });
      } else {
        throw err;
      }
    }

    const name = fileInfoRes.data?.name || "file";
    const ext = (fileInfoRes.data?.extension || name.split(".").pop()).toLowerCase();
    const embedUrl = fileInfoRes.data?.expiring_embed_link?.url;

    const officeExts = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"];

    // 1. For Office documents: Use Box expiring embed viewer or web URL
    if (officeExts.includes(ext) && embedUrl) {
      return res.redirect(embedUrl);
    }

    const mimeMap = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
      pdf: "application/pdf", txt: "text/plain", json: "application/json", js: "text/javascript", html: "text/html",
      mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm"
    };
    const mime = mimeMap[ext] || "application/octet-stream";

    const isDirectInline = 
      mime.startsWith("image/") || 
      mime.startsWith("video/") || 
      mime.startsWith("audio/") || 
      ext === "pdf" || ext === "txt";

    if (isDirectInline) {
      try {
        const streamRes = await axios.get(`https://api.box.com/2.0/files/${fileId}/content`, {
          headers: { Authorization: `Bearer ${account.accessToken}` },
          responseType: "stream"
        });

        res.setHeader("Content-Type", ext === "pdf" ? "application/pdf" : mime);
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(name)}"`);
        return streamRes.data.pipe(res);
      } catch (streamErr) {
        console.warn("Box direct stream error, falling back to embed url:", streamErr.message);
      }
    }

    // 2. If embed link available, redirect to expiring_embed_link
    if (embedUrl) {
      return res.redirect(embedUrl);
    }

    // 3. Final fallback: Stream file content directly as inline text/binary stream
    try {
      const streamRes = await axios.get(`https://api.box.com/2.0/files/${fileId}/content`, {
        headers: { Authorization: `Bearer ${account.accessToken}` },
        responseType: "stream"
      });

      res.setHeader("Content-Type", mime || "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(name)}"`);
      return streamRes.data.pipe(res);
    } catch (fallbackErr) {
      return res.status(404).json({ message: "Box file preview not available" });
    }
  } catch (err) {
    console.error("❌ Box open link error:", err.message);
    res.status(500).json({ message: "Failed to open Box file" });
  }
});

export default router;
