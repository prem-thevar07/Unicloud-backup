import { google } from "googleapis";
import axios from "axios";
import { Readable } from "stream";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import CloudAccount from "../models/CloudAccount.js";
import { logActivity } from "../utils/activityLogger.js";

import { refreshGoogleToken } from "./providers/google.provider.js";
import { refreshBoxToken } from "./providers/box.provider.js";
import { refreshDropboxToken } from "./providers/dropbox.provider.js";
import { refreshOneDriveToken } from "./providers/onedrive.provider.js";

const refreshAccountTokenIfPossible = async (account) => {
  try {
    if (account.provider === "google" && account.refreshToken) {
      await refreshGoogleToken(account);
    } else if (account.provider === "box" && account.refreshToken) {
      await refreshBoxToken(account);
    } else if (account.provider === "dropbox" && account.refreshToken) {
      await refreshDropboxToken(account);
    } else if (account.provider === "onedrive" && account.refreshToken) {
      await refreshOneDriveToken(account);
    }
  } catch (err) {
    console.error(`❌ Token refresh failed for ${account.provider}:`, err.message);
  }
};

const getS3Details = (account) => {
  const getCred = (key) => (account.credentials?.get ? account.credentials.get(key) : account.credentials?.[key]);
  const accessKeyId = account.s3AccessKeyId || getCred("accessKeyId") || account.accessToken;
  const secretAccessKey = account.s3SecretAccessKey || getCred("secretAccessKey") || account.refreshToken;
  const region = account.s3Region || getCred("region") || "us-east-1";
  const bucketName = account.s3BucketName || account.bucketName || getCred("bucketName") || getCred("s3BucketName") || getCred("bucket") || "";

  const client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return { client, bucketName };
};

/* ==========================================
   1️⃣ READ FILE BUFFER FROM SOURCE PROVIDER
========================================== */
export const getSourceFileBuffer = async (account, fileId) => {
  let attempts = 0;
  while (attempts < 2) {
    try {
      return await getSourceFileBufferInternal(account, fileId);
    } catch (err) {
      const is401 = err.response?.status === 401 || err.status === 401;
      if (is401 && attempts === 0 && account.refreshToken) {
        console.warn(`⚠️ 401 reading source ${account.provider}, refreshing token...`);
        await refreshAccountTokenIfPossible(account);
        attempts++;
      } else {
        throw err;
      }
    }
  }
};

