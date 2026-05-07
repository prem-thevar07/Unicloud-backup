import mongoose from "mongoose";

const cloudAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // 🔥 faster queries
    },

    provider: {
      type: String,
      required: true, // "google", "onedrive", etc.
      index: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    accessToken: {
      type: String,
      default: null,
    },

    refreshToken: {
      type: String,
      default: null,
    },

    scope: {
      type: [String],
      default: [],
    },

    /* ===============================
       STATUS + HEALTH
    =============================== */
    status: {
      type: String,
      enum: ["connected", "error", "syncing"],
      default: "connected",
    },

    /* ===============================
       STORAGE INFO
    =============================== */
    storage: {
      used: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },

    /* ===============================
       SYNC TRACKING
    =============================== */
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

/* ===============================
   🔥 UNIQUE CONSTRAINT (CRITICAL)
   Prevent duplicate same account
=============================== */
cloudAccountSchema.index(
  { userId: 1, provider: 1, email: 1 },
  { unique: true }
);

export default mongoose.model("CloudAccount", cloudAccountSchema);