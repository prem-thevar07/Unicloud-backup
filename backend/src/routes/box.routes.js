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

    // Redirect user browser to secure download stream
    const downloadUrl = `https://api.box.com/2.0/files/${fileId}/content?access_token=${account.accessToken}`;
    res.redirect(downloadUrl);
  } catch (err) {
    console.error("❌ Box download link error:", err.message);
    res.status(500).json({ message: "Failed to retrieve Box link" });
  }
});

export default router;
