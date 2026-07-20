import express from "express";
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import CloudAccount from "../models/CloudAccount.js";
import auth from "../middleware/auth.middleware.js";
import { oauth2Client } from "../config/google.js";
import { fileCache } from "../utils/cache.js";

const router = express.Router();

/* ===============================
   🔗 CONNECT GOOGLE (JWT BASED)
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

    console.log("🔗 OAuth start for user:", userId);

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.BASE_URL}/api/google/callback`
    );

    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent", // 🔥 required
      scope: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/photoslibrary.readonly.originals",
        "https://www.googleapis.com/auth/photoslibrary.appendonly",
      ],
      state: userId,
    });

    res.redirect(url);
  } catch (err) {
    console.error("❌ OAuth start error:", err.message);
    res.status(401).send("Unauthorized");
  }
});

/* ===============================
   🔁 GOOGLE CALLBACK (MULTI ACCOUNT SAFE)
=============================== */
router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send("Missing OAuth data");
    }

    const userId = state;

    console.log("🔁 Callback for user:", userId);

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.BASE_URL}/api/google/callback`
    );

    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    console.log("✅ Tokens received. Scopes returned by Google:", tokens.scope);

    /* GET EMAIL */
    const oauth2 = google.oauth2({
      auth: client,
      version: "v2",
    });

    const { data } = await oauth2.userinfo.get();
    const email = data.email;

    console.log("📧 Google account:", email);

    /* HANDLE EXISTING ACCOUNT */
    const existing = await CloudAccount.findOne({
      userId,
      provider: "google",
      email,
    });

    const refreshToken =
      tokens.refresh_token || existing?.refreshToken;

    if (!refreshToken) {
      console.warn("⚠️ No refresh token received");
    }

    /* SAVE ACCOUNT (NO OVERWRITE BUG) */
    await CloudAccount.findOneAndUpdate(
      {
        userId,
        provider: "google",
        email,
      },
      {
        userId,
        provider: "google",
        email,
        accessToken: tokens.access_token,
        refreshToken,
        scope: tokens.scope?.split(" ") || [],
        status: "connected",
        lastSyncedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log("💾 Account saved:", email);

    // Invalidate caches for this account and user
    if (existing) {
      fileCache.invalidateAccount(existing._id.toString());
    }
    fileCache.invalidateUserPhotos(userId);

    res.redirect(`${process.env.FRONTEND_URL}/manage-accounts`);
  } catch (err) {
    console.error("❌ Callback error:", err.message);
    res.status(500).send("OAuth failed");
  }
});

/* ===============================
   🔄 SYNC ACCOUNT (🔥 YOUR MISSING PIECE)
=============================== */
router.post("/sync/:accountId", auth, async (req, res) => {
  try {
    const { accountId } = req.params;

    console.log("🔄 Sync request:", accountId);

    const account = await CloudAccount.findOne({
      _id: accountId,
      userId: req.user.id,
    });

    if (!account) {
      console.log("❌ Account not found");
      return res.status(404).json({ message: "Account not found" });
    }

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    client.setCredentials({
      refresh_token: account.refreshToken,
    });

    const drive = google.drive({
      version: "v3",
      auth: client,
    });

    const about = await drive.about.get({
      fields: "storageQuota",
    });

    const { limit, usage } = about.data.storageQuota;

    account.storage = {
      total: limit,
      used: usage,
    };

    account.lastSyncedAt = new Date();
    account.status = "connected";

    await account.save();

    console.log("✅ Sync success:", account.email);

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Sync error:", err.message);
    res.status(500).json({ message: "Sync failed" });
  }
});

/* ===============================
   📊 STORAGE (OPTIONAL SINGLE FETCH)
=============================== */
router.get("/storage/:accountId", auth, async (req, res) => {
  try {
    const { accountId } = req.params;

    const account = await CloudAccount.findOne({
      _id: accountId,
      userId: req.user.id,
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    res.json(account.storage || { used: 0, total: 0 });
  } catch (err) {
    console.error("❌ Storage error:", err.message);
    res.status(500).json({ message: "Storage fetch failed" });
  }
});

router.get("/storage", auth, async (req, res) => {
  try {
    const accounts = await CloudAccount.find({
      userId: req.user.id,
      provider: "google",
    });

    if (!accounts.length) {
      return res.json([]);
    }

    const results = [];

    for (const account of accounts) {
      const client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      client.setCredentials({
        refresh_token: account.refreshToken,
      });

      const drive = google.drive({
        version: "v3",
        auth: client,
      });

      const about = await drive.about.get({
        fields: "storageQuota",
      });

      const { limit, usage } = about.data.storageQuota;

      account.storage = {
        used: usage,
        total: limit,
      };

      account.lastSyncedAt = new Date();
      await account.save();

      results.push({
        accountId: account._id,
        used: usage,
        total: limit,
      });
    }

    res.json(results);
  } catch (err) {
    console.error("❌ STORAGE ERROR:", err.message);
    res.status(500).json({ message: "Storage failed" });
  }
});

/* ===============================
   📁 GET FOLDERS FOR AN ACCOUNT
=============================== */
router.get("/folders/:accountId", auth, async (req, res) => {
  try {
    const { accountId } = req.params;
    const account = await CloudAccount.findOne({
      _id: accountId,
      userId: req.user.id,
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });

    const drive = google.drive({
      version: "v3",
      auth: client,
    });

    // Query non-trashed folders
    const response = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name)",
      pageSize: 100,
    });

    res.json(response.data.files || []);
  } catch (err) {
    console.error("❌ List folders error:", err.message);
    res.status(500).json({ message: "Failed to list folders" });
  }
});

export default router;