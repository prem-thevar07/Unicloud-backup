import { google } from "googleapis";

export const fetchGoogleFiles = async (account, pageToken = null) => {
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

    const res = await drive.files.list({
      pageSize: 20, // 🔥 controlled
      pageToken,
      orderBy: "createdTime desc",
      fields:
        "nextPageToken, files(id,name,mimeType,size,thumbnailLink,webViewLink,createdTime)",
    });

    return {
      files: res.data.files || [],
      nextPageToken: res.data.nextPageToken || null,
    };
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