import express from "express";
import jwt from "jsonwebtoken";
import axios from "axios";
import CloudAccount from "../models/CloudAccount.js";
import auth from "../middleware/auth.middleware.js";
import { fileCache } from "../utils/cache.js";
import { logActivity } from "../utils/activityLogger.js";

const router = express.Router();

/* ===============================
   🔗 CONNECT ONEDRIVE
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

    console.log("🔗 OneDrive auth start for user:", userId);

    const redirectUri = `${process.env.BASE_URL}/api/onedrive/callback`;
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${process.env.ONEDRIVE_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=files.readwrite%20offline_access%20User.Read&state=${userId}`;

    res.redirect(url);
  } catch (err) {
    console.error("❌ OneDrive connect error:", err.message);
    res.status(500).send("OAuth start failed");
  }
});

/* ===============================
   🔁 ONEDRIVE CALLBACK
=============================== */
router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send("Missing OAuth data");
    }

    const userId = state;
    console.log("🔁 OneDrive callback for user:", userId);

    const redirectUri = `${process.env.BASE_URL}/api/onedrive/callback`;

    // Exchange code for token
    const params = new URLSearchParams();
    params.append("code", code);
    params.append("grant_type", "authorization_code");
    params.append("client_id", process.env.ONEDRIVE_CLIENT_ID);
    params.append("client_secret", process.env.ONEDRIVE_CLIENT_SECRET);
    params.append("redirect_uri", redirectUri);

    const tokenResponse = await axios.post("https://login.microsoftonline.com/common/oauth2/v2.0/token", params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    const { access_token, refresh_token } = tokenResponse.data;

    // Get current account info (email)
    const profileRes = await axios.get("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const email = profileRes.data.mail || profileRes.data.userPrincipalName || "onedrive@unicloud.com";
    console.log("📧 OneDrive account email:", email);

    // Fetch storage quota details
    let storage = { used: 0, total: 0 };
    try {
      const driveRes = await axios.get("https://graph.microsoft.com/v1.0/me/drive", {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });
      const quota = driveRes.data.quota;
      if (quota) {
        storage = {
          used: quota.used || 0,
          total: quota.total || 0
        };
      }
    } catch (err) {
      console.warn("⚠️ Failed to fetch storage info during OneDrive connection:", err.message);
    }

    // Save cloud account in MongoDB
    await CloudAccount.findOneAndUpdate(
      {
        userId,
        provider: "onedrive",
        email,
      },
      {
        userId,
        provider: "onedrive",
        email,
        accessToken: access_token,
        refreshToken: refresh_token,
        storage,
        status: "connected",
        lastSyncedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log("💾 OneDrive account saved:", email);

    // Log connection activity
    await logActivity(userId, "account_connected", `Connected OneDrive account (${email})`, {
      provider: "onedrive",
      email
    });

    // Invalidate photos cache for the user
    fileCache.invalidateUserPhotos(userId);

    res.redirect(`${process.env.FRONTEND_URL}/manage-accounts`);
  } catch (err) {
    console.error("❌ OneDrive callback error:", err.response?.data || err.message);
    res.status(500).send("OAuth callback failed");
  }
});

/* ===============================
   🔄 SYNC ONEDRIVE
=============================== */
router.post("/sync/:id", auth, async (req, res) => {
  try {
    const accountId = req.params.id;
    const account = await CloudAccount.findOne({
      _id: accountId,
      userId: req.user.id,
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const params = new URLSearchParams();
    params.append("client_id", process.env.ONEDRIVE_CLIENT_ID);
    params.append("client_secret", process.env.ONEDRIVE_CLIENT_SECRET);
    params.append("refresh_token", account.refreshToken);
    params.append("grant_type", "refresh_token");

    const tokenRes = await axios.post("https://login.microsoftonline.com/common/oauth2/v2.0/token", params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    account.accessToken = tokenRes.data.access_token;
    if (tokenRes.data.refresh_token) {
      account.refreshToken = tokenRes.data.refresh_token;
    }

    // Refresh storage details
    const driveRes = await axios.get("https://graph.microsoft.com/v1.0/me/drive", {
      headers: {
        Authorization: `Bearer ${account.accessToken}`
      }
    });
    const quota = driveRes.data.quota;
    if (quota) {
      account.storage = {
        used: quota.used || 0,
        total: quota.total || 0
      };
    }

    account.lastSyncedAt = new Date();
    account.status = "connected";
    await account.save();

    // Log manual sync activity
    await logActivity(req.user.id, "account_synced", `Synced OneDrive account`, {
      provider: "onedrive",
      email: account.email
    });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ OneDrive manual sync error:", err.response?.data || err.message);
    res.status(500).json({ message: "Sync failed" });
  }
});

/* ===============================
   📥 GET DOWNLOAD LINK
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
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    let token = account.accessToken;
    let driveItemRes;

    const fetchItem = async (accessToken) => {
      return axios.get(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    };

    try {
      driveItemRes = await fetchItem(token);
    } catch (err) {
      if (err.response?.status === 401 && account.refreshToken) {
        const { refreshOneDriveToken } = await import("../services/providers/onedrive.provider.js");
        token = await refreshOneDriveToken(account);
        driveItemRes = await fetchItem(token);
      } else {
        throw err;
      }
    }

    const downloadUrl = driveItemRes.data["@microsoft.graph.downloadUrl"];
    if (!downloadUrl) {
      return res.status(404).json({ message: "Download URL not found" });
    }

    res.json({ link: downloadUrl });
  } catch (err) {
    console.error("❌ OneDrive download link error:", err.response?.data || err.message);
    res.status(500).json({ message: "Failed to generate download link" });
  }
});

/* ===============================
   🖼️ GET THUMBNAIL PROXY
=============================== */
router.get("/thumbnail/:id", auth, async (req, res) => {
  try {
    const accountId = req.params.id;
    const { fileId } = req.query;

    if (!fileId) {
      return res.status(400).json({ message: "File ID is required" });
    }

    const account = await CloudAccount.findOne({
      _id: accountId,
      userId: req.user.id,
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    let token = account.accessToken;
    let thumbRes;

    const fetchThumbnails = async (accessToken) => {
      return axios.get(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/thumbnails`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    };

    try {
      thumbRes = await fetchThumbnails(token);
    } catch (err) {
      if (err.response?.status === 401 && account.refreshToken) {
        const { refreshOneDriveToken } = await import("../services/providers/onedrive.provider.js");
        token = await refreshOneDriveToken(account);
        thumbRes = await fetchThumbnails(token);
      } else {
        throw err;
      }
    }

    const thumbnailSets = thumbRes.data.value || [];
    if (thumbnailSets.length > 0) {
      const mediumUrl = thumbnailSets[0].medium?.url || thumbnailSets[0].large?.url || thumbnailSets[0].small?.url;
      if (mediumUrl) {
        return res.redirect(mediumUrl);
      }
    }

    res.status(404).json({ message: "Thumbnail not found" });
  } catch (err) {
    console.error("❌ OneDrive thumbnail error:", err.response?.data || err.message);
    res.status(500).json({ message: "Failed to load thumbnail" });
  }
});

export default router;
