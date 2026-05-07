import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true, // 🔥 faster lookup
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    /* ===============================
       AUTH / VERIFICATION
    =============================== */
    isVerified: {
      type: Boolean,
      default: false,
    },

    otp: {
      type: String,
      default: null,
    },

    otpExpiry: {
      type: Date,
      default: null,
    },

    /* ===============================
       PROFILE (for future UI)
    =============================== */
    avatar: {
      type: String,
      default: null,
    },

    /* ===============================
       AUTH PROVIDER (future proof)
    =============================== */
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },

    /* ===============================
       ACCOUNT STATUS
    =============================== */
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },

    /* ===============================
       LAST LOGIN TRACKING
    =============================== */
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/* ===============================
   🔥 CLEANUP OTP AFTER EXPIRY (OPTIONAL)
=============================== */
userSchema.methods.isOtpValid = function (otp) {
  return (
    this.otp === otp &&
    this.otpExpiry &&
    this.otpExpiry > new Date()
  );
};

export default mongoose.model("User", userSchema);