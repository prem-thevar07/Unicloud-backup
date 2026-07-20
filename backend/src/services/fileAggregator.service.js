import CloudAccount from "../models/CloudAccount.js";
import { fetchGoogleFiles, fetchGoogleFolders, deleteGoogleFile } from "./providers/google.provider.js";
import { fetchDropboxFiles, fetchDropboxFolders, deleteDropboxFile } from "./providers/dropbox.provider.js";
import { fetchOneDriveFiles, fetchOneDriveFolders, deleteOneDriveFile } from "./providers/onedrive.provider.js";
import { fetchS3Files, fetchS3Folders, deleteS3File } from "./providers/s3.provider.js";
import { fetchBoxFiles, fetchBoxFolders, deleteBoxFile } from "./providers/box.provider.js";
import { normalizeFile } from "../utils/fileNormalizer.js";
import { fileCache } from "../utils/cache.js";

/* ===============================
   MAIN SERVICE
=============================== */
export const getAllFiles = async (userId, query = {}) => {
  try {
    const {
      view = "unified",
      type,
      search,
      mode = "all", // files | photos | all
      pageTokens = "{}",
      startDate,
      endDate,
      folderId,
      folderPath,
      folderAccountId,
      pageSize
    } = query;

    let parsedTokens = {};
    try {
      parsedTokens = JSON.parse(pageTokens);
    } catch (e) {
      console.warn("Invalid pageTokens JSON");
    }

    const newPageTokens = {};

    console.log("🔥 Fetching files with mode:", mode);

    /* ===============================
       1️⃣ GET ACCOUNTS
    =============================== */
    let accounts = await CloudAccount.find({ userId });
    
    if (query.accounts) {
      const selectedIds = typeof query.accounts === "string"
        ? query.accounts.split(",")
        : query.accounts;
      accounts = accounts.filter(acc => selectedIds.includes(String(acc._id)));
    }

    if (folderAccountId) {
      accounts = accounts.filter(acc => String(acc._id) === String(folderAccountId));
    }

    if (!accounts.length) {
      console.log("⚠️ No accounts connected");
      return emptyResponse(view, {});
    }

    /* ===============================
       1.5️⃣ BUILD FOLDER LOOKUP MAP
    =============================== */
    const folderMap = {};
    try {
      const folders = await getAllFolders(userId);
      folders.forEach(f => {
        if (f.id && f.name) {
          folderMap[f.id] = f.name;
        }
      });
    } catch (err) {
      console.error("❌ Failed to build folder map:", err.message);
    }

    /* ===============================
       2️⃣ FETCH FILES (SAFE)
    =============================== */
    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          let files = [];
          const token = parsedTokens[account._id];
          
          // Skip if we already reached end of pagination for this account
          if (token === "EOF") {
            newPageTokens[account._id] = "EOF";
            return [];
          }

          if (account.provider === "google") {
            const res = await fetchGoogleFiles(account, token, { search, startDate, endDate, folderId, pageSize });
            
            files = res?.files || [];
            newPageTokens[account._id] = res?.nextPageToken || "EOF";
          } else if (account.provider === "dropbox") {
            const res = await fetchDropboxFiles(account, token, { search, folderPath, pageSize });
            
            files = res?.files || [];
            newPageTokens[account._id] = res?.nextPageToken || "EOF";
          } else if (account.provider === "onedrive") {
            const res = await fetchOneDriveFiles(account, token, { search, folderId, pageSize });
            
            files = res?.files || [];
            newPageTokens[account._id] = res?.nextPageToken || "EOF";
          } else if (account.provider === "s3") {
            const res = await fetchS3Files(account, token, { search, folderPath: folderId || folderPath, pageSize });
            
            files = res?.files || [];
            newPageTokens[account._id] = res?.nextPageToken || "EOF";
          } else if (account.provider === "box") {
            const res = await fetchBoxFiles(account, token, { search, folderId, pageSize });
            
            files = res?.files || [];
            newPageTokens[account._id] = res?.nextPageToken || "EOF";
          }

          // 🔥 normalize safely
          return files
            .map((file) => {
              const normalized = normalizeFile(
                file,
                account.provider,
                account._id,
                account.email
              );
              if (normalized) {
                if (account.provider === "google") {
                  const parentId = file.parents?.[0];
                  const parentName = parentId ? folderMap[parentId] : null;
                  normalized.path = parentName ? `/${parentName}` : "/";
                }
              }
              return normalized;
            })
            .filter(Boolean);
        } catch (err) {
          console.error(`❌ ${account.provider} error:`, err.message);
          newPageTokens[account._id] = "EOF";
          return []; // never break system
        }
      })
    );

    /* ===============================
       3️⃣ MERGE
    =============================== */
    let allFiles = results.flat();

    /* ===============================
       4️⃣ MODE FILTER
    =============================== */
    if (mode === "files") {
      allFiles = allFiles.filter(
        (f) => f.type !== "image" && f.type !== "video"
      );
    }

    if (mode === "photos") {
      allFiles = allFiles.filter(
        (f) => f.type === "image" || f.type === "video"
      );
    }

    /* ===============================
       5️⃣ SEARCH
    =============================== */
    if (search) {
      const q = search.toLowerCase();
      allFiles = allFiles.filter((file) =>
        file.name?.toLowerCase().includes(q)
      );
    }

    /* ===============================
       5b️⃣ DATE FILTER (LOCAL FALLBACK FOR NON-GOOGLE)
    =============================== */
    if (startDate) {
      const start = new Date(startDate);
      allFiles = allFiles.filter((f) => !f.createdAt || new Date(f.createdAt) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      allFiles = allFiles.filter((f) => !f.createdAt || new Date(f.createdAt) <= end);
    }

    /* ===============================
       6️⃣ TYPE FILTER
    =============================== */
    if (type) {
      allFiles = allFiles.filter((f) => f.type === type);
    }

    /* ===============================
       7️⃣ SORT
    =============================== */
    allFiles.sort(
      (a, b) =>
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );

    /* ===============================
       8️⃣ RESPONSE
    =============================== */
    let groupedData;
    if (view === "accounts") {
      groupedData = groupByAccounts(allFiles);
    } else {
      groupedData = groupByType(allFiles);
    }
    
    return {
      data: groupedData,
      nextPageTokens: newPageTokens
    };
  } catch (err) {
    console.error("🔥 Aggregator Error:", err.message);
    return emptyResponse(query.view, {});
  }
};

