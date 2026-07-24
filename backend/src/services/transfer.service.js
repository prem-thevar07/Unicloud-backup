import { google } from "googleapis";
import axios from "axios";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import CloudAccount from "../models/CloudAccount.js";
import { logActivity } from "../utils/activityLogger.js";

/* ==========================================
   1️⃣ GET FILE READABLE STREAM FROM SOURCE
========================================== */
export const getSourceFileStream = async (account, fileId) => {
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

    // Fetch file metadata to get name
    const metaRes = await drive.files.get({ fileId, fields: "id, name, mimeType, size" });
    const fileName = metaRes.data.name || "file";
    const mimeType = metaRes.data.mimeType || "application/octet-stream";

    // Get readable stream
    const streamRes = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    return {
      stream: streamRes.data,
      fileName,
      mimeType,
      size: metaRes.data.size ? Number(metaRes.data.size) : null,
    };
  }

  if (provider === "dropbox") {
    const token = account.accessToken;
    // Get temporary direct download link
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

    const streamRes = await axios.get(downloadUrl, { responseType: "stream" });

    return {
      stream: streamRes.data,
      fileName,
      mimeType: "application/octet-stream",
      size: linkRes.data.metadata.size || null,
    };
  }

  if (provider === "onedrive") {
    const token = account.accessToken;
    // Fetch file item details
    const itemRes = await axios.get(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const fileName = itemRes.data.name || "file";
    const downloadUrl = itemRes.data["@microsoft.graph.downloadUrl"];

    let streamRes;
    if (downloadUrl) {
      streamRes = await axios.get(downloadUrl, { responseType: "stream" });
    } else {
      streamRes = await axios.get(
        `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "stream",
        }
      );
    }

    return {
      stream: streamRes.data,
      fileName,
      mimeType: "application/octet-stream",
      size: itemRes.data.size || null,
    };
  }

  if (provider === "s3") {
    const client = new S3Client({
      region: account.s3Region || "us-east-1",
      credentials: {
        accessKeyId: account.s3AccessKeyId,
        secretAccessKey: account.s3SecretAccessKey,
      },
    });

    const command = new GetObjectCommand({
      Bucket: account.s3BucketName,
      Key: fileId,
    });

    const s3Res = await client.send(command);
    const fileName = fileId.split("/").pop() || "file";

    return {
      stream: s3Res.Body,
      fileName,
      mimeType: s3Res.ContentType || "application/octet-stream",
      size: s3Res.ContentLength || null,
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

    const streamRes = await axios.get(
      `https://api.box.com/2.0/files/${fileId}/content`,
      {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "stream",
      }
    );

    return {
      stream: streamRes.data,
      fileName,
      mimeType: "application/octet-stream",
      size: metaRes.data.size || null,
    };
  }

  throw new Error(`Unsupported source provider: ${provider}`);
};

/* ==========================================
   2️⃣ UPLOAD STREAM TO TARGET PROVIDER
========================================== */
export const uploadFileStreamToTarget = async (account, fileName, fileStream, targetFolderId) => {
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

    const requestBody = { name: fileName };
    if (targetFolderId && targetFolderId !== "root" && targetFolderId !== "/") {
      requestBody.parents = [targetFolderId];
    }

    const createRes = await drive.files.create({
      requestBody,
      media: { body: fileStream },
      fields: "id, name, mimeType, size",
    });

    return createRes.data;
  }

  if (provider === "dropbox") {
    const token = account.accessToken;

    const chunks = [];
    for await (const chunk of fileStream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const cleanFolder = targetFolderId && targetFolderId !== "/" && targetFolderId !== "root"
      ? targetFolderId.startsWith("/") ? targetFolderId : `/${targetFolderId}`
      : "";
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
    const chunks = [];
    for await (const chunk of fileStream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const folderPath = targetFolderId && targetFolderId !== "root" && targetFolderId !== "/"
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
    const client = new S3Client({
      region: account.s3Region || "us-east-1",
      credentials: {
        accessKeyId: account.s3AccessKeyId,
        secretAccessKey: account.s3SecretAccessKey,
      },
    });

    const chunks = [];
    for await (const chunk of fileStream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const cleanFolder = targetFolderId && targetFolderId !== "root" && targetFolderId !== "/"
      ? targetFolderId.replace(/^\/+|\/+$/g, "") + "/"
      : "";
    const s3Key = `${cleanFolder}${fileName}`;

    const command = new PutObjectCommand({
      Bucket: account.s3BucketName,
      Key: s3Key,
      Body: buffer,
    });

    await client.send(command);
    return { id: s3Key, name: fileName };
  }

  if (provider === "box") {
    const token = account.accessToken;
    const chunks = [];
    for await (const chunk of fileStream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const folderId = targetFolderId && targetFolderId !== "root" && targetFolderId !== "/"
      ? targetFolderId
      : "0";

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
    const client = new S3Client({
      region: account.s3Region || "us-east-1",
      credentials: {
        accessKeyId: account.s3AccessKeyId,
        secretAccessKey: account.s3SecretAccessKey,
      },
    });

    const command = new DeleteObjectCommand({
      Bucket: account.s3BucketName,
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

  // Step 1: Read stream from source
  const sourceData = await getSourceFileStream(sourceAccount, sourceFileId);

  // Step 2: Write stream to target
  const uploadResult = await uploadFileStreamToTarget(
    targetAccount,
    sourceData.fileName,
    sourceData.stream,
    targetFolderId
  );

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
    `${operation === "move" ? "Moved" : "Copied"} "${sourceData.fileName}" from ${sourceAccount.provider} (${sourceAccount.email}) to ${targetAccount.provider} (${targetAccount.email})`
  );

  return {
    success: true,
    operation,
    fileName: sourceData.fileName,
    sourceProvider: sourceAccount.provider,
    targetProvider: targetAccount.provider,
    targetFile: uploadResult,
  };
};
