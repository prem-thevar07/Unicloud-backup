import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import { getAllFiles, getAllFolders, deleteFile } from "../services/fileAggregator.service.js";
import { logActivity } from "../utils/activityLogger.js";

const router = express.Router();

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { provider, accountId, fileName } = req.query;
    await deleteFile(req.user.id, { id, provider, accountId });

    // ✅ Log real file_deleted event
    await logActivity(req.user.id, "file_deleted",
      `Deleted ${fileName || "a file"} from ${provider === "google" ? "Google Drive" : "Dropbox"}`,
      { provider, fileName }
    );

    res.json({ success: true, message: "File deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

router.get("/folders", authMiddleware, async (req, res) => {
  try {
    const folders = await getAllFolders(req.user.id, req.query.accountId);
    res.json(folders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch folders" });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const data = await getAllFiles(req.user.id, {
      view: req.query.view,
      type: req.query.type,
      search: req.query.search,
      mode: req.query.mode, // 🔥 NEW
      pageTokens: req.query.pageTokens, // 🔥 Pagination
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      folderId: req.query.folderId,
      folderPath: req.query.folderPath,
      folderAccountId: req.query.folderAccountId,
      pageSize: req.query.pageSize,
      accounts: req.query.accounts
    });

    res.json(data); // 🔥 IMPORTANT FIX
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

export default router;