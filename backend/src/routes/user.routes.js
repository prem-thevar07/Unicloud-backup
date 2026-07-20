import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import CloudAccount from "../models/CloudAccount.js";


const router = express.Router();

/**
 * UPDATE PROFILE (NAME)
 */
router.put("/profile", authMiddleware, async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Name is required" });
        }

        const user = await User.findById(req.user.id);
        user.name = name;
        await user.save();

        res.json({
            message: "Profile updated",
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to update profile" });
    }
});

router.put("/password", authMiddleware, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        const user = await User.findById(req.user.id);

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Incorrect current password" });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({ message: "Password updated successfully" });
    } catch (err) {
        res.status(500).json({ message: "Failed to update password" });
    }
});

router.delete("/google", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    user.google = undefined; // or null
    await user.save();

    res.json({ message: "Google Drive disconnected" });
  } catch (err) {
    res.status(500).json({ message: "Failed to disconnect Google Drive" });
  }
});


router.get("/profile/summary", authMiddleware, async (req, res) => {
  try {
    const accounts = await CloudAccount.find({ userId: req.user.id });
    const googleConnected = accounts.some(acc => acc.provider === "google");
    const dropboxConnected = accounts.some(acc => acc.provider === "dropbox");
    const onedriveConnected = accounts.some(acc => acc.provider === "onedrive");

    let used = 0;
    let total = 0;
    accounts.forEach(acc => {
      if (acc.storage) {
        used += acc.storage.used || 0;
        total += acc.storage.total || 0;
      }
    });

    res.json({
      connectedAccounts: {
        googleDrive: googleConnected,
        oneDrive: onedriveConnected,
        dropbox: dropboxConnected,
      },
      storage: accounts.length > 0 ? { used, total } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load profile summary" });
  }
});





export default router;
