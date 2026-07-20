import express from "express";
import auth from "../middleware/auth.middleware.js";
import { getRecentActivity } from "../utils/activityLogger.js";

const router = express.Router();

/* ===============================
   GET /api/activity
   Returns most recent 15 real events for the logged-in user
=============================== */
router.get("/", auth, async (req, res) => {
  try {
    const logs = await getRecentActivity(req.user.id, 15);
    res.json(logs);
  } catch (err) {
    console.error("❌ Activity fetch error:", err.message);
    res.status(500).json({ message: "Failed to fetch activity" });
  }
});

export default router;
