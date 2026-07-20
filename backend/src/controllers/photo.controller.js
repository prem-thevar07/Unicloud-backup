import { google } from "googleapis";
import axios from "axios";
import CloudAccount from "../models/CloudAccount.js";
import { fileCache } from "../utils/cache.js";
import { fetchDropboxFiles } from "../services/providers/dropbox.provider.js";

// Initialize a generic OAuth2 client
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

// ================================
// GOOGLE PHOTOS API HELPER
// ================================
const fetchGooglePhotosMedia = async (accessToken, pageToken = null, includeVideos = false) => {
  try {
    const url = "https://photoslibrary.googleapis.com/v1/mediaItems:search";
    const body = {
      pageSize: 20,
    };
    if (pageToken) {
      body.pageToken = pageToken;
    }
    
    // Google Photos API only allows ONE media type in mediaTypeFilter.
    // If includeVideos is true, we omit filters to fetch both photos and videos.
    if (!includeVideos) {
      body.filters = {
        mediaTypeFilter: {
          mediaTypes: ["PHOTO"],
        },
      };
    }

    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    return {
      mediaItems: res.data.mediaItems || [],
      nextPageToken: res.data.nextPageToken || null,
    };
  } catch (err) {
    // Graceful fallback if API not enabled or scope not consented
    console.error("❌ Google Photos API fetch failed:", err.response?.data || err.message);
    return { mediaItems: [], nextPageToken: null };
  }
};

