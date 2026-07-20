import express from "express";
import jwt from "jsonwebtoken";
import axios from "axios";
import CloudAccount from "../models/CloudAccount.js";
import auth from "../middleware/auth.middleware.js";
import { fileCache } from "../utils/cache.js";
import { logActivity } from "../utils/activityLogger.js";
import { fetchDropboxStorage } from "../services/providers/dropbox.provider.js";

const router = express.Router();

/* ===============================
   🔗 CONNECT DROPBOX
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

    console.log("🔗 Dropbox auth start for user:", userId);

    const redirectUri = `${process.env.BASE_URL}/api/dropbox/callback`;
    const url = `https://www.dropbox.com/oauth2/authorize?client_id=${process.env.DROPBOX_APP_KEY}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&token_access_type=offline&state=${userId}`;

    res.redirect(url);
  } catch (err) {
    console.error("❌ Dropbox connect error:", err.message);
    res.status(500).send("OAuth start failed");
  }
});

/* ===============================
   🔁 DROPBOX CALLBACK
=============================== */
router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send("Missing OAuth data");
    }

    const userId = state;
    console.log("🔁 Dropbox callback for user:", userId);

    const redirectUri = `${process.env.BASE_URL}/api/dropbox/callback`;

    // Exchange code for token
    const params = new URLSearchParams();
    params.append("code", code);
    params.append("grant_type", "authorization_code");
    params.append("client_id", process.env.DROPBOX_APP_KEY);
    params.append("client_secret", process.env.DROPBOX_APP_SECRET);
    params.append("redirect_uri", redirectUri);

    const tokenResponse = await axios.post("https://api.dropbox.com/oauth2/token", params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    const { access_token, refresh_token } = tokenResponse.data;

    // Get current account info (email, etc.)
    const accountInfoRes = await axios.post(
      "https://api.dropboxapi.com/2/users/get_current_account",
      {},
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const email = accountInfoRes.data.email;
    console.log("📧 Dropbox account email:", email);

    // Fetch storage space allocation & usage details
    let storage = { used: 0, total: 0 };
    try {
      const spaceRes = await axios.post(
        "https://api.dropboxapi.com/2/users/get_space_usage",
        {},
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json"
          }
        }
      );
      
      const used = spaceRes.data.used || 0;
      let total = 0;
      if (spaceRes.data.allocation) {
        if (spaceRes.data.allocation.allocated) {
          total = spaceRes.data.allocation.allocated;
        } else if (spaceRes.data.allocation.individual) {
          total = spaceRes.data.allocation.individual.allocated || 0;
        }
      }
      storage = { used, total };
    } catch (err) {
      console.warn("⚠️ Failed to fetch storage info during connection:", err.message);
    }

    // Save cloud account in MongoDB
    await CloudAccount.findOneAndUpdate(
      {
        userId,
        provider: "dropbox",
        email,
      },
      {
        userId,
        provider: "dropbox",
        email,
        accessToken: access_token,
        refreshToken: refresh_token,
        storage,
        status: "connected",
        lastSyncedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log("💾 Dropbox account saved:", email);

    // ✅ Log real account_connected event
    await logActivity(userId, "account_connected",
      `Connected Dropbox account (${email})`,
      { provider: "dropbox", email }
    );

    // ✅ Check storage warning (> 80%)
    if (storage.total > 0) {
      const pct = Math.round((storage.used / storage.total) * 100);
      if (pct >= 80) {
        await logActivity(userId, "storage_warning",
          `Dropbox (${email}) is at ${pct}% capacity`,
          { provider: "dropbox", email, storagePercent: pct }
        );
      }
    }

    // Invalidate photos cache for the user
    fileCache.invalidateUserPhotos(userId);

    res.redirect(`${process.env.FRONTEND_URL}/manage-accounts`);
  } catch (err) {
    console.error("❌ Dropbox callback error:", err.response?.data || err.message);
    res.status(500).send("OAuth callback failed");
  }
});

/* ===============================
   🔄 SYNC DROPBOX STORAGE
=============================== */
router.post("/sync/:accountId", auth, async (req, res) => {
  try {
    const { accountId } = req.params;
    console.log("🔄 Sync request for Dropbox account:", accountId);

    const account = await CloudAccount.findOne({
      _id: accountId,
      userId: req.user.id,
      provider: "dropbox",
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const { used, total } = await fetchDropboxStorage(account);

    account.storage = { used, total };
    account.lastSyncedAt = new Date();
    account.status = "connected";
    await account.save();

    res.json({
      accountId: account._id,
      used,
      total,
    });
  } catch (err) {
    console.error("❌ Dropbox sync error:", err.message);
    res.status(500).json({ message: "Sync failed" });
  }
});

/* ===============================
   📥 DROPBOX DOWNLOAD TEMP LINK
=============================== */
router.get("/download/:accountId", auth, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { path } = req.query;

    if (!path) {
      return res.status(400).json({ message: "Missing file path" });
    }

    const account = await CloudAccount.findOne({
      _id: accountId,
      userId: req.user.id,
      provider: "dropbox",
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Call get_temporary_link to get dynamic direct download link
    const refreshAndGetLink = async (accessToken) => {
      return axios.post(
        "https://api.dropboxapi.com/2/files/get_temporary_link",
        { path },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );
    };

    let linkRes;
    try {
      linkRes = await refreshAndGetLink(account.accessToken);
    } catch (err) {
      if (err.response?.status === 401 && account.refreshToken) {
        console.log(`🔄 Refreshing Dropbox token for download link: ${account.email}`);
        const params = new URLSearchParams();
        params.append("grant_type", "refresh_token");
        params.append("refresh_token", account.refreshToken);
        params.append("client_id", process.env.DROPBOX_APP_KEY);
        params.append("client_secret", process.env.DROPBOX_APP_SECRET);

        const refreshRes = await axios.post("https://api.dropbox.com/oauth2/token", params, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });

        const token = refreshRes.data.access_token;
        account.accessToken = token;
        account.lastSyncedAt = new Date();
        await account.save();

        linkRes = await refreshAndGetLink(token);
      } else {
        throw err;
      }
    }

    res.json({ link: linkRes.data.link });
  } catch (err) {
    console.error("❌ Dropbox get download link failed:", err.response?.data || err.message);
    res.status(500).json({ message: "Failed to generate download link" });
  }
});

export default router;
