import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendOTPEmail, sendResetPasswordEmail } from "../utils/sendEmail.js";

/* ======================
   OTP GENERATOR
====================== */
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/* ======================
   REGISTER (WITH OTP)
====================== */
export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check existing user
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        message: "User already exists, continue to login."
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();

    // Create user first
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      otp,
      otpExpiry: Date.now() + 10 * 60 * 1000, // 10 min
      isVerified: false
    });


    console.log("Reached OTP email send step");

    // Send OTP email (ISOLATED FAILURE)
    try {
      console.log("Sending OTP email to:", email);
      await sendOTPEmail(email, otp);
    } catch (emailError) {
      console.error("OTP email failed:", emailError);
      
      console.log("\n=============================================");
      console.log(`📢 [LOCAL DEV FALLBACK] OTP CODE FOR ${email}: ${otp}`);
      console.log("=============================================\n");
    }

    return res.status(201).json({
      message: "OTP sent. (Local development fallback: check terminal console log if email fails)."
    });

  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({
      message: "Registration failed"
    });
  }
};

/* ======================
   VERIFY OTP
====================== */
export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "User not found" });

    if (user.isVerified)
      return res.status(400).json({ message: "Already verified" });

    if (user.otp !== otp || user.otpExpiry < Date.now())
      return res.status(400).json({ message: "Invalid or expired OTP" });

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    return res.json({ message: "Email verified successfully" });

  } catch (err) {
    console.error("Verify OTP error:", err);
    return res.status(500).json({
      message: "OTP verification failed"
    });
  }
};

/* ======================
   LOGIN
====================== */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Invalid credentials" });

    if (!user.isVerified)
      return res.status(403).json({
        message: "Please verify your email first"
      });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Login failed" });
  }
};

/* ======================
   RESEND OTP
====================== */
export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "User not found" });

    if (user.isVerified)
      return res.status(400).json({ message: "User already verified" });

    const otp = generateOTP();

    user.otp = otp;
    user.otpExpiry = Date.now() + 10 * 60 * 1000;
    await user.save();

    try {
      console.log("Resending OTP to:", email);
      await sendOTPEmail(email, otp);
    } catch (emailError) {
      console.error("Resend OTP email failed:", emailError);
      
      console.log("\n=============================================");
      console.log(`📢 [LOCAL DEV FALLBACK RESEND] OTP CODE FOR ${email}: ${otp}`);
      console.log("=============================================\n");
    }

    return res.json({ message: "OTP resent successfully. (Local development fallback: check terminal console log if email fails)." });

  } catch (err) {
    console.error("Resend OTP error:", err);
    return res.status(500).json({
      message: "Failed to resend OTP"
    });
  }
};

/* ======================
   FORGOT PASSWORD
====================== */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: "No account found with this email." });
    }

    const otp = generateOTP();
    user.resetOtp = otp;
    user.resetOtpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    try {
      await sendResetPasswordEmail(email, otp);
    } catch (emailError) {
      console.error("Reset email failed:", emailError);
      console.log("\n=============================================");
      console.log(`\uD83D\uDCE2 [LOCAL DEV FALLBACK] RESET OTP FOR ${email}: ${otp}`);
      console.log("=============================================\n");
    }

    return res.json({ message: "Reset code sent to your email." });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

/* ======================
   RESET PASSWORD
====================== */
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (!user.resetOtp || user.resetOtp !== otp) {
      return res.status(400).json({ message: "Invalid reset code." });
    }

    if (!user.resetOtpExpiry || user.resetOtpExpiry < new Date()) {
      return res.status(400).json({ message: "Reset code has expired. Please request a new one." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetOtp = null;
    user.resetOtpExpiry = null;
    await user.save();

    return res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ message: "Failed to reset password." });
  }
};
