import express from "express";
import multer from "multer";
import path from "path";
import {
  getProfileSummary,
  updateProfileName,
  changePassword,
  uploadProfilePicture,
  requestAccountDeletion,
  confirmAccountDeletion,
} from "../controllers/profile.controller.js";
import auth from "../middleware/auth.middleware.js";

const router = express.Router();

// Multer config for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "profile-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Not an image! Please upload an image."), false);
    }
  },
});

router.get("/summary", auth, getProfileSummary);
router.put("/update-name", auth, updateProfileName);
router.put("/change-password", auth, changePassword);
router.post("/upload-picture", auth, upload.single("avatar"), uploadProfilePicture);

// Account deletion endpoints
router.post("/request-delete", auth, requestAccountDeletion);
router.post("/confirm-delete", auth, confirmAccountDeletion);

export default router;
