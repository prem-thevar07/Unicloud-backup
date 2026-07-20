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
    if (pageTokens) params.append("pageTokens", JSON.stringify(pageTokens));
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

export const getActivity = async () => {
  try {
    const res = await api.get("/activity");
    return res.data;
  } catch (err) {
    console.error("❌ getActivity error:", err);
    return [];
  }
};