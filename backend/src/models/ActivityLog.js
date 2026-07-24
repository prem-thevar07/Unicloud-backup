import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "account_connected",
        "account_disconnected",
        "account_synced",
        "file_uploaded",
        "file_deleted",
        "file_shared",
        "file_copied",
        "file_moved",
        "folder_created",
        "folder_deleted",
        "storage_warning",
        "storage_full",
      ],
      required: true,
    },

    // Human readable message
    message: {
      type: String,
      required: true,
    },

    // Extra metadata
    meta: {
      provider: { type: String }, // "google", "dropbox"
      email: { type: String },
      fileName: { type: String },
      fileSize: { type: Number },
      storagePercent: { type: Number },
    },
  },
  { timestamps: true }
);

// Index for fast lookup sorted by newest
activityLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("ActivityLog", activityLogSchema);
