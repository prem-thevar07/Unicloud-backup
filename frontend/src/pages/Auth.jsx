import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser, registerUser } from "../services/authService";
import "../styles/auth.css";

/* ===============================
   PASSWORD CHECK FUNCTION
=============================== */
const validatePassword = (password) => ({
  length: password.length >= 8,
  upper: /[A-Z]/.test(password),
  lower: /[a-z]/.test(password),
  number: /[0-9]/.test(password),
  special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
});

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const [passwordChecks, setPasswordChecks] = useState({
    length: false,
    upper: false,
    lower: false,
    number: false,
    special: false
  });

  const isPasswordValid = Object.values(passwordChecks).every(Boolean);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  /* ===============================
     HANDLE TAB SWITCH
  =============================== */
  const handleTabSwitch = (isLoginMode) => {
    setIsLogin(isLoginMode);
    setError("");
    setForm({ name: "", email: "", password: "", confirmPassword: "" });
  };

  /* ===============================
     HANDLE INPUT CHANGE
  =============================== */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(""); // Clear error on typing

    if (name === "password" && !isLogin) {
      setPasswordChecks(validatePassword(value));
    }
  };

  /* ===============================
     HANDLE SUBMIT
  =============================== */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (loading) return;

    /* ---------- LOGIN ---------- */
    if (isLogin) {
      if (!form.email || !form.password) {
        setError("Please enter both email and password.");
        return;
      }

      try {
        setLoading(true);

        const res = await loginUser({
          email: form.email,
          password: form.password
        });

        localStorage.setItem("token", res.data.token);
        localStorage.setItem("user", JSON.stringify(res.data.user));

        navigate("/dashboard");
        window.location.reload();
      } catch (err) {
        const message = err.response?.data?.message;

        if (message === "Please verify your email first") {
          navigate("/verify-otp", {
            state: { email: form.email }
          });
        } else {
          setError(message || "Invalid email or password.");
        }
      } finally {
        setLoading(false);
      }

      return;
    }

    /* ---------- SIGN UP ---------- */
    if (!form.name || !form.email || !form.password || !form.confirmPassword) {
      setError("Please fill in all required fields.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!isPasswordValid) {
      setError("Password does not meet security requirements.");
      return;
    }

    try {
      setLoading(true);

      await registerUser({
        name: form.name,
        email: form.email,
        password: form.password
      });

      navigate("/verify-otp", {
        state: { email: form.email }
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to create account. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  /* ===============================
     GOOGLE LOGIN
  =============================== */
  const googleLogin = () => {
    const backendBaseUrl = import.meta.env.VITE_API_BASE_URL.replace("/api", "");
    window.location.href = `${backendBaseUrl}/api/auth/google`;
  };

  return (
    <>
      {/* 🔄 GLOBAL LOADING OVERLAY */}
      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>{isLogin ? "Signing in..." : "Sending OTP to your email..."}</p>
        </div>
      )}

      <main className="auth-wrapper">
        <div className="glow-orb orb-1"></div>
        <div className="glow-orb orb-2"></div>

        <div className="auth-card">
          <div className="auth-header">
            <img src="/assets/logo.png" alt="Unicloud Logo" className="auth-logo" />
            <h1>{isLogin ? "Welcome back" : "Create an account"}</h1>
            <p className="auth-subtitle">
              {isLogin
                ? "Sign in to access your unified dashboard."
                : "Create an account for your unified cloud experience."}
            </p>
          </div>

          <div className="auth-tabs">
            <button
              className={`auth-tab ${isLogin ? "active" : ""}`}
              onClick={() => handleTabSwitch(true)}
              type="button"
              disabled={loading}
            >
              Login
            </button>
            <button
              className={`auth-tab ${!isLogin ? "active" : ""}`}
              onClick={() => handleTabSwitch(false)}
              type="button"
              disabled={loading}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="auth-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                {error}
              </div>
            )}

            {!isLogin && (
              <div className="input-group">
                <input
                  type="text"
                  name="name"
                  placeholder="Full name"
                  value={form.name}
                  onChange={handleChange}
                  className="auth-input"
                />
              </div>
            )}

            <div className="input-group">
              <input
                type="email"
                name="email"
                placeholder="Email address"
                value={form.email}
                onChange={handleChange}
                className="auth-input"
              />
            </div>

            <div className="input-group">
              <input
                type="password"
                name="password"
                placeholder="Password"
                value={form.password}
                onChange={handleChange}
                className="auth-input"
              />
            </div>

            {isLogin && (
              <div className="forgot-password">
                <a href="/forgot-password" onClick={(e) => { e.preventDefault(); navigate("/forgot-password"); }}>
                  Forgot password?
                </a>
              </div>
            )}

            {/* 🔐 PASSWORD CHECKLIST */}
            {!isLogin && (
              <div className="password-checklist">
                <div className={passwordChecks.length ? "check done" : "check"}>
                  <div className="check-icon">✓</div>
                  <span>8+ characters</span>
                </div>
                <div className={passwordChecks.upper ? "check done" : "check"}>
                  <div className="check-icon">✓</div>
                  <span>1 uppercase</span>
                </div>
                <div className={passwordChecks.number ? "check done" : "check"}>
                  <div className="check-icon">✓</div>
                  <span>1 number</span>
                </div>
                <div className={passwordChecks.special ? "check done" : "check"}>
                  <div className="check-icon">✓</div>
                  <span>1 special</span>
                </div>
              </div>
            )}

            {!isLogin && (
              <div className="input-group">
                <input
                  type="password"
                  name="confirmPassword"
                  placeholder="Confirm password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  className="auth-input"
                />
              </div>
            )}

            <button
              className="primary-btn"
              type="submit"
              disabled={loading || (!isLogin && !isPasswordValid)}
            >
              {loading
                ? isLogin
                  ? "Signing in..."
                  : "Creating account..."
                : isLogin
                ? "Sign in"
                : "Create account"}
            </button>

            <div className="divider">or continue with</div>

            <button
              type="button"
              className="google-btn"
              onClick={googleLogin}
              disabled={loading}
            >
              <img src="/assets/google.png" alt="Google" className="google-icon" />
              Google
            </button>
          </form>
        </div>
      </main>
    </>
  );
};

export default Auth;
