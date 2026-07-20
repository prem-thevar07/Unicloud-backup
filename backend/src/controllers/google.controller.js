import { google } from "googleapis";
import CloudAccount from "../models/CloudAccount.js";
import { normalizeGoogleFile } from "../utils/fileNormalizer.js";
import { logActivity } from "../utils/activityLogger.js";

/* ===============================
   GOOGLE OAUTH CALLBACK
=============================== */
export const googleCallback = async (req, res) => {
  try {
    console.log("🔁 Google OAuth callback triggered");

    const { code, state } = req.query;

    if (!state) {
      return res.status(400).send("Missing userId in OAuth state");
    }

    if (!code) {
      return res.status(400).send("Missing OAuth authorization code");
    }

    /* ===============================
       CREATE CLIENT
    =============================== */
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    /* ===============================
       EXCHANGE CODE
    =============================== */
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    console.log("✅ Tokens received");

    /* ===============================
       GET USER EMAIL (🔥 CRITICAL)
    =============================== */
    const oauth2 = google.oauth2({
      auth: client,
      version: "v2",
    });

    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    console.log("📧 Google account:", email);

    /* ===============================
       HANDLE REFRESH TOKEN SAFELY
    =============================== */
    const existingAccount = await CloudAccount.findOne({
      userId: state,
      provider: "google",
      email,
    });

    const refreshToken =
      tokens.refresh_token || existingAccount?.refreshToken || null;

    if (!refreshToken) {
      console.warn("⚠️ No refresh token received");
    }

    /* ===============================
       FETCH STORAGE (SAFE)
    =============================== */
    let storage = { used: 0, total: 0 };

    try {
      const drive = google.drive({ version: "v3", auth: client });

      const about = await drive.about.get({
        fields: "storageQuota",
      });

      storage = {
        used: Number(about.data.storageQuota.usage || 0),
        total: Number(about.data.storageQuota.limit || 0),
      };

      console.log("📊 Storage:", storage);
    } catch (err) {
      console.warn("⚠️ Storage fetch skipped:", err.message);
    }

    /* ===============================
       SAVE ACCOUNT (MULTI-ACCOUNT FIX 🔥)
    =============================== */
    await CloudAccount.findOneAndUpdate(
      {
        userId: state,
        provider: "google",
        email, // 🔥 UNIQUE KEY
      },
      {
        userId: state,
        provider: "google",
        email,
        accessToken: tokens.access_token,
        refreshToken,
        scope: tokens.scope ? tokens.scope.split(" ") : [],

        status: "connected",
        storage,
        lastSyncedAt: new Date(),
      },
      {
        upsert: true,
        new: true,
      }
    );

    console.log("💾 Account saved:", email);

    // ✅ Log real account_connected event
    const isNew = !await CloudAccount.findOne({ userId: state, provider: "google", email });
    await logActivity(state, "account_connected",
      `Connected Google Drive account (${email})`,
      { provider: "google", email }
    );

    // ✅ Check and log storage warning (> 80%)
    if (storage.total > 0) {
      const pct = Math.round((storage.used / storage.total) * 100);
      if (pct >= 80) {
        await logActivity(state, "storage_warning",
          `Google Drive (${email}) is at ${pct}% capacity`,
          { provider: "google", email, storagePercent: pct }
        );
      }
    }

    /* ===============================
       REDIRECT
    =============================== */
    res.redirect(`${process.env.FRONTEND_URL}/manage-accounts`);
  } catch (err) {
    console.error("❌ Google OAuth Error:", err.message);
    res.status(500).send("Google OAuth failed");
  }
};

/* ===============================
   FETCH GOOGLE FILES (MULTI ACCOUNT)
=============================== */
export const getGoogleFiles = async (req, res) => {
  try {
    console.log("📂 Fetching Google files");

    const userId = req.user.id;

    const accounts = await CloudAccount.find({
      userId,
      provider: "google",
    });

    if (!accounts.length) {
      console.log("⚠️ No Google accounts");
      return res.json([]);
    }

    let allFiles = [];

    /* ===============================
       PARALLEL FETCH (FASTER 🔥)
    =============================== */
    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          console.log("👉 Fetching:", account.email);

          const client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
          );

          client.setCredentials({
            access_token: account.accessToken,
            refresh_token: account.refreshToken,
          });

          const drive = google.drive({ version: "v3", auth: client });

          const response = await Promise.race([
            drive.files.list({
              pageSize: 20,
              fields:
                "files(id,name,mimeType,size,thumbnailLink,webViewLink,createdTime)",
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 5000)
            ),
          ]);

          const files = response.data.files || [];

          return files.map((file) =>
            normalizeGoogleFile(file, account._id, account.email)
          );
        } catch (err) {
          console.error("❌ Failed:", account.email);
          return [];
        }
      })
    );

    allFiles = results.flat();

    console.log("✅ Total files:", allFiles.length);

    res.json(allFiles);
  } catch (err) {
    console.error("❌ Fetch Google Files Error:", err.message);
    res.json([]);
  }
};