import { Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import "../styles/header.css";
import { SITE_NAME } from "../config/siteConfig";

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef(null);

  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  /* ===============================
     USER SYNC
  =============================== */
  useEffect(() => {
    const syncUser = () => {
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    };

    syncUser();

    window.addEventListener("storage", syncUser);
    window.addEventListener("user-updated", syncUser);

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("user-updated", syncUser);
    };
  }, []);

  /* ===============================
     CLOSE DROPDOWN
  =============================== */
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    setOpen(false);
    setMobileOpen(false);
    navigate("/auth");
  };

  const displayName = user?.name || "User";
  const displayEmail = user?.email || "";

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/" && location.hash === "";
    if (path.startsWith("/#")) return location.hash === path.substring(1);
    return location.pathname.startsWith(path);
  };

  return (
    <header className="header">
      <div className="header-container">
        {/* LEFT: LOGO */}
        <Link to="/" className="logo" onClick={() => setMobileOpen(false)}>
          <img src="/assets/logo.png" alt="Unicloud Logo" className="logo-img" style={{ height: "28px", objectFit: "contain" }} />
          <span className="logo-text">Unicloud</span>
        </Link>

        {/* CENTER: NAV LINKS */}
        <nav className={`nav-links ${mobileOpen ? "mobile-open" : ""}`}>
          <Link to="/#features" className={`nav-item ${isActive("/#features") ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
            Home
          </Link>
          <Link to="/about" className={`nav-item ${isActive("/about") ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
            About
          </Link>

          {user && (
            <>
              <Link to="/dashboard" className={`nav-item ${isActive("/dashboard") ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
                Dashboard
              </Link>
              <Link to="/files" className={`nav-item ${isActive("/files") ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
                Files
              </Link>
              <Link to="/photos" className={`nav-item ${isActive("/photos") ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
                Photos
              </Link>
              <Link to="/optimize" className={`nav-item ${isActive("/optimize") ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
                Optimize
              </Link>
              <Link to="/transfer" className={`nav-item ${isActive("/transfer") ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
                Transfer
              </Link>
              <Link to="/manage-accounts" className={`nav-item ${isActive("/manage-accounts") ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
                Manage Accounts
              </Link>
              <Link to="/upload" className="header-upload-btn" onClick={() => setMobileOpen(false)}>
                + Upload
              </Link>
            </>
          )}
        </nav>

        {/* RIGHT: AUTH / PROFILE */}
        <div className="nav-right">
          <button className="mobile-toggle-btn" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {mobileOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          {!user ? (
            <Link to="/auth" className="btn-primary">
              Login / Sign Up
            </Link>
          ) : (
            <div className="profile-wrap" ref={dropdownRef}>
              <button
                className={`profile-btn ${open ? "active" : ""}`}
                onClick={() => setOpen((p) => !p)}
                aria-label="User menu"
              >
                <div className="avatarheader" style={{ padding: user?.avatar ? "0" : undefined, overflow: "hidden" }}>
                  {user?.avatar ? (
                    <img src={user.avatar} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                  ) : (
                    displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <span className="username">{displayName}</span>
                <svg className={`chevron ${open ? "rotate" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {open && (
                <div className="profile-dropdown">
                  <div className="dropdown-user">
                    <div className="dropdown-avatar" style={{ padding: user?.avatar ? "0" : undefined, overflow: "hidden" }}>
                      {user?.avatar ? (
                        <img src={user.avatar} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                      ) : (
                        displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="dropdown-user-info">
                      <strong>{displayName}</strong>
                      {displayEmail && <p className="muted">{displayEmail}</p>}
                    </div>
                  </div>

                  <div className="dropdown-divider" />

                  <button className="dropdown-item" onClick={() => { setOpen(false); navigate("/dashboard"); }}>
                    <span className="icon">📊</span> Dashboard
                  </button>

                  <button className="dropdown-item" onClick={() => { setOpen(false); navigate("/manage-accounts"); }}>
                    <span className="icon">☁️</span> Manage Accounts
                  </button>

                  <button className="dropdown-item" onClick={() => { setOpen(false); navigate("/profile"); }}>
                    <span className="icon">⚙️</span> Profile Settings
                  </button>

                  <div className="dropdown-divider" />

                  <button className="dropdown-item danger" onClick={handleLogout}>
                    <span className="icon">🚪</span> Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;