import ActivityLog from "../models/ActivityLog.js";

/**
 * Log a real activity event for a user.
 */
export const logActivity = async (userId, type, message, meta = {}) => {
  try {
    await ActivityLog.create({ userId, type, message, meta });
  } catch (err) {
    // Never crash the main request just because logging failed
    console.error("⚠️ Activity log failed:", err.message);
  }
};

/**
 * Fetch most recent N activity logs for a user.
 */
export const getRecentActivity = async (userId, limit = 15) => {
  return ActivityLog.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};
