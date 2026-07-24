import { google } from "googleapis";
import { fileCache } from "../../utils/cache.js";

export const fetchGoogleFiles = async (account, pageToken = null, options = {}) => {
  try {
    const searchStr = options.search || "";
    const startStr = options.startDate || "";
    const endStr = options.endDate || "";
    const folderIdStr = options.folderId || "";
    const cacheKey = `google:files:${account._id}:q:${searchStr}:start:${startStr}:end:${endStr}:folder:${folderIdStr}:size:${options.pageSize || 20}:token:${pageToken || "root"}`;
    
    const cachedData = fileCache.get(cacheKey);
    if (cachedData) {
      console.log(`⚡ Serving cached files for account: ${account.email}, token: ${pageToken || "root"}`);
      return cachedData;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Construct search/date query for Google Drive
    const queryParts = [];
    if (options.folderId) {
      queryParts.push(`'${options.folderId}' in parents`);
    } else {
      queryParts.push("mimeType != 'application/vnd.google-apps.folder'");
    }
    queryParts.push("trashed = false");

    if (options.search) {
      // Escape single quotes to prevent Drive API query syntax errors
      const escapedSearch = options.search.replace(/'/g, "\\'");
      queryParts.push(`name contains '${escapedSearch}'`);
    }

    if (options.startDate) {
      queryParts.push(`createdTime >= '${options.startDate}'`);
    }

    if (options.endDate) {
      queryParts.push(`createdTime <= '${options.endDate}'`);
    }

    const q = queryParts.join(" and ");

    const res = await drive.files.list({
      pageSize: options.pageSize ? Number(options.pageSize) : 100, // 🔥 controlled
      pageToken,
      orderBy: "createdTime desc",
      q, // Pass query parameter to Google Drive
      fields:
        "nextPageToken, files(id,name,mimeType,size,parents,thumbnailLink,webViewLink,webContentLink,createdTime)",
    });

    const result = {
      files: res.data.files || [],
      nextPageToken: res.data.nextPageToken || null,
    };

    // Cache the result (5 min TTL)
    fileCache.set(cacheKey, result);

    return result;
  } catch (err) {
    console.error("❌ Google failed:", err.message);
    return { files: [], nextPageToken: null };
  }
};



export const fetchGoogleStorage = async (account) => {
  try {

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    const res = await drive.about.get({
      fields: "storageQuota",
    });

    return {
      used: Number(res.data.storageQuota.usage || 0),
      total: Number(res.data.storageQuota.limit || 0),
    };
  } catch (err) {
    console.error("❌ Storage fetch error:", err.message);
    throw err;
  }
};

export const fetchGoogleFolders = async (account) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });

    try {
      const tokenRes = await oauth2Client.getAccessToken();
      if (tokenRes && tokenRes.token && tokenRes.token !== account.accessToken) {
        account.accessToken = tokenRes.token;
        const CloudAccountModule = await import("../../models/CloudAccount.js");
        await CloudAccountModule.default.updateOne({ _id: account._id }, { accessToken: tokenRes.token });
      }
    } catch (tErr) {
      console.warn("⚠️ Token refresh warning in fetchGoogleFolders:", tErr.message);
    }

    const drive = google.drive({ version: "v3", auth: oauth2Client });
    const res = await drive.files.list({
      pageSize: 100,
      q: "'root' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: "files(id, name, createdTime)",
    });
    return (res.data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      provider: "google",
      accountId: String(account._id),
      accountEmail: account.email
    }));
  } catch (err) {
    console.error("❌ fetchGoogleFolders failed:", err.message);
    return [];
  }
};

export const deleteGoogleFile = async (account, fileId) => {
  try {
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
  } catch (err) {
    console.error("❌ Google Drive delete failed:", err.message);
    throw err;
  }
};