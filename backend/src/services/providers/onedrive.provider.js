import axios from "axios";

export const refreshOneDriveToken = async (account) => {
  try {
    const params = new URLSearchParams();
    params.append("client_id", process.env.ONEDRIVE_CLIENT_ID);
    params.append("client_secret", process.env.ONEDRIVE_CLIENT_SECRET);
    params.append("refresh_token", account.refreshToken);
    params.append("grant_type", "refresh_token");

    const res = await axios.post("https://login.microsoftonline.com/common/oauth2/v2.0/token", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    account.accessToken = res.data.access_token;
    if (res.data.refresh_token) {
      account.refreshToken = res.data.refresh_token;
    }
    account.lastSyncedAt = new Date();
    await account.save();
    return res.data.access_token;
  } catch (err) {
    console.error("❌ Failed to refresh OneDrive token:", err.response?.data || err.message);
    throw err;
  }
};

const makeOneDriveRequest = async (account, url, method = "GET", data = null, headers = {}) => {
  let attempts = 0;
  while (attempts < 2) {
    try {
      const res = await axios({
        method,
        url,
        data,
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          ...headers
        }
      });
      return res;
    } catch (err) {
      if (err.response?.status === 401 && attempts === 0 && account.refreshToken) {
        console.log(`🔄 Refreshing OneDrive token for account: ${account.email}`);
        await refreshOneDriveToken(account);
        attempts++;
      } else {
        throw err;
      }
    }
  }
};

export const fetchOneDriveFiles = async (account, pageToken = null, options = {}) => {
  try {
    const pageSize = options.pageSize ? Number(options.pageSize) : 20;
    
    // Default to delta query for recursive file indexing across all folders
    let url = "https://graph.microsoft.com/v1.0/me/drive/root/delta";

    if (options.folderId && options.folderId !== "root") {
      url = `https://graph.microsoft.com/v1.0/me/drive/items/${options.folderId}/children`;
    }

    if (pageToken) {
      url = pageToken;
    } else {
      const params = new URLSearchParams();
      params.append("$top", pageSize);
      params.append("$select", "id,name,size,file,folder,photo,video,createdDateTime,lastModifiedDateTime,parentReference,webUrl,@microsoft.graph.downloadUrl");

      if (options.search) {
        url = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(options.search)}')`;
      } else {
        url = `${url}?${params.toString()}`;
      }
    }

    const res = await makeOneDriveRequest(account, url);
    const items = res.data.value || [];
    const nextPageToken = res.data["@odata.nextLink"] || null;

    return {
      files: items,
      nextPageToken
    };
  } catch (err) {
    console.error("❌ fetchOneDriveFiles error:", err.response?.data || err.message);
    throw err;
  }
};

export const fetchOneDriveFolders = async (account) => {
  try {
    let url = "https://graph.microsoft.com/v1.0/me/drive/root/delta";
    let allFolders = [];

    while (url) {
      const res = await makeOneDriveRequest(account, url);
      const items = res.data.value || [];
      
      const folders = items.filter(item => item.folder).map(folder => {
        const rawPath = folder.parentReference?.path || "";
        const pathSegs = rawPath.replace(/^\/drive\/root:/, "").split("/").filter(Boolean);
        const cleanPath = "/" + [...pathSegs, folder.name].join("/");
        
        return {
          id: folder.id,
          name: folder.name,
          provider: "onedrive",
          accountId: account._id.toString(),
          path: cleanPath
        };
      });

      allFolders = allFolders.concat(folders);
      
      // Retrieve next page if present
      url = res.data["@odata.nextLink"] || null;

      // Delta token signals the end of current state sync
      if (res.data["@odata.deltaLink"]) {
        break;
      }
    }

    return allFolders;
  } catch (err) {
    console.error("❌ fetchOneDriveFolders error:", err.response?.data || err.message);
    return [];
  }
};

export const deleteOneDriveFile = async (account, fileId) => {
  try {
    const url = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`;
    await makeOneDriveRequest(account, url, "DELETE");
  } catch (err) {
    console.error("❌ deleteOneDriveFile error:", err.response?.data || err.message);
    throw err;
  }
};
