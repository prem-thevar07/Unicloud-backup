import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { forgotPassword, resetPassword } from "../services/authService";
import "../styles/forgotPassword.css";

/* ===============================
   PASSWORD VALIDATION
=============================== */
const validatePassword = (password) => ({
  length: password.length >= 8,
  upper: /[A-Z]/.test(password),
  number: /[0-9]/.test(password),
  special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
});

const ForgotPassword = () => {
  const navigate = useNavigate();

  // Step: 1=email, 2=otp, 3=newPassword, 4=success
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const otpRefs = useRef([]);

  const passwordChecks = validatePassword(newPassword);
  const isPasswordValid = Object.values(passwordChecks).every(Boolean);

  /* ===============================
     RESEND COOLDOWN TIMER
  =============================== */
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  /* ===============================
     STEP 1: REQUEST RESET CODE
  =============================== */
  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);
      await forgotPassword({ email: email.trim() });
      setSuccess("Reset code sent! Check your email.");
      setResendCooldown(60);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send reset code.");
    } finally {
      setLoading(false);
    }
  };

  /* ===============================
     OTP INPUT HANDLERS
  =============================== */
  const handleOtpChange = (index, value) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError("");

    // Auto-focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").trim().slice(0, 6);
    if (/^\d+$/.test(pasted)) {
      const chars = pasted.split("");
      const newOtp = [...otp];
      chars.forEach((c, i) => { newOtp[i] = c; });
      setOtp(newOtp);
      const focusIdx = Math.min(chars.length, 5);
      otpRefs.current[focusIdx]?.focus();
    }
  };

  /* ===============================
     STEP 2: VERIFY OTP — MOVE TO STEP 3
  =============================== */
  const handleVerifyOtp = (e) => {
    e.preventDefault();
    setError("");
    const otpString = otp.join("");
    if (otpString.length !== 6) {
      setError("Please enter the full 6-digit code.");
      return;
    }
    setSuccess("");
    setStep(3);
  };

  /* ===============================
     STEP 3: RESET PASSWORD
  =============================== */
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!isPasswordValid) {
      setError("Password does not meet security requirements.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      await resetPassword({
        email: email.trim(),
        otp: otp.join(""),
        newPassword
      });
      setStep(4);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  /* ===============================
     RESEND CODE
  =============================== */
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError("");
    try {
      await forgotPassword({ email: email.trim() });
      setSuccess("New reset code sent!");
      setResendCooldown(60);
      setOtp(["", "", "", "", "", ""]);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to resend code.");
    }
  };

  /* ===============================
     RENDER
  =============================== */
  return (
    <div className="forgot-wrapper">
      <div className="forgot-orb o1" />
      <div className="forgot-orb o2" />

      <div className="forgot-card">
        {/* LOGO */}
        <div className="forgot-header">
          <img src="/assets/logo.png" alt="Unicloud" className="forgot-logo" />
          <h1>
            {step === 1 && "Forgot password?"}
            {step === 2 && "Enter reset code"}
            {step === 3 && "Create new password"}
            {step === 4 && "Password reset!"}
          </h1>
          <p className="forgot-subtitle">
            {step === 1 && "Enter your email and we'll send you a reset code."}
            {step === 2 && `We sent a 6-digit code to ${email}`}
            {step === 3 && "Choose a strong password for your account."}
            {step === 4 && "Your password has been updated successfully."}
          </p>
        </div>

        {/* STEP DOTS */}
        {step < 4 && (
          <div className="step-indicator">
            <div className={`step-dot ${step === 1 ? "active" : "done"}`} />
            <div className={`step-dot ${step === 2 ? "active" : step > 2 ? "done" : ""}`} />
            <div className={`step-dot ${step === 3 ? "active" : ""}`} />
          </div>
        )}

        {/* ERROR */}
        {error && (
          <div className="forgot-error">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* SUCCESS */}
        {success && step !== 4 && (
          <div className="forgot-success">
            <span>✅</span> {success}
          </div>
        )}

        {/* ============ STEP 1: EMAIL ============ */}
        {step === 1 && (
          <form onSubmit={handleRequestCode}>
            <input
              type="email"
              className="forgot-input"
              placeholder="Email address"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              autoFocus
            />
            <button className="forgot-btn" disabled={loading}>
              {loading ? "Sending..." : "Send reset code"}
            </button>
          </form>
        )}

        {/* ============ STEP 2: OTP ============ */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp}>
            <div className="otp-input-group" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (otpRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value.replace(/\D/, ""))}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  autoFocus={i === 0}
                />
              ))}
            </div>

            <button className="forgot-btn" disabled={otp.join("").length !== 6}>
              Verify code
            </button>

            <div className="resend-section">
              <span>Didn't receive a code? </span>
              <button
                type="button"
                className="resend-link"
                onClick={handleResend}
                disabled={resendCooldown > 0}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}

        {/* ============ STEP 3: NEW PASSWORD ============ */}
        {step === 3 && (
          <form onSubmit={handleResetPassword}>
            <input
              type="password"
              className="forgot-input"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
              autoFocus
            />

            <div className="forgot-password-checks">
              <div className={`forgot-check-item ${passwordChecks.length ? "valid" : ""}`}>
                <span>{passwordChecks.length ? "✅" : "⭕"}</span> 8+ characters
              </div>
              <div className={`forgot-check-item ${passwordChecks.upper ? "valid" : ""}`}>
                <span>{passwordChecks.upper ? "✅" : "⭕"}</span> 1 uppercase
              </div>
              <div className={`forgot-check-item ${passwordChecks.number ? "valid" : ""}`}>
                <span>{passwordChecks.number ? "✅" : "⭕"}</span> 1 number
              </div>
              <div className={`forgot-check-item ${passwordChecks.special ? "valid" : ""}`}>
                <span>{passwordChecks.special ? "✅" : "⭕"}</span> 1 special
              </div>
            </div>

            <input
              type="password"
              className="forgot-input"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
            />

            <button className="forgot-btn" disabled={loading || !isPasswordValid}>
              {loading ? "Resetting..." : "Reset password"}
            </button>
          </form>
        )}

        {/* ============ STEP 4: SUCCESS ============ */}
        {step === 4 && (
          <div style={{ textAlign: "center" }}>
            <span className="success-icon">🎉</span>
            <button className="forgot-btn" onClick={() => navigate("/auth")}>
              Back to Login
            </button>
          </div>
        )}

        {/* BACK TO LOGIN */}
        {step < 4 && (
          <div className="back-to-login">
            <Link to="/auth">← Back to Login</Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
