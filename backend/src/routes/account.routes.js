import express from "express";
import auth from "../middleware/auth.middleware.js";
import CloudAccount from "../models/CloudAccount.js";
import { google } from "googleapis";
import { logActivity } from "../utils/activityLogger.js";

const router = express.Router();

/* ===============================
   📦 GET ALL ACCOUNTS
=============================== */
router.get("/", auth, async (req, res) => {
  try {
    console.log("📦 Fetching accounts for:", req.user.id);

    const accounts = await CloudAccount.find({
      userId: req.user.id,
    });

    res.json(accounts);
  } catch (err) {
    console.error("❌ Fetch accounts error:", err.message);
    res.status(500).json({ message: "Failed to fetch accounts" });
  }
});

/* ===============================
   🔄 SYNC ACCOUNT (🔥 FIX)
=============================== */
router.post("/:id/sync", auth, async (req, res) => {
  try {
    const accountId = req.params.id;

    console.log("🔄 Syncing account:", accountId);

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

    // ✅ Log real sync event
    const providerLabel = account.provider === "google" ? "Google Drive" : account.provider === "dropbox" ? "Dropbox" : account.provider === "s3" ? "Amazon S3" : "OneDrive";
    await logActivity(
      req.user.id,
      "account_synced",
      `Synced ${providerLabel} account`,
      { provider: account.provider, email: account.email }
    );

    console.log("✅ Sync success");

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Sync error:", err.message);
    res.status(500).json({ message: "Sync failed" });
  }
});

/* ===============================
   ❌ DELETE ACCOUNT
=============================== */
router.delete("/:id", auth, async (req, res) => {
  try {
    const account = await CloudAccount.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (account) {
      // ✅ Log real disconnect event before deleting
      const providerLabel = account.provider === "google" ? "Google Drive" : account.provider === "dropbox" ? "Dropbox" : account.provider === "s3" ? "Amazon S3" : "OneDrive";
      await logActivity(
        req.user.id,
        "account_disconnected",
        `Disconnected ${providerLabel} account (${account.email})`,
        { provider: account.provider, email: account.email }
      );
    }

    await CloudAccount.deleteOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Delete error:", err.message);
    res.status(500).json({ message: "Delete failed" });
  }
});

export default router;