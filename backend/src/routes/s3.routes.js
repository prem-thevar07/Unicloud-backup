import express from "express";
import auth from "../middleware/auth.middleware.js";
import CloudAccount from "../models/CloudAccount.js";
import { S3Client, ListBucketsCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logActivity } from "../utils/activityLogger.js";

const router = express.Router();

/* ===============================
   🪣 LIST AVAILABLE BUCKETS
=============================== */
router.post("/buckets", auth, async (req, res) => {
  try {
    const { accessKeyId, secretAccessKey, region } = req.body;

    if (!accessKeyId || !secretAccessKey) {
      return res.status(400).json({ message: "Access Key and Secret Key are required" });
    }

    const client = new S3Client({
      region: region || "us-east-1",
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const command = new ListBucketsCommand({});
    const data = await client.send(command);
    const buckets = (data.Buckets || []).map((b) => b.Name);

    res.json({ buckets });
  } catch (err) {
    console.error("❌ S3 list buckets error:", err.message);
    res.status(400).json({ message: "Failed to list buckets: " + err.message });
  }
});

/* ===============================
   🔌 CONNECT S3 ACCOUNT
=============================== */
router.post("/connect", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { email, accessKeyId, secretAccessKey, region, bucketName } = req.body;

    if (!email || !accessKeyId || !secretAccessKey || !bucketName) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const targetRegion = region || "us-east-1";

    // Validate connection and fetch initial storage size
    const client = new S3Client({
      region: targetRegion,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: 1000,
    });
    const listRes = await client.send(listCommand);
    const totalSize = (listRes.Contents || []).reduce((sum, item) => sum + (item.Size || 0), 0);

    // Save to DB
    const account = await CloudAccount.findOneAndUpdate(
      { userId, provider: "s3", email },
      {
        status: "connected",
        credentials: {
          accessKeyId,
          secretAccessKey,
          region: targetRegion,
          bucketName,
        },
        storage: {
          used: totalSize,
          total: 50 * 1024 * 1024 * 1024, // 50 GB default quota display
        },
      },
      { new: true, upsert: true }
    );

    // ✅ Log real account_connected event
    await logActivity(userId, "account_connected",
      `Connected Amazon S3 account (${email})`,
      { provider: "s3", email }
    );

    res.json({ success: true, account });
  } catch (err) {
    console.error("❌ S3 connect error:", err.message);
    res.status(400).json({ message: "Failed to connect bucket: " + err.message });
  }
});

/* ===============================
   📥 GENERATE DOWNLOAD / PRE-SIGNED URL
=============================== */
router.get("/download/:id", auth, async (req, res) => {
  try {
    const accountId = req.params.id;
    const { fileId } = req.query; // fileId is the S3 object Key!

    if (!fileId) {
      return res.status(400).json({ message: "File ID (Key) is required" });
    }

    const account = await CloudAccount.findOne({
      _id: accountId,
      userId: req.user.id,
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const getCred = (key) => account.credentials?.get ? account.credentials.get(key) : account.credentials?.[key];
    const accessKeyId = getCred("accessKeyId");
    const secretAccessKey = getCred("secretAccessKey");
    const region = getCred("region") || "us-east-1";
    const bucket = getCred("bucketName");

    const client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const ext = fileId.split(".").pop().toLowerCase();
    const mimeMap = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      pdf: "application/pdf",
      txt: "text/plain",
      mp3: "audio/mpeg",
      mp4: "video/mp4",
      html: "text/html"
    };
    const contentType = mimeMap[ext] || "application/octet-stream";

    const isAjax = req.headers.authorization;
    const commandParams = {
      Bucket: bucket,
      Key: fileId,
    };

    if (isAjax) {
      // Force download for AJAX request (download button)
      commandParams.ResponseContentDisposition = `attachment; filename="${fileId.split("/").pop()}"`;
    } else {
      // Inline rendering inside browser tab (open button)
      commandParams.ResponseContentDisposition = "inline";
      commandParams.ResponseContentType = contentType;
    }

    const command = new GetObjectCommand(commandParams);

    const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });

    // Return secure URL in JSON if requested via Axios (for download button), 
    // otherwise redirect directly for direct browser tab opens (for open button)
    if (req.headers.authorization) {
      res.json({ link: signedUrl });
    } else {
      res.redirect(signedUrl);
    }
  } catch (err) {
    console.error("❌ S3 download link error:", err.message);
    res.status(500).json({ message: "Failed to retrieve S3 link" });
  }
});

/* ===============================
   🔄 MANUAL SYNC ACCOUNT
=============================== */
router.post("/sync/:id", auth, async (req, res) => {
  try {
    const accountId = req.params.id;
    const account = await CloudAccount.findOne({ _id: accountId, userId: req.user.id });
    if (!account) return res.status(404).json({ message: "Account not found" });

    // Recalculate bucket storage size
    const getCred = (key) => account.credentials?.get ? account.credentials.get(key) : account.credentials?.[key];
    const accessKeyId = getCred("accessKeyId");
    const secretAccessKey = getCred("secretAccessKey");
    const region = getCred("region") || "us-east-1";
    const bucketName = getCred("bucketName");

    const client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
    const command = new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 1000 });
    const listRes = await client.send(command);
    const totalSize = (listRes.Contents || []).reduce((sum, item) => sum + (item.Size || 0), 0);

    account.storage.used = totalSize;
    account.lastSyncedAt = new Date();
    await account.save();

    // ✅ Log real account_synced event
    await logActivity(req.user.id, "account_synced",
      `Synced Amazon S3 account`,
      { provider: "s3", email: account.email }
    );

    res.json({ success: true, account });
  } catch (err) {
    console.error("❌ S3 sync error:", err.message);
    res.status(400).json({ message: "Sync failed: " + err.message });
  }
});

export default router;