// ================================
// GET PHOTOS (Aggregated or Filtered)
// ================================
export const getPhotos = async (req, res) => {
  try {
    const userId = req.user.id;
    const { accountId, pageTokens, includeVideos, source = "all" } = req.body;
    let accountSelections = req.body.accountSelections;

    // 1. Fetch connected accounts
    let accountsQuery = { userId };
    const allAccounts = await CloudAccount.find(accountsQuery);

    // Normalize accountSelections
    if (!accountSelections) {
      const accIds = accountId && accountId !== "all" 
        ? (Array.isArray(accountId) ? accountId : [accountId])
        : allAccounts.map(a => a._id.toString());
      
      accountSelections = accIds.map(id => ({
        accountId: id,
        source: source || "all"
      }));
    }

    // Check Cache using serializedSelections
    const serializedSelections = accountSelections
      .map(s => `${s.accountId}:${s.source}`)
      .sort()
      .join(",");
    const cacheKey = `photos_${userId}_${serializedSelections}_${JSON.stringify(pageTokens || {})}_${!!includeVideos}`;
    const cachedData = fileCache.get(cacheKey);
    
    if (cachedData) {
      console.log("Serving photos from cache for:", cacheKey);
      return res.json(cachedData);
    }

    // Filter accounts list to only include those in selections
    const targetAccountIds = accountSelections.map(sel => sel.accountId);
    const accounts = allAccounts.filter(acc => targetAccountIds.includes(acc._id.toString()));

    if (!accounts.length) {
      return res.json({ files: [], nextTokens: {} });
    }

    let allPhotos = [];
    let newTokens = {};

    // 2. Fetch from each account concurrently
    const fetchPromises = accounts.map(async (account) => {
      const accIdStr = account._id.toString();
      const requestToken = pageTokens ? pageTokens[accIdStr] : undefined;

      // Skip if we already reached EOF
      if (requestToken === "EOF") {
        newTokens[accIdStr] = "EOF";
        return;
      }

      // Parse selections for this account
      const selections = accountSelections.filter(sel => sel.accountId === accIdStr);
      const hasDrive = selections.some(sel => sel.source === "drive" || sel.source === "all");
      const hasPhotos = selections.some(sel => sel.source === "photos" || sel.source === "all");

      // Parse dual tokens
      let driveToken = undefined;
      let photosToken = undefined;
      
      if (requestToken) {
        if (requestToken.includes("|")) {
          const parts = requestToken.split("|");
          driveToken = parts[0] === "EOF" ? null : parts[0];
          photosToken = parts[1] === "EOF" ? null : parts[1];
        } else {
          // Legacy support (in case old token is in memory)
          driveToken = requestToken;
        }
      }

      if (account.provider === "google") {
        let driveFiles = [];
        let nextDriveToken = "EOF";
        
        let photosItems = [];
        let nextPhotosToken = "EOF";

        // 2a. Fetch from Google Drive (if not EOF for Drive and source allows it)
        if (driveToken !== null && hasDrive) {
          try {
            const client = createOAuth2Client(account.accessToken, account.refreshToken);
            const drive = google.drive({ version: "v3", auth: client });

            const queryStr = includeVideos 
              ? "(mimeType contains 'image/' or mimeType contains 'video/') and trashed = false"
              : "mimeType contains 'image/' and trashed = false";

            const response = await drive.files.list({
              q: queryStr,
              fields: "nextPageToken, files(id, name, mimeType, thumbnailLink, webContentLink, webViewLink, size, createdTime)",
              pageSize: 20,
              orderBy: "createdTime desc",
              pageToken: driveToken || undefined,
            });

            driveFiles = response.data.files || [];
            nextDriveToken = response.data.nextPageToken || "EOF";
          } catch (err) {
            console.error(`Error fetching Drive files for account ${accIdStr}:`, err.message);
          }
        }

        // 2b. Fetch from Google Photos (if not EOF for Photos and source allows it)
        if (photosToken !== null && hasPhotos) {
          try {
            const photosRes = await fetchGooglePhotosMedia(account.accessToken, photosToken, includeVideos);
            photosItems = photosRes.mediaItems || [];
            nextPhotosToken = photosRes.nextPageToken || "EOF";
          } catch (err) {
            console.error(`Error fetching Google Photos for account ${accIdStr}:`, err.message);
          }
        }

        // Normalize Drive files
        const normalizedDrive = driveFiles.map(file => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          thumbnailLink: file.thumbnailLink,
          webViewLink: file.webViewLink,
          webContentLink: file.webContentLink,
          size: Number(file.size) || 0,
          createdTime: file.createdTime,
          provider: "google",
          accountId: accIdStr,
          accountEmail: account.email
        }));

        // Normalize Google Photos items
        const normalizedPhotos = photosItems.map(item => ({
          id: item.id,
          name: item.filename || "Unnamed Photo",
          mimeType: item.mimeType,
          thumbnailLink: `${item.baseUrl}=s220`,
          webViewLink: item.productUrl,
          webContentLink: `${item.baseUrl}=d`,
          size: 0,
          createdTime: item.mediaMetadata?.creationTime || new Date().toISOString(),
          provider: "google-photos",
          accountId: accIdStr,
          accountEmail: account.email
        }));

        allPhotos.push(...normalizedDrive, ...normalizedPhotos);

        // Save page tokens mapping for Google
        if (nextDriveToken === "EOF" && nextPhotosToken === "EOF") {
          newTokens[accIdStr] = "EOF";
        } else {
          newTokens[accIdStr] = `${nextDriveToken}|${nextPhotosToken}`;
        }
      } else if (account.provider === "dropbox") {
        try {
          const res = await fetchDropboxFiles(account, requestToken || null);
          const rawFiles = res?.files || [];
          const nextCursor = res?.nextPageToken || "EOF";

          // Filter to keep only images and videos
          const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
          const videoExtensions = ["mp4", "mov", "avi", "mkv", "webm"];
          
          const filtered = rawFiles.filter(file => {
            if (file[".tag"] === "folder") return false;
            const ext = (file.name || "").split(".").pop().toLowerCase();
            const isImg = imageExtensions.includes(ext);
            const isVid = videoExtensions.includes(ext);
            return includeVideos ? (isImg || isVid) : isImg;
          });

          // Normalize to Photos page structure
          const normalized = filtered.map(file => {
            const ext = (file.name || "").split(".").pop().toLowerCase();
            const isImg = imageExtensions.includes(ext);
            return {
              id: file.id,
              name: file.name,
              mimeType: isImg ? `image/${ext}` : `video/${ext}`,
              thumbnailLink: file.thumbnailLink || null,
              webViewLink: `https://www.dropbox.com/home` + (file.path_display || ""),
              webContentLink: null,
              size: Number(file.size) || 0,
              createdTime: file.server_modified || file.client_modified || new Date().toISOString(),
              provider: "dropbox",
              accountId: accIdStr,
              accountEmail: account.email
            };
          });

          allPhotos.push(...normalized);
          newTokens[accIdStr] = nextCursor;
        } catch (err) {
          console.error(`Error fetching Dropbox photos for account ${accIdStr}:`, err.message);
          newTokens[accIdStr] = "EOF";
        }
      } else if (account.provider === "onedrive") {
        try {
          const { fetchOneDriveFiles } = await import("../services/providers/onedrive.provider.js");
          const res = await fetchOneDriveFiles(account, requestToken || null, { pageSize: 50 });
          const rawFiles = res?.files || [];
          const nextCursor = res?.nextPageToken || "EOF";

          // Filter to keep only images and videos
          const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
          const videoExtensions = ["mp4", "mov", "avi", "mkv", "webm"];

          const filtered = rawFiles.filter(file => {
            if (file.folder) return false;
            
            const mime = file.file?.mimeType || "";
            const isImg = mime.startsWith("image/");
            const isVid = mime.startsWith("video/");
            
            if (isImg || isVid) {
              return includeVideos ? true : isImg;
            }
            
            const ext = (file.name || "").split(".").pop().toLowerCase();
            const extImg = imageExtensions.includes(ext);
            const extVid = videoExtensions.includes(ext);
            return includeVideos ? (extImg || extVid) : extImg;
          });

          // Normalize to Photos page structure
          const normalized = filtered.map(file => {
            const mime = file.file?.mimeType || "";
            const isImg = mime.startsWith("image/");
            const ext = (file.name || "").split(".").pop().toLowerCase();
            
            return {
              id: file.id,
              name: file.name,
              mimeType: mime || (isImg ? `image/${ext}` : `video/${ext}`),
              thumbnailLink: `/api/onedrive/thumbnail/${accIdStr}?fileId=${file.id}`,
              webViewLink: file.webUrl || null,
              webContentLink: file["@microsoft.graph.downloadUrl"] || null,
              size: Number(file.size) || 0,
              createdTime: file.createdDateTime || file.lastModifiedDateTime || new Date().toISOString(),
              provider: "onedrive",
              accountId: accIdStr,
              accountEmail: account.email
            };
          });

          allPhotos.push(...normalized);
          newTokens[accIdStr] = nextCursor;
        } catch (err) {
          console.error(`Error fetching OneDrive photos for account ${accIdStr}:`, err.message);
          newTokens[accIdStr] = "EOF";
        }
      }
    });

    await Promise.all(fetchPromises);

    // 3. Sort merged results by createdTime descending
    allPhotos.sort((a, b) => new Date(b.createdTime || b.createdTime) - new Date(a.createdTime || a.createdTime));

    const responseData = {
      files: allPhotos,
      nextTokens: newTokens,
    };

    // Save to cache (5 minutes TTL in milliseconds)
    fileCache.set(cacheKey, responseData, 300 * 1000);

    res.json(responseData);
  } catch (err) {
    console.error("Get photos error:", err);
    res.status(500).json({ message: "Failed to fetch photos" });
  }
};