const getSourceFileBufferInternal = async (account, fileId) => {
  const provider = account.provider;

  if (provider === "google") {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    const metaRes = await drive.files.get({ fileId, fields: "id, name, mimeType, size" });
    const fileName = metaRes.data.name || "file";
    const mimeType = metaRes.data.mimeType || "application/octet-stream";

    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const buffer = Buffer.from(res.data);

    if (buffer.length === 0) {
      throw new Error(`Source Google Drive file "${fileName}" returned 0 bytes.`);
    }

    return { buffer, fileName, mimeType, size: buffer.length };
  }

  if (provider === "dropbox") {
    const token = account.accessToken;
    const linkRes = await axios.post(
      "https://api.dropboxapi.com/2/files/get_temporary_link",
      { path: fileId },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const downloadUrl = linkRes.data.link;
    const fileName = linkRes.data.metadata.name || "file";

    const res = await axios.get(downloadUrl, { responseType: "arraybuffer" });
    const buffer = Buffer.from(res.data);

    if (buffer.length === 0) {
      throw new Error(`Source Dropbox file "${fileName}" returned 0 bytes.`);
    }

    return {
      buffer,
      fileName,
      mimeType: "application/octet-stream",
      size: buffer.length,
    };
  }

  if (provider === "onedrive") {
    const token = account.accessToken;
    const itemRes = await axios.get(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const fileName = itemRes.data.name || "file";
    const downloadUrl = itemRes.data["@microsoft.graph.downloadUrl"];

    let res;
    if (downloadUrl) {
      res = await axios.get(downloadUrl, { responseType: "arraybuffer" });
    } else {
      res = await axios.get(
        `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "arraybuffer",
        }
      );
    }
    const buffer = Buffer.from(res.data);

    if (buffer.length === 0) {
      throw new Error(`Source OneDrive file "${fileName}" returned 0 bytes.`);
    }

    return {
      buffer,
      fileName,
      mimeType: "application/octet-stream",
      size: buffer.length,
    };
  }

  if (provider === "s3") {
    const { client, bucketName } = getS3Details(account);

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileId,
    });

    const s3Res = await client.send(command);
    const fileName = fileId.split("/").pop() || "file";
    const chunks = [];
    for await (const chunk of s3Res.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      throw new Error(`Source S3 object "${fileName}" returned 0 bytes.`);
    }

    return {
      buffer,
      fileName,
      mimeType: s3Res.ContentType || "application/octet-stream",
      size: buffer.length,
    };
  }

  if (provider === "box") {
    const token = account.accessToken;
    const metaRes = await axios.get(
      `https://api.box.com/2.0/files/${fileId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const fileName = metaRes.data.name || "file";

    const res = await axios.get(
      `https://api.box.com/2.0/files/${fileId}/content`,
      {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "arraybuffer",
      }
    );
    const buffer = Buffer.from(res.data);

    if (buffer.length === 0) {
      throw new Error(`Source Box file "${fileName}" returned 0 bytes.`);
    }

    return {
      buffer,
      fileName,
      mimeType: "application/octet-stream",
      size: buffer.length,
    };
  }

  throw new Error(`Unsupported source provider: ${provider}`);
};

/* ==========================================
   2️⃣ UPLOAD FILE BUFFER TO TARGET PROVIDER
========================================== */
export const uploadFileBufferToTarget = async (account, fileName, buffer, targetFolderId, targetFolderPath = null) => {
  let attempts = 0;
  while (attempts < 2) {
    try {
      return await uploadFileBufferToTargetInternal(account, fileName, buffer, targetFolderId, targetFolderPath);
    } catch (err) {
      const is401 = err.response?.status === 401 || err.status === 401;
      if (is401 && attempts === 0 && account.refreshToken) {
        console.warn(`⚠️ 401 uploading to target ${account.provider}, refreshing token...`);
        await refreshAccountTokenIfPossible(account);
        attempts++;
      } else {
        throw err;
      }
    }
  }
};

const uploadFileBufferToTargetInternal = async (account, fileName, buffer, targetFolderId, targetFolderPath = null) => {
  const provider = account.provider;

  if (!buffer || buffer.length === 0) {
    throw new Error("Cannot upload empty 0-byte buffer to target drive.");
  }

  if (provider === "google") {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    const requestBody = { name: fileName };
    if (targetFolderId && targetFolderId !== "root" && targetFolderId !== "/" && !targetFolderId.startsWith("/")) {
      requestBody.parents = [targetFolderId];
    }

    const stream = Readable.from(buffer);
    const createRes = await drive.files.create({
      requestBody,
      media: { body: stream },
      fields: "id, name, mimeType, size",
    });

    return createRes.data;
  }

  if (provider === "dropbox") {
    const token = account.accessToken;
    let cleanFolder = "";
    if (targetFolderPath && targetFolderPath !== "/" && targetFolderPath !== "root") {
      cleanFolder = targetFolderPath.startsWith("/") ? targetFolderPath : `/${targetFolderPath}`;
    } else if (targetFolderId && targetFolderId !== "/" && targetFolderId !== "root" && !targetFolderId.startsWith("id:")) {
      cleanFolder = targetFolderId.startsWith("/") ? targetFolderId : `/${targetFolderId}`;
    }

    const dropboxPath = `${cleanFolder}/${fileName}`.replace(/\/+/g, "/");

    const uploadRes = await axios.post(
      "https://content.dropboxapi.com/2/files/upload",
      buffer,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Dropbox-API-Arg": JSON.stringify({
            path: dropboxPath,
            mode: "add",
            autorename: true,
            mute: false,
          }),
          "Content-Type": "application/octet-stream",
        },
      }
    );

    return uploadRes.data;
  }

  if (provider === "onedrive") {
    const token = account.accessToken;
    const folderPath = targetFolderId && targetFolderId !== "root" && targetFolderId !== "/" && !targetFolderId.startsWith("/")
      ? `/items/${targetFolderId}:`
      : "/root:";

    const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive${folderPath}/${encodeURIComponent(fileName)}:/content`;

    const uploadRes = await axios.put(uploadUrl, buffer, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
    });

    return uploadRes.data;
  }

  if (provider === "s3") {
    const { client, bucketName } = getS3Details(account);

    let cleanFolder = "";
    if (targetFolderPath && targetFolderPath !== "/" && targetFolderPath !== "root") {
      cleanFolder = targetFolderPath.replace(/^\/+|\/+$/g, "") + "/";
    } else if (targetFolderId && targetFolderId !== "root" && targetFolderId !== "/") {
      cleanFolder = targetFolderId.replace(/^\/+|\/+$/g, "") + "/";
    }
    const s3Key = `${cleanFolder}${fileName}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: buffer,
    });

    await client.send(command);
    return { id: s3Key, name: fileName };
  }

  if (provider === "box") {
    const token = account.accessToken;
    let folderId = "0";
    if (targetFolderId && targetFolderId !== "root" && targetFolderId !== "/" && !targetFolderId.startsWith("/")) {
      folderId = targetFolderId;
    }

    const FormDataModule = (await import("form-data")).default;
    const form = new FormDataModule();
    form.append("attributes", JSON.stringify({ name: fileName, parent: { id: folderId } }));
    form.append("file", buffer, { filename: fileName });

    const uploadRes = await axios.post("https://upload.box.com/api/2.0/files/content", form, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
    });

    return uploadRes.data;
  }

  throw new Error(`Unsupported target provider: ${provider}`);
};

