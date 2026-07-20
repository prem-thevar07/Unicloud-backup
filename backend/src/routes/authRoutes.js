import express from "express";
import passport from "passport";
import { register, verifyOTP, login, resendOTP, forgotPassword, resetPassword } from "../controllers/authController.js";

const router = express.Router();

router.post("/register", register);
router.post("/verify-otp", verifyOTP);
router.post("/login", login);
router.post("/resend-otp", resendOTP);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Google Auth for Login
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/login" }),
  (req, res) => {
    // Generate JWT for user
    import("jsonwebtoken").then((jwt) => {
      const token = jwt.default.sign(
        { 
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          avatar: req.user.avatar
        },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );
      res.redirect(`${process.env.FRONTEND_URL}/auth/success?token=${token}`);
    });
  }
);

export default router;