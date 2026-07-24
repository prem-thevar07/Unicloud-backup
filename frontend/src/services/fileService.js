import api from "../config/api";

export const getFiles = async ({
  view = "unified",
  type,
  search,
  mode = "files", // 🔥 default = files (important)
  pageTokens = null,
  startDate = null,
  endDate = null,
  folderId = null,
  folderPath = null,
  folderAccountId = null,
  pageSize = null,
  accounts = null,
} = {}) => {
  try {
    const params = new URLSearchParams();

    if (view) params.append("view", view);
    if (type) params.append("type", type);
    if (search) params.append("search", search);
    if (mode) params.append("mode", mode); // 🔥 NEW
    if (pageTokens) params.append("pageTokens", typeof pageTokens === "string" ? pageTokens : JSON.stringify(pageTokens));
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (folderId) params.append("folderId", folderId);
    if (folderPath) params.append("folderPath", folderPath);
    if (folderAccountId) params.append("folderAccountId", folderAccountId);
    if (pageSize) params.append("pageSize", pageSize);
    if (accounts) params.append("accounts", accounts);

    const res = await api.get(`/files?${params.toString()}`);

    return res.data;
  } catch (err) {
    console.error("❌ getFiles error:", err);
    throw err;
  }
};

export const getAccounts = async () => {
  try {
    const res = await api.get("/accounts");
    return res.data;
  } catch (err) {
    console.error("❌ getAccounts error:", err);
    throw err;
  }
};

export const getExplorerContents = async ({ accountId, folderId = "root", folderPath = "/" } = {}) => {
  try {
    const params = new URLSearchParams({ accountId });
    if (folderId) params.append("folderId", folderId);
    if (folderPath) params.append("folderPath", folderPath);
    const res = await api.get(`/files/explorer-contents?${params.toString()}`);
    return res.data;
  } catch (err) {
    console.error("❌ getExplorerContents error:", err);
    throw err;
  }
};

export const copyFile = async (transferData) => {
  try {
    const res = await api.post("/transfer/copy", transferData);
    return res.data;
  } catch (err) {
    console.error("❌ copyFile error:", err);
    throw err;
  }
};

export const moveFile = async (transferData) => {
  try {
    const res = await api.post("/transfer/move", transferData);
    return res.data;
  } catch (err) {
    console.error("❌ moveFile error:", err);
    throw err;
  }
};

export const batchTransferFiles = async (batchData) => {
  try {
    const res = await api.post("/transfer/batch", batchData);
    return res.data;
  } catch (err) {
    console.error("❌ batchTransferFiles error:", err);
    throw err;
  }
};

export const getTransferHistory = async () => {
  try {
    const res = await api.get("/transfer/history");
    return res.data;
  } catch (err) {
    console.error("❌ getTransferHistory error:", err);
    throw err;
  }
};

export const getActivity = async () => {
  try {
    const res = await api.get("/activity");
    return res.data;
  } catch (err) {
    console.error("❌ getActivity error:", err);
    return [];
  }
};