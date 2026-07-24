import { google } from "googleapis";
import axios from "axios";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import CloudAccount from "../models/CloudAccount.js";
import { refreshGoogleToken } from "./providers/google.provider.js";
import { refreshBoxToken } from "./providers/box.provider.js";
import { refreshDropboxToken } from "./providers/dropbox.provider.js";
import { refreshOneDriveToken } from "./providers/onedrive.provider.js";
import { logActivity } from "../utils/activityLogger.js";
import { fileCache } from "../utils/cache.js";

const createGoogleFolderInternal = async (account, token, folderName, parentFolderId) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ access_token: token });
  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const requestBody = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentFolderId && parentFolderId !== "root" && parentFolderId !== "/" && !parentFolderId.startsWith("/")) {
    requestBody.parents = [parentFolderId];
  }

  const res = await drive.files.create({
    requestBody,
    fields: "id, name, mimeType",
  });

  return {
    id: res.data.id,
    name: res.data.name,
    path: `/${res.data.name}`,
    provider: "google",
    accountId: String(account._id),
  };
};

const createDropboxFolderInternal = async (account, token, folderName, parentFolderPath) => {
  let cleanParent = "";
  if (parentFolderPath && parentFolderPath !== "/" && parentFolderPath !== "root") {
    cleanParent = parentFolderPath.startsWith("/") ? parentFolderPath : `/${parentFolderPath}`;
  }
  const fullPath = `${cleanParent}/${folderName}`.replace(/\/+/g, "/");

  const res = await axios.post(
    "https://api.dropboxapi.com/2/files/create_folder_v2",
    { path: fullPath, autorename: true },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  const folderObj = res.data.metadata;
  return {
    id: folderObj.id || folderObj.path_lower,
    name: folderObj.name,
    path: folderObj.path_display || fullPath,
    provider: "dropbox",
    accountId: String(account._id),
  };
};

const createOneDriveFolderInternal = async (account, token, folderName, parentFolderId) => {
  const parentPath = parentFolderId && parentFolderId !== "root" && parentFolderId !== "/" && !parentFolderId.startsWith("/")
    ? `/items/${parentFolderId}/children`
    : "/root/children";

  const res = await axios.post(
    `https://graph.microsoft.com/v1.0/me/drive${parentPath}`,
    {
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  return {
    id: res.data.id,
    name: res.data.name,
    path: `/${res.data.name}`,
    provider: "onedrive",
    accountId: String(account._id),
  };
};

const createBoxFolderInternal = async (account, token, folderName, parentFolderId) => {
  let pId = "0";
  if (parentFolderId && parentFolderId !== "root" && parentFolderId !== "/" && !parentFolderId.startsWith("/")) {
    pId = parentFolderId;
  }

  const res = await axios.post(
    "https://api.box.com/2.0/folders",
    {
      name: folderName,
      parent: { id: pId },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  return {
    id: res.data.id,
    name: res.data.name,
    path: `/${res.data.name}`,
    provider: "box",
    accountId: String(account._id),
  };
};

const createS3FolderInternal = async (account, folderName, parentFolderPath) => {
  const getCred = (key) => (account.credentials?.get ? account.credentials.get(key) : account.credentials?.[key]);
  const accessKeyId = account.s3AccessKeyId || getCred("accessKeyId") || account.accessToken;
  const secretAccessKey = account.s3SecretAccessKey || getCred("secretAccessKey") || account.refreshToken;
  const region = account.s3Region || getCred("region") || "us-east-1";
  const bucketName = account.s3BucketName || account.bucketName || getCred("bucketName") || getCred("s3BucketName") || getCred("bucket") || "";

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  let cleanParent = "";
  if (parentFolderPath && parentFolderPath !== "/" && parentFolderPath !== "root") {
    cleanParent = parentFolderPath.replace(/^\/+|\/+$/g, "") + "/";
  }
  const folderKey = `${cleanParent}${folderName}/`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: folderKey,
    Body: "",
  });

  await client.send(command);

  return {
    id: folderKey,
    name: folderName,
    path: folderKey,
    provider: "s3",
    accountId: String(account._id),
  };
};

export const createRemoteFolder = async (userId, { accountId, folderName, parentFolderId, parentFolderPath }) => {
  const account = await CloudAccount.findOne({ _id: accountId, userId });
  if (!account) {
    throw new Error("Account not found");
  }

  const provider = account.provider;
  let createdFolder = null;

  try {
    if (provider === "google") {
      let token = account.accessToken;
      try {
        createdFolder = await createGoogleFolderInternal(account, token, folderName, parentFolderId);
      } catch (err) {
        if ((err.status === 401 || err.response?.status === 401) && account.refreshToken) {
          token = await refreshGoogleToken(account);
          createdFolder = await createGoogleFolderInternal(account, token, folderName, parentFolderId);
        } else {
          throw err;
        }
      }
    } else if (provider === "dropbox") {
      let token = account.accessToken;
      try {
        createdFolder = await createDropboxFolderInternal(account, token, folderName, parentFolderPath);
      } catch (err) {
        if (err.response?.status === 401 && account.refreshToken) {
          token = await refreshDropboxToken(account);
          createdFolder = await createDropboxFolderInternal(account, token, folderName, parentFolderPath);
        } else {
          throw err;
        }
      }
    } else if (provider === "onedrive") {
      let token = account.accessToken;
      try {
        createdFolder = await createOneDriveFolderInternal(account, token, folderName, parentFolderId);
      } catch (err) {
        if (err.response?.status === 401 && account.refreshToken) {
          token = await refreshOneDriveToken(account);
          createdFolder = await createOneDriveFolderInternal(account, token, folderName, parentFolderId);
        } else {
          throw err;
        }
      }
    } else if (provider === "box") {
      let token = account.accessToken;
      try {
        createdFolder = await createBoxFolderInternal(account, token, folderName, parentFolderId);
      } catch (err) {
        if (err.response?.status === 401 && account.refreshToken) {
          token = await refreshBoxToken(account);
          createdFolder = await createBoxFolderInternal(account, token, folderName, parentFolderId);
        } else {
          throw err;
        }
      }
    } else if (provider === "s3") {
      createdFolder = await createS3FolderInternal(account, folderName, parentFolderPath);
    }
  } catch (err) {
    if (err.response?.status === 409 || err.status === 409 || err.response?.data?.error_summary?.includes("path/conflict")) {
      throw new Error(`Folder "${folderName}" already exists in this location.`);
    }
    throw err;
  }

  // Clear cache for this account
  fileCache.invalidateAccount(String(account._id));
  fileCache.clear();

  await logActivity(
    userId,
    "folder_created",
    `Created folder "${folderName}" in ${provider} (${account.email})`
  );

  return createdFolder;
};
