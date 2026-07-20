import {
  getAccounts,
  deleteAccount,
} from "../services/account.service.js";
import { fileCache } from "../utils/cache.js";

export const getAllAccounts = async (req, res) => {
  try {
    const data = await getAccounts(req.user.id);
    res.json(data);
  } catch (err) {
    console.error("❌ Get accounts error:", err.message);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
};

export const removeAccount = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await deleteAccount(id, req.user.id);

    // Invalidate caches
    fileCache.invalidateAccount(id);
    fileCache.invalidateUserPhotos(req.user.id);

    res.json(result);
  } catch (err) {
    console.error("❌ Delete error:", err.message);
    res.status(500).json({ error: "Failed to delete account" });
  }
};