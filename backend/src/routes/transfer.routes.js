import express from "express";
import auth from "../middleware/auth.middleware.js";
import { executeTransfer } from "../services/transfer.service.js";
import ActivityLog from "../models/ActivityLog.js";

const router = express.Router();

/* ==========================================
   🔄 POST /api/transfer/copy
========================================== */
router.post("/copy", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sourceAccountId, sourceFileId, targetAccountId, targetFolderId } = req.body;

    if (!sourceAccountId || !sourceFileId || !targetAccountId) {
      return res.status(400).json({ message: "sourceAccountId, sourceFileId, and targetAccountId are required." });
    }

    const result = await executeTransfer({
      userId,
      sourceAccountId,
      sourceFileId,
      targetAccountId,
      targetFolderId,
      operation: "copy",
    });

    res.json(result);
  } catch (err) {
    console.error("❌ Copy transfer failed:", err.message);
    res.status(500).json({ message: err.message || "Failed to copy file across clouds." });
  }
});

/* ==========================================
   🚚 POST /api/transfer/move
========================================== */
router.post("/move", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sourceAccountId, sourceFileId, targetAccountId, targetFolderId } = req.body;

    if (!sourceAccountId || !sourceFileId || !targetAccountId) {
      return res.status(400).json({ message: "sourceAccountId, sourceFileId, and targetAccountId are required." });
    }

    const result = await executeTransfer({
      userId,
      sourceAccountId,
      sourceFileId,
      targetAccountId,
      targetFolderId,
      operation: "move",
    });

    res.json(result);
  } catch (err) {
    console.error("❌ Move transfer failed:", err.message);
    res.status(500).json({ message: err.message || "Failed to move file across clouds." });
  }
});

/* ==========================================
   📦 POST /api/transfer/batch
========================================== */
router.post("/batch", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sourceAccountId, sourceFileIds, targetAccountId, targetFolderId, operation = "copy" } = req.body;

    if (!sourceAccountId || !Array.isArray(sourceFileIds) || sourceFileIds.length === 0 || !targetAccountId) {
      return res.status(400).json({ message: "sourceAccountId, sourceFileIds (array), and targetAccountId are required." });
    }

    const results = [];
    const errors = [];

    for (const fileId of sourceFileIds) {
      try {
        const itemResult = await executeTransfer({
          userId,
          sourceAccountId,
          sourceFileId: fileId,
          targetAccountId,
          targetFolderId,
          operation,
        });
        results.push(itemResult);
      } catch (err) {
        console.error(`❌ Batch transfer item error (${fileId}):`, err.message);
        errors.push({ fileId, message: err.message });
      }
    }

    res.json({
      success: true,
      transferredCount: results.length,
      failedCount: errors.length,
      results,
      errors,
    });
  } catch (err) {
    console.error("❌ Batch transfer failed:", err.message);
    res.status(500).json({ message: err.message || "Batch transfer failed." });
  }
});

/* ==========================================
   📊 GET /api/transfer/history
========================================== */
router.get("/history", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const history = await ActivityLog.find({
      userId,
      type: { $in: ["file_copied", "file_moved"] },
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ history });
  } catch (err) {
    console.error("❌ Fetch transfer history error:", err.message);
    res.status(500).json({ message: "Failed to fetch transfer history." });
  }
});

export default router;
