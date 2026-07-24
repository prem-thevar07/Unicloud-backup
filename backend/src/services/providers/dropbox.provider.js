import axios from "axios";
import CloudAccount from "../../models/CloudAccount.js";
import { fileCache } from "../../utils/cache.js";

// Helper to refresh Dropbox access token
export const refreshDropboxToken = async (account) => {
  try {
    console.log(`🔄 Refreshing Dropbox token for: ${account.email}`);
    
    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", account.refreshToken);
    params.append("client_id", process.env.DROPBOX_APP_KEY);
    params.append("client_secret", process.env.DROPBOX_APP_SECRET);

    const res = await axios.post("https://api.dropbox.com/oauth2/token", params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    const newAccessToken = res.data.access_token;
    
    // Save to DB
    account.accessToken = newAccessToken;
    account.lastSyncedAt = new Date();
    await account.save();

    console.log("✅ Dropbox token refreshed successfully.");
    return newAccessToken;
  } catch (err) {
    console.error("❌ Failed to refresh Dropbox token:", err.response?.data || err.message);
    throw err;
  }
};

// Helper: Make resilient Dropbox post requests
const makeDropboxRequest = async (account, url, data, headers = {}) => {
  let token = account.accessToken;
  try {
    const res = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...headers
      }
    });
    return res;
  } catch (err) {
    if (err.response?.status === 401 && account.refreshToken) {
      // Refresh token and retry once
      token = await refreshDropboxToken(account);
      const res = await axios.post(url, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...headers
        }
      });
      return res;
    }
    throw err;
  }
};

// 1. Fetch Dropbox Files & Folders recursively
export const fetchDropboxFiles = async (account, pageToken = null, options = {}) => {
  try {
    const searchStr = options.search || "";
    const cacheKey = `dropbox:files:${account._id}:q:${searchStr}:folder:${options.folderPath || "root"}:size:${options.pageSize || 20}:token:${pageToken || "root"}`;

    const cachedData = fileCache.get(cacheKey);
    if (cachedData) {
      console.log(`⚡ Serving cached files for Dropbox account: ${account.email}`);
      return cachedData;
    }

    let files = [];
    let nextPageToken = null;

    if (searchStr) {
      // Query Search API
      const searchUrl = "https://api.dropboxapi.com/2/files/search_v2";
      const body = {
        query: searchStr,
        options: {
          max_results: options.pageSize ? Number(options.pageSize) : 100
        }
      };
      
      const res = await makeDropboxRequest(account, searchUrl, body);
      const matches = res.data.matches || [];
      
      // Pull metadata structures from search matches
      files = matches.map(m => m.metadata?.metadata || m.metadata).filter(Boolean);
      
      if (res.data.has_more) {
        nextPageToken = res.data.cursor || null;
      }
    } else {
      // Query List Folder API
      let url = "https://api.dropboxapi.com/2/files/list_folder";
      let body = {
        path: options.folderPath || "",
        recursive: options.folderPath ? false : true,
        limit: options.pageSize ? Number(options.pageSize) : 100
      };

      if (pageToken) {
        url = "https://api.dropboxapi.com/2/files/list_folder/continue";
        body = {
          cursor: pageToken
        };
      }

      const res = await makeDropboxRequest(account, url, body);
      files = res.data.entries || [];
      
      if (res.data.has_more) {
        nextPageToken = res.data.cursor || null;
      }
    }

    // Retrieve thumbnails in batch for image files
    const imgExtensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
    const filesToFetchThumbnail = files.filter(f => {
      if (f[".tag"] === "folder") return false;
      const ext = (f.name || "").split(".").pop().toLowerCase();
      return imgExtensions.includes(ext);
    });

    if (filesToFetchThumbnail.length > 0) {
      try {
        const batchUrl = "https://content.dropboxapi.com/2/files/get_thumbnail_batch";
        const entries = filesToFetchThumbnail.map(f => ({
          path: f.id,
          format: "jpeg",
          size: "w640h480",
          mode: "strict"
        }));

        const batchRes = await makeDropboxRequest(account, batchUrl, { entries });
        const thumbnailMap = {};
        
        if (batchRes.data && batchRes.data.entries) {
          batchRes.data.entries.forEach(entry => {
            if (entry[".tag"] === "success" && entry.thumbnail) {
              thumbnailMap[entry.metadata.id] = `data:image/jpeg;base64,${entry.thumbnail}`;
            }
          });
        }

        // Attach to files list
        files.forEach(f => {
          if (thumbnailMap[f.id]) {
            f.thumbnailLink = thumbnailMap[f.id];
          }
        });
      } catch (err) {
        console.error("❌ Failed to fetch Dropbox thumbnail batch:", err.message);
      }
    }

    const result = {
      files,
      nextPageToken,
    };

    // Cache the result (5 min TTL)
    fileCache.set(cacheKey, result);

    return result;
  } catch (err) {
    console.error("❌ Dropbox files failed:", err.response?.data || err.message);
    return { files: [], nextPageToken: null };
  }
};

// 2. Fetch Storage Space Allocation & Usage
export const fetchDropboxStorage = async (account) => {
  try {
    const url = "https://api.dropboxapi.com/2/users/get_space_usage";
    const res = await makeDropboxRequest(account, url, {});
    
    const used = res.data.used || 0;
    
    let total = 0;
    if (res.data.allocation) {
      if (res.data.allocation.allocated) {
        total = res.data.allocation.allocated;
      } else if (res.data.allocation.individual) {
        total = res.data.allocation.individual.allocated || 0;
      }
    }

    return {
      used: Number(used),
      total: Number(total),
    };
  } catch (err) {
    console.error("❌ Dropbox storage failed:", err.response?.data || err.message);
    throw err;
  }
};

export const fetchDropboxFolders = async (account) => {
  try {
    const url = "https://api.dropboxapi.com/2/files/list_folder";
    const body = {
      path: "",
      recursive: false,
      limit: 100
    };
    const res = await makeDropboxRequest(account, url, body);
    const entries = res.data.entries || [];
    return entries
      .filter(f => f[".tag"] === "folder")
      .map(f => ({
        id: f.id,
        name: f.name,
        path: f.path_lower,
        provider: "dropbox",
        accountId: account._id,
        accountEmail: account.email
      }));
  } catch (err) {
    console.error("❌ fetchDropboxFolders failed:", err.message);
    return [];
  }
};

export const deleteDropboxFile = async (account, fileId) => {
  try {
    const url = "https://api.dropboxapi.com/2/files/delete_v2";
    const body = { path: fileId };
    await makeDropboxRequest(account, url, body);
  } catch (err) {
    console.error("❌ Dropbox delete failed:", err.response?.data || err.message);
    throw err;
  }
};