/* ===============================
   GROUP BY ACCOUNTS
=============================== */
const groupByAccounts = (files) => {
  const grouped = {};

  files.forEach((file) => {
    if (!file) return;

    if (!grouped[file.provider]) {
      grouped[file.provider] = {};
    }

    if (!grouped[file.provider][file.accountId]) {
      grouped[file.provider][file.accountId] = {
        email: file.accountEmail,
        files: [],
      };
    }

    grouped[file.provider][file.accountId].files.push(file);
  });

  return grouped;
};

/* ===============================
   GROUP BY TYPE
=============================== */
const groupByType = (files) => {
  const grouped = {
    image: [],
    video: [],
    document: [],
    other: [],
  };

  files.forEach((file) => {
    if (!file) return;

    if (grouped[file.type]) {
      grouped[file.type].push(file);
    } else {
      grouped.other.push(file);
    }
  });

  return grouped;
};

/* ===============================
   EMPTY RESPONSE
=============================== */
const emptyResponse = (view) => {
  if (view === "accounts") return { data: {}, nextPageTokens: {} };

  return {
    data: {
      image: [],
      video: [],
      document: [],
      other: [],
    },
    nextPageTokens: {}
  };
};

export const getAllFolders = async (userId, accountId = null) => {
  try {
    const query = { userId };
    if (accountId) query._id = accountId;
    const accounts = await CloudAccount.find(query);
    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          if (account.provider === "google") {
            return await fetchGoogleFolders(account);
          } else if (account.provider === "dropbox") {
            return await fetchDropboxFolders(account);
          } else if (account.provider === "onedrive") {
            return await fetchOneDriveFolders(account);
          } else if (account.provider === "s3") {
            return await fetchS3Folders(account);
          } else if (account.provider === "box") {
            return await fetchBoxFolders(account);
          }
          return [];
        } catch (err) {
          console.error(`❌ ${account.provider} folder query error:`, err.message);
          return [];
        }
      })
    );
    return results.flat();
  } catch (err) {
    console.error("❌ getAllFolders error:", err.message);
    return [];
  }
};

export const deleteFile = async (userId, { id, provider, accountId }) => {
  const account = await CloudAccount.findOne({ _id: accountId, userId });
  if (!account) throw new Error("Account not found");

  if (provider === "google") {
    await deleteGoogleFile(account, id);
  } else if (provider === "dropbox") {
    await deleteDropboxFile(account, id);
  } else if (provider === "onedrive") {
    await deleteOneDriveFile(account, id);
  } else if (provider === "s3") {
    await deleteS3File(account, id);
  } else if (provider === "box") {
    await deleteBoxFile(account, id);
  }
  
  // Clear the file cache after deleting
  fileCache.clear();
};
