import { google } from "googleapis";
import streamifier from "streamifier";
import axios from "axios";
import CloudAccount from "../models/CloudAccount.js";
import { fileCache } from "../utils/cache.js";
import { logActivity } from "../utils/activityLogger.js";

const createOAuth2Client = (accessToken, refreshToken) => {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return client;
};

// Helper: Get storage info for an account to determine free space
const getAccountStorageInfo = async (account) => {
  const client = createOAuth2Client(account.accessToken, account.refreshToken);
  const drive = google.drive({ version: "v3", auth: client });
  try {
    const res = await drive.about.get({ fields: "storageQuota" });
    const { limit, usage } = res.data.storageQuota;
    return {
      accountId: account._id.toString(),
      accountEmail: account.email,
      freeSpace: parseInt(limit || 0) - parseInt(usage || 0),
    };
  } catch (err) {
    return { accountId: account._id.toString(), freeSpace: 0 }; // Assume 0 if error
  }
};

export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    const { accountId, destinationType = "drive", folderId } = req.body;
    const userId = req.user.id;

    if (!accountId) {
      return res.status(400).json({ message: "Account ID is required" });
    }

    let targetAccount = null;

    if (accountId === "smart") {
      // Find the account with the most free space
      const accounts = await CloudAccount.find({ userId, provider: "google" });
      if (!accounts.length) {
        return res.status(404).json({ message: "No connected accounts found" });
      }

      // Check storage for all concurrently
      const storageInfos = await Promise.all(accounts.map(getAccountStorageInfo));

      // Sort descending by free space
      storageInfos.sort((a, b) => b.freeSpace - a.freeSpace);
      const bestAccountId = storageInfos[0].accountId;
      targetAccount = accounts.find(a => a._id.toString() === bestAccountId);

    } else {
      // Manual selection
      targetAccount = await CloudAccount.findOne({ _id: accountId, userId });
      if (!targetAccount) {
        return res.status(404).json({ message: "Account not found" });
      }
    }

    // ================================
    // DROPBOX UPLOAD
    // ================================
    if (targetAccount.provider === "dropbox") {
      const fs = await import("fs");
      const fileStream = fs.createReadStream(req.file.path);
      
      console.log(`📤 Uploading file to Dropbox: ${req.file.originalname}`);

      const uploadUrl = "https://content.dropboxapi.com/2/files/upload";
      const dropboxArg = JSON.stringify({
        path: `/${req.file.originalname}`,
        mode: "add",
        autorename: true,
        mute: false,
        strict_conflict: false
      });

      let token = targetAccount.accessToken;
      let uploadResponse;

      const performUpload = async (accessToken, stream) => {
        return axios.post(uploadUrl, stream, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/octet-stream",
            "Dropbox-API-Arg": dropboxArg
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      };

      try {
        uploadResponse = await performUpload(token, fileStream);
      } catch (err) {
        if (err.response?.status === 401 && targetAccount.refreshToken) {
          console.log(`🔄 Refreshing Dropbox token for upload: ${targetAccount.email}`);
          const params = new URLSearchParams();
          params.append("grant_type", "refresh_token");
          params.append("refresh_token", targetAccount.refreshToken);
          params.append("client_id", process.env.DROPBOX_APP_KEY);
          params.append("client_secret", process.env.DROPBOX_APP_SECRET);

          const refreshRes = await axios.post("https://api.dropbox.com/oauth2/token", params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
          });
          
          token = refreshRes.data.access_token;
          targetAccount.accessToken = token;
          targetAccount.lastSyncedAt = new Date();
          await targetAccount.save();

          // Stream must be recreated since the first one is closed
          const retryStream = fs.createReadStream(req.file.path);
          uploadResponse = await performUpload(token, retryStream);
        } else {
          throw err;
        }
      }

      // Clean up temp file
      fs.unlinkSync(req.file.path);

      // Invalidate cache for Dropbox account
      const cachePrefix = `dropbox:files:${targetAccount._id.toString()}`;
      for (const key of fileCache.cache.keys()) {
        if (key.includes(cachePrefix)) {
          fileCache.cache.delete(key);
        }
      }
      fileCache.invalidateUserPhotos(userId);

      // ✅ Log real file_uploaded event
      await logActivity(userId, "file_uploaded",
        `Uploaded ${req.file.originalname} to Dropbox`,
        { provider: "dropbox", email: targetAccount.email, fileName: req.file.originalname, fileSize: req.file.size }
      );

      return res.json({
        message: "File uploaded successfully to Dropbox",
        file: uploadResponse.data,
        uploadedTo: targetAccount.email
      });
    }

    // ================================
    // ONEDRIVE UPLOAD
    // ================================
    if (targetAccount.provider === "onedrive") {
      const fs = await import("fs");
      const fileStream = fs.createReadStream(req.file.path);
      
      console.log(`📤 Uploading file to OneDrive: ${req.file.originalname}`);

      let uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(req.file.originalname)}:/content`;
      if (folderId && folderId !== "root") {
        uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}:/${encodeURIComponent(req.file.originalname)}:/content`;
      }

      let token = targetAccount.accessToken;
      let uploadResponse;

      const performOneDriveUpload = async (accessToken, stream) => {
        return axios.put(uploadUrl, stream, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": req.file.mimetype || "application/octet-stream"
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      };

      try {
        uploadResponse = await performOneDriveUpload(token, fileStream);
      } catch (err) {
        if (err.response?.status === 401 && targetAccount.refreshToken) {
          console.log(`🔄 Refreshing OneDrive token for upload: ${targetAccount.email}`);
          const { refreshOneDriveToken } = await import("../services/providers/onedrive.provider.js");
          token = await refreshOneDriveToken(targetAccount);
          
          const retryStream = fs.createReadStream(req.file.path);
          uploadResponse = await performOneDriveUpload(token, retryStream);
        } else {
          throw err;
        }
      }

      // Clean up temp file
      fs.unlinkSync(req.file.path);

      // Invalidate file cache
      fileCache.clear();

      // Log real file_uploaded event
      await logActivity(userId, "file_uploaded",
        `Uploaded ${req.file.originalname} to OneDrive`,
        { provider: "onedrive", email: targetAccount.email, fileName: req.file.originalname, fileSize: req.file.size }
      );

      return res.json({
        message: "File uploaded successfully to OneDrive",
        file: uploadResponse.data,
        uploadedTo: targetAccount.email
      });
    }

    // ================================
    // GOOGLE PHOTOS UPLOAD
    // ================================
    if (destinationType === "photos") {
      if (!req.file.mimetype.startsWith("image/") && !req.file.mimetype.startsWith("video/")) {
        const fs = await import("fs");
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "Only images and videos can be uploaded to Google Photos" });
      }

      const fs = await import("fs");
      const fileStream = fs.createReadStream(req.file.path);
      
      console.log(`📤 Direct streaming photo to Google Photos: ${req.file.originalname}`);

      // 1. Upload media bytes to Google Photos upload endpoint
      const uploadUrl = "https://photoslibrary.googleapis.com/v1/uploads";
      const uploadResponse = await axios.post(uploadUrl, fileStream, {
        headers: {
          Authorization: `Bearer ${targetAccount.accessToken}`,
          "Content-type": "application/octet-stream",
          "X-Goog-Upload-Content-Type": req.file.mimetype,
          "X-Goog-Upload-Protocol": "raw",
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const uploadToken = uploadResponse.data;

      // 2. Batch create the media item inside photos library
      const createUrl = "https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate";
      const createResponse = await axios.post(
        createUrl,
        {
          newMediaItems: [
            {
              description: `Uploaded via Unicloud (${req.file.originalname})`,
              simpleMediaItem: {
                uploadToken: uploadToken,
              },
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${targetAccount.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Clean up temp file
      fs.unlinkSync(req.file.path);

      const creationResults = createResponse.data?.newMediaItemResults || [];
      const result = creationResults[0];

      if (!result || result.status?.message) {
        throw new Error(result?.status?.message || "Failed to finalize media item in Google Photos");
      }

      // Invalidate cache for the user's photos
      fileCache.invalidateUserPhotos(userId);

      // ✅ Log real file_uploaded event (Google Photos)
      await logActivity(userId, "file_uploaded",
        `Uploaded photo ${req.file.originalname} to Google Photos`,
        { provider: "google", email: targetAccount.email, fileName: req.file.originalname, fileSize: req.file.size }
      );

      return res.json({
        message: "Photo uploaded successfully to Google Photos",
        file: result.mediaItem,
        uploadedTo: targetAccount.email,
      });
    }

    // ================================
    // GOOGLE DRIVE UPLOAD (Default)
    // ================================
    const client = createOAuth2Client(targetAccount.accessToken, targetAccount.refreshToken);
    const drive = google.drive({ version: "v3", auth: client });

    const fileMetadata = {
      name: req.file.originalname,
      parents: folderId && folderId !== "root" ? [folderId] : undefined,
    };

    const media = {
      mimeType: req.file.mimetype,
      body: (await import("fs")).createReadStream(req.file.path),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name, webViewLink",
    });

    // Clean up temp file
    (await import("fs")).unlinkSync(req.file.path);

    // Invalidate cache for the target cloud account
    fileCache.invalidateAccount(targetAccount._id.toString());
    fileCache.invalidateUserPhotos(userId);

    // ✅ Log real file_uploaded event (Google Drive)
    await logActivity(userId, "file_uploaded",
      `Uploaded ${req.file.originalname} to Google Drive`,
      { provider: "google", email: targetAccount.email, fileName: req.file.originalname, fileSize: req.file.size }
    );

    res.json({
      message: "File uploaded successfully",
      file: response.data,
      uploadedTo: targetAccount.email
    });

  } catch (err) {
    try {
      const fs = await import("fs");
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (_) {}
    
    console.error("Upload Error:", err);
    res.status(500).json({ message: "Failed to upload file", error: String(err.message) });
  }
};
