import axios from "axios";
import FormData from "form-data";
import { fileCache } from "../../utils/cache.js";

// Helper to refresh Box access token
export const refreshBoxToken = async (account) => {
  try {
    console.log(`🔄 Refreshing Box token for: ${account.email}`);
    
    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", account.refreshToken);
    params.append("client_id", process.env.BOX_CLIENT_ID);
    params.append("client_secret", process.env.BOX_CLIENT_SECRET);

    const res = await axios.post("https://api.box.com/oauth2/token", params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    const newAccessToken = res.data.access_token;
    account.accessToken = newAccessToken;
    if (res.data.refresh_token) {
      account.refreshToken = res.data.refresh_token;
    }
    account.lastSyncedAt = new Date();
    await account.save();

    console.log("✅ Box token refreshed successfully.");
    return newAccessToken;
  } catch (err) {
    console.error("❌ Failed to refresh Box token:", err.response?.data || err.message);
    throw err;
  }
};

// Resilient API request wrapper
const makeBoxRequest = async (account, url, method = "GET", data = null, headers = {}) => {
  let token = account.accessToken;
  let attempts = 0;
  while (attempts < 2) {
    try {
      const res = await axios({
        method,
        url,
        data,
        headers: {
          Authorization: `Bearer ${token}`,
          ...headers
        }
      });
      return res;
    } catch (err) {
      if (err.response?.status === 401 && attempts === 0 && account.refreshToken) {
        token = await refreshBoxToken(account);
        attempts++;
      } else {
        throw err;
      }
    }
  }
};

// Retrieve Box user storage quota details
export const fetchBoxStorage = async (account) => {
  try {
    const res = await makeBoxRequest(account, "https://api.box.com/2.0/users/me");
    const spaceUsed = res.data.space_used || 0;
    const spaceAmount = res.data.space_amount || 10 * 1024 * 1024 * 1024; // 10 GB default fallback
    return { used: spaceUsed, total: spaceAmount };
  } catch (err) {
    console.error("❌ Box storage check failed:", err.message);
    return { used: 0, total: 10 * 1024 * 1024 * 1024 };
  }
};

// List Box files
export const fetchBoxFiles = async (account, pageToken = null, options = {}) => {
  try {
    const searchStr = options.search || "";
    const folderId = options.folderId || "0";
    const pageSize = options.pageSize ? Number(options.pageSize) : 100;
    const offset = pageToken ? Number(pageToken) : 0;

    let url = "";
    // If we want a specific folder, list its items directly
    if (options.folderId && options.folderId !== "0") {
      url = `https://api.box.com/2.0/folders/${folderId}/items?limit=${pageSize}&offset=${offset}&fields=id,type,name,size,created_at,modified_at,extension,path_collection,shared_link`;
    } else if (searchStr) {
      // If searching
      url = `https://api.box.com/2.0/search?query=${encodeURIComponent(searchStr)}&type=file&limit=${pageSize}&offset=${offset}&fields=id,type,name,size,created_at,modified_at,extension,path_collection,shared_link`;
    } else {
      // General fetch/root: list recursively using search or root folder listing
      // To match recursive behavior of Google/Dropbox, use Box search query for files
      url = `https://api.box.com/2.0/search?query=*&type=file&limit=${pageSize}&offset=${offset}&fields=id,type,name,size,created_at,modified_at,extension,path_collection,shared_link`;
    }

    let res = await makeBoxRequest(account, url);
    let items = res.data.entries || [];
    
    // Real-time fallback: If search returned nothing (indexing delay) at root, fetch root items directly
    if (items.length === 0 && (!options.folderId || options.folderId === "0") && !searchStr) {
      console.log("⚠️ Box search returned empty. Falling back to real-time root folder items query...");
      const fallbackUrl = `https://api.box.com/2.0/folders/0/items?limit=${pageSize}&offset=${offset}&fields=id,type,name,size,created_at,modified_at,extension,path_collection,shared_link`;
      const fallbackRes = await makeBoxRequest(account, fallbackUrl);
      items = fallbackRes.data.entries || [];
    }

    // Filters only file objects
    const files = items.filter(item => item.type === "file");

    const totalCount = res.data.total_count || items.length || 0;
    const nextOffset = offset + pageSize;
    const nextPageToken = nextOffset < totalCount ? String(nextOffset) : null;

    return {
      files,
      nextPageToken
    };
  } catch (err) {
    console.error("❌ Box fetch files failed:", err.response?.data || err.message);
    throw err;
  }
};

// Helper to walk folder hierarchy up to 3 levels deep in parallel (real-time query fallback)
const walkBoxFolders = async (account, folderId = "0", currentPath = "", depth = 1) => {
  if (depth > 3) return [];
  try {
    const url = `https://api.box.com/2.0/folders/${folderId}/items?limit=1000&fields=id,type,name,owned_by`;
    const res = await makeBoxRequest(account, url);
    const items = res.data.entries || [];

    const folderItems = items.filter(item => item.type === "folder").filter(folder => {
      if (folder.owned_by && folder.owned_by.login && folder.owned_by.login.toLowerCase() !== account.email.toLowerCase()) {
        return false;
      }
      return true;
    });

    const folders = folderItems.map(item => {
      const cleanPath = `${currentPath}/${item.name}`;
      return {
        id: item.id,
        name: item.name,
        provider: "box",
        accountId: account._id.toString(),
        accountEmail: account.email,
        path: cleanPath
      };
    });

    // Query subfolders in parallel
    const subFolderPromises = folderItems.map(item => {
      const cleanPath = `${currentPath}/${item.name}`;
      return walkBoxFolders(account, item.id, cleanPath, depth + 1);
    });

    const subFolderResults = await Promise.all(subFolderPromises);
    return folders.concat(subFolderResults.flat());
  } catch (err) {
    console.error(`Error walking Box folder ${folderId} (depth ${depth}):`, err.message);
    return [];
  }
};

// Retrieve all Box folders recursively
export const fetchBoxFolders = async (account) => {
  try {
    // Query Box Search for folders recursively
    const url = "https://api.box.com/2.0/search?query=*&type=folder&limit=1000&fields=id,type,name,path_collection,owned_by";
    let res = await makeBoxRequest(account, url);
    let entries = res.data.entries || [];

    if (entries.length > 0) {
      const folders = entries
        .filter(item => item.type === "folder")
        .filter(folder => {
          if (folder.owned_by && folder.owned_by.login && folder.owned_by.login.toLowerCase() !== account.email.toLowerCase()) {
            return false;
          }
          return true;
        })
        .map(folder => {
          // Construct path from path_collection
          const pathSegs = (folder.path_collection?.entries || [])
            .filter(p => p.id !== "0") // skip root "All Files"
            .map(p => p.name);
          const cleanPath = "/" + [...pathSegs, folder.name].join("/");

          return {
            id: folder.id,
            name: folder.name,
            provider: "box",
            accountId: account._id.toString(),
            accountEmail: account.email,
            path: cleanPath
          };
        });

      return folders;
    }

    // Real-time fallback: Walk folder hierarchy up to 3 levels deep if search index is not ready
    console.log("⚠️ Box folders search returned empty. Falling back to real-time folder hierarchy walker...");
    return await walkBoxFolders(account, "0", "");
  } catch (err) {
    console.error("❌ Box folder scan failed:", err.response?.data || err.message);
    return [];
  }
};

// Delete Box file
export const deleteBoxFile = async (account, fileId) => {
  try {
    const url = `https://api.box.com/2.0/files/${fileId}`;
    await makeBoxRequest(account, url, "DELETE");
    return true;
  } catch (err) {
    console.error("❌ Box delete file failed:", err.response?.data || err.message);
    throw err;
  }
};

// Upload Box file
export const uploadBoxFile = async (account, file, folderId = "0") => {
  const fs = await import("fs");
  const uploadUrl = "https://upload.box.com/api/2.0/files/content";
  const cleanFolderId = folderId && folderId !== "root" ? folderId : "0";

  const form = new FormData();
  form.append("attributes", JSON.stringify({
    name: file.originalname,
    parent: { id: cleanFolderId }
  }));

  const fileStream = fs.createReadStream(file.path);
  fileStream.on("error", (err) => {
    console.error("Box upload file stream error:", err);
  });
  form.append("file", fileStream, {
    filename: file.originalname,
    contentType: file.mimetype
  });

  let token = account.accessToken;
  let attempts = 0;
  let uploadResponse;

  while (attempts < 2) {
    try {
      uploadResponse = await axios.post(uploadUrl, form, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...form.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      break;
    } catch (err) {
      if (err.response?.status === 401 && attempts === 0 && account.refreshToken) {
        token = await refreshBoxToken(account);
        attempts++;
        
        // Recreate Form and Stream because stream is fully consumed on first post attempt
        const newForm = new FormData();
        newForm.append("attributes", JSON.stringify({
          name: file.originalname,
          parent: { id: cleanFolderId }
        }));
        
        const retryStream = fs.createReadStream(file.path);
        retryStream.on("error", (err) => {
          console.error("Box retry stream error:", err);
        });
        
        newForm.append("file", retryStream, {
          filename: file.originalname,
          contentType: file.mimetype
        });
        
        uploadResponse = await axios.post(uploadUrl, newForm, {
          headers: {
            Authorization: `Bearer ${token}`,
            ...newForm.getHeaders()
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
        break;
      } else {
        throw err;
      }
    }
  }

  return uploadResponse.data;
};
