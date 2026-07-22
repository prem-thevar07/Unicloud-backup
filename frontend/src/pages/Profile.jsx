import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import API from "../config/api";
import "../styles/profile.css";
import Header from "../components/Header";

const Profile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState("");
  const [updating, setUpdating] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);

  // Change password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordUpdating, setPasswordUpdating] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Unlinking confirmation modal
  const [unlinkAccount, setUnlinkAccount] = useState(null); // null or { id, provider, email }
  const [unlinking, setUnlinking] = useState(false);

  // Dynamic toasts
  const [toast, setToast] = useState(null); // null or { type: "success" | "error", message }
  const toastTimeoutRef = useRef(null);

  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  // Account Deletion States
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1); // 1 = request/warning, 2 = enter otp
  const [deleteOtp, setDeleteOtp] = useState(["", "", "", "", "", ""]);
  const [deleteCooldown, setDeleteCooldown] = useState(0);
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const deleteOtpRefs = useRef([]);

  useEffect(() => {
    if (deleteCooldown <= 0) return;
    const timer = setTimeout(() => setDeleteCooldown(deleteCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [deleteCooldown]);

  const handleRequestDeleteOtp = async () => {
    setDeleteError("");
    setDeleteLoading(true);
    try {
      await API.post("/profile/request-delete");
      setDeleteCooldown(60);
      setDeleteStep(2);
      setDeleteOtp(["", "", "", "", "", ""]);
    } catch (err) {
      setDeleteError(err.response?.data?.message || "Failed to request deletion code.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    setDeleteError("");
    const otpString = deleteOtp.join("");
    if (otpString.length !== 6) {
      setDeleteError("Please enter the full 6-digit code.");
      return;
    }
    setDeleteLoading(true);
    try {
      await API.post("/profile/confirm-delete", { otp: otpString });
      localStorage.clear();
      showToast("success", "Account deleted successfully.");
      setTimeout(() => {
        navigate("/auth");
        window.location.reload();
      }, 1500);
    } catch (err) {
      setDeleteError(err.response?.data?.message || "Failed to delete account. Please check the code.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteOtpChange = (index, value) => {
    if (value.length > 1) return;
    const newOtp = [...deleteOtp];
    newOtp[index] = value;
    setDeleteOtp(newOtp);
    setDeleteError("");

    if (value && index < 5) {
      deleteOtpRefs.current[index + 1]?.focus();
    }
  };

  const handleDeleteOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !deleteOtp[index] && index > 0) {
      deleteOtpRefs.current[index - 1]?.focus();
    }
  };

  const handleDeleteOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").trim().slice(0, 6);
    if (/^\d+$/.test(pasted)) {
      const chars = pasted.split("");
      const newOtp = [...deleteOtp];
      chars.forEach((c, i) => { newOtp[i] = c; });
      setDeleteOtp(newOtp);
      const focusIdx = Math.min(chars.length, 5);
      deleteOtpRefs.current[focusIdx]?.focus();
    }
  };

  const showToast = (type, message) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ type, message });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // 👤 Fetch profile
  const fetchProfile = async () => {
    try {
      const res = await API.get("/profile/summary");
      setProfile(res.data);
      setName(res.data.user.name);
    } catch (err) {
      console.error("Failed to load profile", err);
      showToast("error", "Failed to retrieve profile details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  // ✏️ Update name
  const handleNameUpdate = async () => {
    if (!name.trim()) return;

    try {
      setUpdating(true);
      await API.put("/profile/update-name", { name: name.trim() });

      // Update local state
      setProfile((prev) => ({
        ...prev,
        user: { ...prev.user, name: name.trim() },
      }));

      // Update localStorage for Header sync
      const storedUser = JSON.parse(localStorage.getItem("user"));
      if (storedUser) {
        localStorage.setItem(
          "user",
          JSON.stringify({ ...storedUser, name: name.trim() })
        );
      }

      window.dispatchEvent(new Event("user-updated"));
      setIsEditingName(false);
      showToast("success", "Name updated successfully!");
    } catch (err) {
      console.error("Failed to update name", err);
      showToast("error", err.response?.data?.message || "Failed to update name.");
    } finally {
      setUpdating(false);
    }
  };

  // 📸 Upload avatar picture
  const handlePictureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploadingPic(true);
      const formData = new FormData();
      formData.append("avatar", file);

      const res = await API.post("/profile/upload-picture", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const newAvatar = res.data.avatar;

      setProfile((prev) => ({
        ...prev,
        user: { ...prev.user, avatar: newAvatar },
      }));

      const storedUser = JSON.parse(localStorage.getItem("user"));
      if (storedUser) {
        localStorage.setItem(
          "user",
          JSON.stringify({ ...storedUser, avatar: newAvatar })
        );
      }

      window.dispatchEvent(new Event("user-updated"));
      showToast("success", "Profile picture updated!");
    } catch (err) {
      console.error("Failed to upload picture", err);
      showToast("error", err.response?.data?.message || "Failed to upload avatar.");
    } finally {
      setUploadingPic(false);
      e.target.value = null;
    }
  };

  // 🔐 Change password
  const handlePasswordUpdate = async () => {
    if (!currentPassword || !newPassword) return;
    if (newPassword.length < 6) {
      return showToast("error", "New password must be at least 6 characters.");
    }

    try {
      setPasswordUpdating(true);
      await API.put("/profile/change-password", {
        currentPassword,
        newPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      showToast("success", "Password changed successfully!");
    } catch (err) {
      showToast("error", err.response?.data?.message || "Current password incorrect.");
    } finally {
      setPasswordUpdating(false);
    }
  };

  // 🔌 Disconnect account
  const handleDisconnectConfirm = async () => {
    if (!unlinkAccount) return;
    try {
      setUnlinking(true);
      await API.delete(`/accounts/${unlinkAccount.id}`);
      showToast("success", `Unlinked account: ${unlinkAccount.email}`);
      setUnlinkAccount(null);
      // Reload profile to refresh connection desk & storage limits
      await fetchProfile();
    } catch (err) {
      console.error("Unlink error:", err);
      showToast("error", "Failed to disconnect account.");
    } finally {
      setUnlinking(false);
    }
  };

  // ⚙️ Password strength logic
  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: "None", colorClass: "" };
    if (pwd.length < 6) return { score: 1, label: "Weak", colorClass: "weak" };
    
    // Check complexity
    const hasNumbers = /\d/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    
    if (pwd.length >= 8 && hasNumbers && hasSpecial) {
      return { score: 3, label: "Strong", colorClass: "strong" };
    }
    return { score: 2, label: "Medium", colorClass: "medium" };
  };

  const formatSize = (bytes) => {
    if (!bytes) return "0 B";
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="profile-page" style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
          <p style={{ color: '#9ca3af' }}>Loading profile information...</p>
        </div>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <Header />
        <div className="profile-page" style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
          <p style={{ color: '#f87171' }}>Failed to load profile. Please refresh.</p>
        </div>
      </>
    );
  }

  const { user, connectedAccounts, storage } = profile;
  const strengthInfo = getPasswordStrength(newPassword);

  // Total connections count
  const connectionsCount = profile.totalAccounts || 0;

  return (
    <>
      <Header />

      <div className="profile-page">
        {/* Page Toast */}
        {toast && (
          <div className={`profile-toast ${toast.type}`}>
            <span>{toast.type === "success" ? "✅" : "❌"}</span>
            <span>{toast.message}</span>
          </div>
        )}

        {/* Confirmation Modal */}
        {unlinkAccount && (
          <div className="profile-modal-overlay" onClick={() => setUnlinkAccount(null)}>
            <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
              <h4>Disconnect Account</h4>
              <p>
                Are you sure you want to disconnect <strong>{unlinkAccount.email}</strong> from{" "}
                <strong>
                  {unlinkAccount.provider === "googleDrive" ? "Google Drive" : unlinkAccount.provider === "oneDrive" ? "OneDrive" : unlinkAccount.provider.charAt(0).toUpperCase() + unlinkAccount.provider.slice(1)}
                </strong>? This will remove sync and list privileges.
              </p>
              <div className="profile-modal-actions">
                <button 
                  className="profile-modal-btn-cancel" 
                  onClick={() => setUnlinkAccount(null)}
                  disabled={unlinking}
                >
                  Cancel
                </button>
                <button 
                  className="profile-modal-btn-confirm" 
                  onClick={handleDisconnectConfirm}
                  disabled={unlinking}
                >
                  {unlinking ? "Unlinking..." : "Disconnect"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="profile-header-section">
          <h1>Profile Hub</h1>
          <p>Configure personal details, inspect cloud integrations, and supervise active storage limits.</p>
        </div>

        <div className="profile-layout-grid">
          {/* LEFT COLUMN: Summary & Settings */}
          <div className="profile-column">
            {/* HERO PROFILE PICTURE & STORAGE */}
            <div className="profile-glass-card profile-card-hero">
              <div className="profile-avatar-center-wrapper">
                <div 
                  className="profile-avatar-interactive" 
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="profile-avatar-inner">
                    {user.avatar ? (
                      <img src={user.avatar} alt="Avatar" />
                    ) : (
                      user.name?.charAt(0).toUpperCase()
                    )}
                    <div className="profile-avatar-overlay">
                      <span>📷</span>
                      <span>Upload</span>
                    </div>
                  </div>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept="image/*"
                  onChange={handlePictureUpload}
                  disabled={uploadingPic}
                />
                <h4 style={{ fontSize: "20px", fontWeight: "700", color: "#f3f4f6", margin: "4px 0" }}>
                  {user.name}
                </h4>
                <p style={{ fontSize: "13px", color: "#9ca3af" }}>{user.email}</p>
                <span className="avatar-upload-subtext">
                  {uploadingPic ? "Uploading..." : "Click photo to edit"}
                </span>
              </div>

              {/* STORAGE UTILIZATION */}
              <div className="profile-storage-info">
                <div className="profile-storage-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: "8px", fontSize: "13px", color: "#9ca3af", gap: "16px" }}>
                  <span>Aggregate Cloud Storage</span>
                  {storage ? (
                    <span className="highlight" style={{ fontWeight: "600", color: "#e5e7eb", textAlign: "right", marginLeft: "auto" }}>
                      {formatSize(storage.used)} / {formatSize(storage.total)} used
                    </span>
                  ) : (
                    <span style={{ textAlign: "right", marginLeft: "auto" }}>0 B used</span>
                  )}
                </div>
                <div className="profile-storage-progress-bg">
                  <div 
                    className="profile-storage-progress-fill"
                    style={{ 
                      width: storage ? `${Math.min((storage.used / storage.total) * 100, 100)}%` : "0%" 
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                  <span className="profile-storage-subtext">
                    Total Connected accounts: {connectionsCount}
                  </span>
                  {storage && (
                    <span className="profile-storage-subtext" style={{ fontWeight: "600", color: "#9ca3af" }}>
                      {((storage.used / storage.total) * 100).toFixed(1)}% full
                    </span>
                  )}
                </div>

                {/* Storage Breakdown Details */}
                {storage?.breakdown && (
                  <div style={{ marginTop: "16px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
                    <h5 style={{ fontSize: "11px", fontWeight: "600", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "8px" }}>
                      Storage Breakdown
                    </h5>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {storage.breakdown.googleDrive && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#9ca3af" }}>
                          <span>Google Drive</span>
                          <span style={{ color: "#e5e7eb", fontWeight: "500" }}>
                            {formatSize(storage.breakdown.googleDrive.used)} / {formatSize(storage.breakdown.googleDrive.total)}
                          </span>
                        </div>
                      )}
                      {storage.breakdown.oneDrive && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#9ca3af" }}>
                          <span>OneDrive</span>
                          <span style={{ color: "#e5e7eb", fontWeight: "500" }}>
                            {formatSize(storage.breakdown.oneDrive.used)} / {formatSize(storage.breakdown.oneDrive.total)}
                          </span>
                        </div>
                      )}
                      {storage.breakdown.dropbox && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#9ca3af" }}>
                          <span>Dropbox</span>
                          <span style={{ color: "#e5e7eb", fontWeight: "500" }}>
                            {formatSize(storage.breakdown.dropbox.used)} / {formatSize(storage.breakdown.dropbox.total)}
                          </span>
                        </div>
                      )}
                      {storage.breakdown.s3 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#9ca3af" }}>
                          <span>Amazon S3</span>
                          <span style={{ color: "#e5e7eb", fontWeight: "500" }}>
                            {formatSize(storage.breakdown.s3.used)} / {formatSize(storage.breakdown.s3.total)}
                          </span>
                        </div>
                      )}
                      {storage.breakdown.box && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#9ca3af" }}>
                          <span>Box</span>
                          <span style={{ color: "#e5e7eb", fontWeight: "500" }}>
                            {formatSize(storage.breakdown.box.used)} / {formatSize(storage.breakdown.box.total)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ACCOUNT PREFERENCES */}
            <div className="profile-glass-card profile-card-preferences">
              <h3>Account Preferences</h3>
              
              <div className="profile-form-group">
                <label>Name</label>
                <div className="profile-input-wrapper">
                  <input
                    value={name}
                    disabled={!isEditingName}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                  />
                </div>
              </div>

              <div className="profile-form-group">
                <label>Email Address</label>
                <div className="profile-input-wrapper has-icon">
                  <input value={user.email} disabled />
                  <span className="profile-input-icon">🔒</span>
                </div>
              </div>

              {!isEditingName ? (
                <button
                  className="profile-btn-primary"
                  onClick={() => setIsEditingName(true)}
                >
                  Edit Profile Name
                </button>
              ) : (
                <div className="profile-btn-row">
                  <button
                    className="profile-btn-primary"
                    onClick={handleNameUpdate}
                    disabled={updating || !name.trim()}
                  >
                    {updating ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    className="profile-btn-secondary"
                    onClick={() => {
                      setName(user.name);
                      setIsEditingName(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* DANGER ZONE (ACCOUNT DELETION) */}
            <div className="profile-glass-card profile-danger-zone profile-card-danger" style={{ position: "relative" }}>
              <h3 className="profile-danger-title">⚠️ Danger Zone</h3>
              <p className="profile-danger-desc">
                Permanently delete your Unicloud account and remove all connected cloud services, synced storage limits, and activity logs.
              </p>
              <button 
                className="profile-danger-btn"
                onClick={() => {
                  setShowDeleteModal(true);
                  setDeleteStep(1);
                  setDeleteError("");
                  setDeleteOtp(["", "", "", "", "", ""]);
                }}
              >
                Delete Account Permanent
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: Password & Connections */}
          <div className="profile-column">
            {/* CLOUD CONNECTIONS DESK */}
            <div className="profile-glass-card profile-card-connections">
              <h3>Cloud Connections Desk</h3>
              <div className="profile-accounts-container">
                {connectionsCount === 0 ? (
                  <p style={{ color: "#9ca3af", fontSize: "14px", textAlign: "center", margin: "20px 0" }}>
                    No cloud accounts connected yet.
                  </p>
                ) : (
                  <>
                    {connectedAccounts.googleDrive && (
                      <div className="profile-account-row">
                        <div className="profile-account-brand">
                          <img src="/assets/drive.png" alt="Google Drive" />
                          <div className="profile-account-name-details">
                            <h5>Google Drive</h5>
                          </div>
                        </div>
                        <span className="profile-badge connected">Connected</span>
                      </div>
                    )}

                    {connectedAccounts.oneDrive && (
                      <div className="profile-account-row">
                        <div className="profile-account-brand">
                          <img src="/assets/onedrive.png" alt="OneDrive" />
                          <div className="profile-account-name-details">
                            <h5>OneDrive</h5>
                          </div>
                        </div>
                        <span className="profile-badge connected">Connected</span>
                      </div>
                    )}

                    {connectedAccounts.dropbox && (
                      <div className="profile-account-row">
                        <div className="profile-account-brand">
                          <img src="/assets/dropbox.png" alt="Dropbox" />
                          <div className="profile-account-name-details">
                            <h5>Dropbox</h5>
                          </div>
                        </div>
                        <span className="profile-badge connected">Connected</span>
                      </div>
                    )}

                    {connectedAccounts.s3 && (
                      <div className="profile-account-row">
                        <div className="profile-account-brand">
                          <img src="/assets/s3.png" alt="S3" />
                          <div className="profile-account-name-details">
                            <h5>Amazon S3</h5>
                          </div>
                        </div>
                        <span className="profile-badge connected">Connected</span>
                      </div>
                    )}

                    {connectedAccounts.box && (
                      <div className="profile-account-row">
                        <div className="profile-account-brand">
                          <img src="/assets/box.png" alt="Box" />
                          <div className="profile-account-name-details">
                            <h5>Box</h5>
                          </div>
                        </div>
                        <span className="profile-badge connected">Connected</span>
                      </div>
                    )}
                  </>
                )}

                <button
                  className="profile-btn-primary"
                  style={{ width: "100%", marginTop: "16px" }}
                  onClick={() => navigate("/manage-accounts")}
                >
                  ⚙️ Manage Cloud Connections
                </button>
              </div>
            </div>

            {/* SECURITY CREDENTIALS (PASSWORD) */}
            <div className="profile-glass-card profile-card-security">
              <h3>Security & Credentials</h3>
              
              <div className="profile-form-group">
                <label>Current Password</label>
                <div className="profile-input-wrapper has-icon">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                  <button 
                    type="button"
                    className="profile-eye-toggle"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="profile-form-group">
                <label>New Password</label>
                <div className="profile-input-wrapper has-icon">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Enter new password (min. 6 chars)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button 
                    type="button"
                    className="profile-eye-toggle"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
                
                {/* Password strength visualizer */}
                {newPassword && (
                  <div className="profile-strength-meter">
                    <div className="profile-strength-bar-bg">
                      <div className={`profile-strength-bar-fill ${strengthInfo.colorClass}`} />
                    </div>
                    <div className="profile-strength-label">
                      Strength: <span className={strengthInfo.colorClass}>{strengthInfo.label}</span>
                    </div>
                  </div>
                )}
              </div>

              <button
                className="profile-btn-primary"
                onClick={handlePasswordUpdate}
                disabled={passwordUpdating || !currentPassword || !newPassword || newPassword.length < 6}
              >
                {passwordUpdating ? "Saving password..." : "Update Security Password"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ACCOUNT DELETION OTP CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div className="delete-otp-modal-overlay">
          <div className="delete-otp-modal">
            <div className="delete-otp-modal-header">
              <h2>
                {deleteStep === 1 ? "Permanently Delete Account?" : "Confirm Account Deletion"}
              </h2>
              <p>
                {deleteStep === 1 
                  ? "This action is permanent and cannot be undone. You will lose access to all synced services and configurations."
                  : `Please enter the 6-digit confirmation code sent to ${user?.email}`
                }
              </p>
            </div>

            <div className="delete-otp-modal-warning">
              ⚠️ <strong>Warning:</strong> All cloud tokens, synced storages, files tracking details, and history logs will be wiped permanently from Unicloud databases.
            </div>

            {deleteError && (
              <div className="profile-toast error" style={{ position: "static", marginBottom: "16px", animation: "none", width: "100%", boxSizing: "border-box" }}>
                <span>⚠️</span> {deleteError}
              </div>
            )}

            {/* STEP 1: WARNING AND OTP REQUEST */}
            {deleteStep === 1 && (
              <div className="delete-modal-actions">
                <button 
                  className="delete-confirm-btn"
                  onClick={handleRequestDeleteOtp}
                  disabled={deleteLoading}
                >
                  {deleteLoading ? "Sending Code..." : "Send Verification OTP"}
                </button>
                <button 
                  className="delete-cancel-btn"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleteLoading}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* STEP 2: ENTER OTP & CONFIRM DELETION */}
            {deleteStep === 2 && (
              <div>
                <div className="delete-otp-input-container" onPaste={handleDeleteOtpPaste}>
                  {deleteOtp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (deleteOtpRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      className="delete-otp-digit"
                      value={digit}
                      onChange={(e) => handleDeleteOtpChange(i, e.target.value.replace(/\D/, ""))}
                      onKeyDown={(e) => handleDeleteOtpKeyDown(i, e)}
                      autoFocus={i === 0}
                    />
                  ))}
                </div>

                <div className="delete-modal-actions">
                  <button 
                    className="delete-confirm-btn"
                    onClick={handleConfirmDelete}
                    disabled={deleteLoading || deleteOtp.join("").length !== 6}
                  >
                    {deleteLoading ? "Permanently Deleting..." : "Permanently Delete"}
                  </button>
                  <button 
                    className="delete-cancel-btn"
                    onClick={() => setShowDeleteModal(false)}
                    disabled={deleteLoading}
                  >
                    Cancel
                  </button>
                </div>

                <div className="delete-resend-container">
                  <span>Didn't get the code?</span>
                  <button
                    className="delete-resend-btn"
                    onClick={handleRequestDeleteOtp}
                    disabled={deleteCooldown > 0 || deleteLoading}
                  >
                    {deleteCooldown > 0 ? `Resend in ${deleteCooldown}s` : "Resend Code"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Profile;
