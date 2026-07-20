import bcrypt from "bcryptjs";
import User from "../models/User.js";
import CloudAccount from "../models/CloudAccount.js";
import ActivityLog from "../models/ActivityLog.js";
import { sendDeleteAccountEmail } from "../utils/sendEmail.js";

// ================================
// GET PROFILE SUMMARY
// ================================
export const getProfileSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Fetch all accounts connected to the user from DB (instant)
    const accounts = await CloudAccount.find({ userId });

    const googleDriveConnected = accounts.some(a => a.provider === "google");
    const oneDriveConnected = accounts.some(a => a.provider === "onedrive");
    const dropboxConnected = accounts.some(a => a.provider === "dropbox");
    const s3Connected = accounts.some(a => a.provider === "s3");
    const boxConnected = accounts.some(a => a.provider === "box");

    let used = 0;
    let total = 0;

    const breakdown = {
      googleDrive: null,
      oneDrive: null,
      dropbox: null,
      s3: null,
      box: null,
    };

    accounts.forEach((acc) => {
      if (acc.storage) {
        used += acc.storage.used || 0;
        total += acc.storage.total || 0;

        let key = acc.provider;
        if (key === "google") key = "googleDrive";
        if (key === "onedrive") key = "oneDrive";

        if (breakdown[key] === null) {
          breakdown[key] = { used: 0, total: 0 };
        }
        breakdown[key].used += acc.storage.used || 0;
        breakdown[key].total += acc.storage.total || 0;
      }
    });

    const hasAnyConnected = accounts.length > 0;

    res.json({
      user: {
        name: user.name,
        email: user.email,
        avatar: user.avatar || null,
      },
      connectedAccounts: {
        googleDrive: googleDriveConnected ? { connected: true } : null,
        oneDrive: oneDriveConnected ? { connected: true } : null,
        dropbox: dropboxConnected ? { connected: true } : null,
        s3: s3Connected ? { connected: true } : null,
        box: boxConnected ? { connected: true } : null,
      },
      totalAccounts: accounts.length,
      storage: hasAnyConnected
        ? {
            used,
            total,
            breakdown,
          }
        : null,
    });
  } catch (err) {
    console.error("Profile summary error:", err);
    res.status(500).json({ message: "Failed to load profile" });
  }
};

// ================================
// UPDATE PROFILE NAME
// ================================
export const updateProfileName = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: "Invalid name" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { name: name.trim() },
      { new: true }
    ).select("name");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      success: true,
      name: user.name,
    });
  } catch (err) {
    console.error("Update name error:", err);
    res.status(500).json({ message: "Failed to update name" });
  }
};


// ================================
// CHANGE PASSWORD
// ================================
export const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ message: "Failed to change password" });
  }
};

// ================================
// UPLOAD PROFILE PICTURE
// ================================
export const uploadProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const fs = await import("fs");
    let avatarUrl = "";

    const hasCloudinaryEnv =
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET;

    if (hasCloudinaryEnv) {
      console.log("☁️ Cloudinary credentials found. Uploading avatar to Cloudinary...");
      const { v2: cloudinary } = await import("cloudinary");
      
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });

      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: "unicloud_avatars",
        resource_type: "image",
      });

      avatarUrl = uploadResult.secure_url;

      // Clean up local temp file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } else {
      console.warn("⚠️ Cloudinary credentials missing. Falling back to local disk storage.");
      const backendBaseUrl = process.env.BACKEND_URL || "http://localhost:5001";
      avatarUrl = `${backendBaseUrl}/uploads/${req.file.filename}`;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { avatar: avatarUrl },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      success: true,
      avatar: user.avatar,
    });
  } catch (err) {
    console.error("Upload profile picture error:", err);
    
    // Clean up local file in case of crash
    try {
      const fs = await import("fs");
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (_) {}

    res.status(500).json({ message: "Failed to upload picture", error: err.message });
  }
};

// ================================
// REQUEST ACCOUNT DELETION (OTP)
// ================================
export const requestAccountDeletion = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.deleteOtp = otp;
    user.deleteOtpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    try {
      await sendDeleteAccountEmail(user.email, otp);
    } catch (emailError) {
      console.error("Account deletion email sending failed:", emailError);
      console.log("\n=============================================");
      console.log(`📢 [LOCAL DEV FALLBACK] DELETE ACCOUNT OTP FOR ${user.email}: ${otp}`);
      console.log("=============================================\n");
    }

    res.json({ message: "Deletion verification code sent to your email." });
  } catch (err) {
    console.error("Request account deletion error:", err);
    res.status(500).json({ message: "Failed to request account deletion." });
  }
};

// ================================
// CONFIRM ACCOUNT DELETION (CASCADE)
// ================================
export const confirmAccountDeletion = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ message: "Verification OTP is required." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (!user.deleteOtp || user.deleteOtp !== otp) {
      return res.status(400).json({ message: "Invalid verification code." });
    }

    if (!user.deleteOtpExpiry || user.deleteOtpExpiry < new Date()) {
      return res.status(400).json({ message: "Verification code has expired. Please try again." });
    }

    // CASCADE DELETIONS
    console.log(`Cascading account deletion for user: ${userId} (${user.email})`);
    
    // 1. Delete all Cloud Accounts (access tokens, linked storages)
    const cloudDel = await CloudAccount.deleteMany({ userId });
    console.log(`Deleted ${cloudDel.deletedCount} cloud accounts`);

    // 2. Delete all Activity Logs
    const logsDel = await ActivityLog.deleteMany({ userId });
    console.log(`Deleted ${logsDel.deletedCount} activity logs`);

    // 3. Finally, delete the User profile itself
    await User.findByIdAndDelete(userId);
    console.log(`Deleted User document`);

    res.json({ success: true, message: "Account and all associated sync integrations have been permanently deleted." });
  } catch (err) {
    console.error("Confirm account deletion error:", err);
    res.status(500).json({ message: "Failed to confirm account deletion." });
  }
};