/* ==========================================
   3️⃣ DELETE FILE FROM SOURCE PROVIDER (FOR MOVE)
========================================== */
export const deleteSourceFile = async (account, fileId) => {
  const provider = account.provider;

  if (provider === "google") {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    await drive.files.delete({ fileId });
    return true;
  }

  if (provider === "dropbox") {
    const token = account.accessToken;
    await axios.post(
      "https://api.dropboxapi.com/2/files/delete_v2",
      { path: fileId },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    return true;
  }

  if (provider === "onedrive") {
    const token = account.accessToken;
    await axios.delete(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return true;
  }

  if (provider === "s3") {
    const { client, bucketName } = getS3Details(account);

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: fileId,
    });

    await client.send(command);
    return true;
  }

  if (provider === "box") {
    const token = account.accessToken;
    await axios.delete(`https://api.box.com/2.0/files/${fileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return true;
  }

  return false;
};

/* ==========================================
   4️⃣ EXECUTE CROSS-CLOUD FILE TRANSFER
========================================== */
export const executeTransfer = async ({
  userId,
  sourceAccountId,
  sourceFileId,
  targetAccountId,
  targetFolderId = "root",
  targetFolderPath = null,
  operation = "copy", // "copy" | "move"
}) => {
  const sourceAccount = await CloudAccount.findOne({ _id: sourceAccountId, userId });
  if (!sourceAccount) {
    throw new Error("Source cloud account not found or access denied.");
  }

  const targetAccount = await CloudAccount.findOne({ _id: targetAccountId, userId });
  if (!targetAccount) {
    throw new Error("Target cloud account not found or access denied.");
  }

  console.log(`🚀 Starting ${operation.toUpperCase()} transfer from ${sourceAccount.provider} (${sourceAccount.email}) to ${targetAccount.provider} (${targetAccount.email})...`);

  // Step 1: Read full binary buffer from source
  const sourceData = await getSourceFileBuffer(sourceAccount, sourceFileId);

  console.log(`📥 Read ${sourceData.buffer.length} bytes for "${sourceData.fileName}" from ${sourceAccount.provider}. Uploading to ${targetAccount.provider}...`);

  // Step 2: Write buffer to target
  const uploadResult = await uploadFileBufferToTarget(
    targetAccount,
    sourceData.fileName,
    sourceData.buffer,
    targetFolderId,
    targetFolderPath
  );

  console.log(`✅ Successfully uploaded ${sourceData.buffer.length} bytes to ${targetAccount.provider}!`);

  // Step 3: If Move, delete original source file
  if (operation === "move") {
    try {
      await deleteSourceFile(sourceAccount, sourceFileId);
      console.log(`🗑️ Deleted source file "${sourceData.fileName}" from ${sourceAccount.provider}.`);
    } catch (delErr) {
      console.error(`⚠️ File copied to target, but failed to delete source file: ${delErr.message}`);
    }
  }

  // Step 4: Log activity
  const actionText = operation === "move" ? "file_moved" : "file_copied";
  await logActivity(
    userId,
    actionText,
    `${operation === "move" ? "Moved" : "Copied"} "${sourceData.fileName}" (${(sourceData.buffer.length / 1024).toFixed(1)} KB) from ${sourceAccount.provider} (${sourceAccount.email}) to ${targetAccount.provider} (${targetAccount.email})`
  );

  return {
    success: true,
    operation,
    fileName: sourceData.fileName,
    bytesTransferred: sourceData.buffer.length,
    sourceProvider: sourceAccount.provider,
    targetProvider: targetAccount.provider,
    targetFile: uploadResult,
  };
};
