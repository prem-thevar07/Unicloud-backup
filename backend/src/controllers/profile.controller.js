import bcrypt from "bcryptjs";
import User from "../models/User.js";
import CloudAccount from "../models/CloudAccount.js";

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

    const googleAccount = await CloudAccount.findOne({
      userId,
      provider: "google",
    });

    const dropboxAccount = await CloudAccount.findOne({
      userId,
      provider: "dropbox",
    });

    const onedriveAccount = await CloudAccount.findOne({
      userId,
      provider: "onedrive",
    });

    const googleConnected = !!googleAccount;
    const dropboxConnected = !!dropboxAccount;
    const onedriveConnected = !!onedriveAccount;

    // Calculate aggregate storage across all active accounts
    let used = 0;
    let total = 0;
    if (googleAccount && googleAccount.storage) {
      used += googleAccount.storage.used || 0;
      total += googleAccount.storage.total || 0;
    }
    if (dropboxAccount && dropboxAccount.storage) {
      used += dropboxAccount.storage.used || 0;
      total += dropboxAccount.storage.total || 0;
    }
    if (onedriveAccount && onedriveAccount.storage) {
      used += onedriveAccount.storage.used || 0;
      total += onedriveAccount.storage.total || 0;
    }

    res.json({
      user: {
        name: user.name,
        email: user.email,
        avatar: user.avatar || null,
      },
      connectedAccounts: {
        googleDrive: googleConnected,
        oneDrive: onedriveConnected,
        dropbox: dropboxConnected,
      },
      storage: (googleConnected || dropboxConnected || onedriveConnected)
        ? { used, total }
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

    const backendBaseUrl = process.env.BACKEND_URL || "http://localhost:5001";
    const avatarUrl = `${backendBaseUrl}/uploads/${req.file.filename}`;

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
    res.status(500).json({ message: "Failed to upload picture" });
  }
};
