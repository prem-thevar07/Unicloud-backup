import { useEffect, useState } from "react";
import API from "../config/api";
import "../styles/profile.css";
import Header from "../components/Header";

const Profile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState("");
  const [updating, setUpdating] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);

  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordUpdating, setPasswordUpdating] = useState(false);

  // 🔐 Change password
  const handlePasswordUpdate = async () => {
    if (!currentPassword || !newPassword) return;

    try {
      setPasswordUpdating(true);

      await API.put("/profile/change-password", {
        currentPassword,
        newPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setIsEditingPassword(false);

      alert("Password updated successfully");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update password");
    } finally {
      setPasswordUpdating(false);
    }
  };

  // 👤 Fetch profile
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await API.get("/profile/summary");
        setProfile(res.data);
        setName(res.data.user.name);
      } catch (err) {
        console.error("Failed to load profile", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // 📸 Upload picture
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

      // Update UI
      setProfile((prev) => ({
        ...prev,
        user: { ...prev.user, avatar: newAvatar },
      }));

      // Update localStorage (for Header)
      const storedUser = JSON.parse(localStorage.getItem("user"));
      if (storedUser) {
        localStorage.setItem(
          "user",
          JSON.stringify({ ...storedUser, avatar: newAvatar })
        );
      }

      // Notify Header
      window.dispatchEvent(new Event("user-updated"));

    } catch (err) {
      console.error("Failed to upload picture", err);
      alert(err.response?.data?.message || "Failed to upload picture");
    } finally {
      setUploadingPic(false);
      e.target.value = null; // reset input
    }
  };

  // ✏️ Update name
  const handleNameUpdate = async () => {
    if (!name.trim()) return;

    try {
      setUpdating(true);

      await API.put("/profile/update-name", { name });

      // Update UI
      setProfile((prev) => ({
        ...prev,
        user: { ...prev.user, name },
      }));

      // Update localStorage (for Header)
      const storedUser = JSON.parse(localStorage.getItem("user"));
      if (storedUser) {
        localStorage.setItem(
          "user",
          JSON.stringify({ ...storedUser, name })
        );
      }

      // Notify Header
      window.dispatchEvent(new Event("user-updated"));

      setIsEditingName(false);
    } catch (err) {
      console.error("Failed to update name", err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <p className="loading">Loading profile...</p>;
  if (!profile) return <p className="error">Failed to load profile</p>;

  const { user, connectedAccounts } = profile;

  return (
    <>
      <Header />

      <div className="profile-page">
        <h1 className="profile-title">Profile</h1>
        <p className="profile-subtitle">
          Manage your account & connected services
        </p>

        <div className="profile-grid">
          {/* LEFT COLUMN */}
          <div className="left-column">
            {/* PROFILE CARD */}
            <div className="card">
              <div className="avatar-row">
                <div className="avatar" style={{ padding: user.avatar ? "0" : undefined, overflow: "hidden" }}>
                  {user.avatar ? (
                    <img src={user.avatar} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    user.name?.charAt(0).toUpperCase()
                  )}
                </div>
                <input 
                  type="file" 
                  id="profilePicInput" 
                  style={{ display: "none" }} 
                  accept="image/*" 
                  onChange={handlePictureUpload} 
                />
                <button 
                  className="btn-secondary" 
                  onClick={() => document.getElementById('profilePicInput').click()}
                  disabled={uploadingPic}
                >
                  {uploadingPic ? "Uploading..." : "Change picture"}
                </button>
              </div>

              <label>Name</label>
              <input
                value={name}
                disabled={!isEditingName}
                onChange={(e) => setName(e.target.value)}
              />

              {!isEditingName ? (
                <button
                  className="btn-primary"
                  onClick={() => setIsEditingName(true)}
                >
                  Edit Name
                </button>
              ) : (
                <div className="btn-row">
                  <button
                    className="btn-primary"
                    onClick={handleNameUpdate}
                    disabled={updating}
                  >
                    {updating ? "Saving..." : "Save"}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setName(user.name);
                      setIsEditingName(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              <label>Email</label>
              <input value={user.email} disabled />
            </div>

            {/* CHANGE PASSWORD */}
            <div className="card">
              <h3>Change Password</h3>

              <input
                type="password"
                placeholder="Current password"
                value={currentPassword}
                disabled={!isEditingPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />

              <input
                type="password"
                placeholder="New password"
                value={newPassword}
                disabled={!isEditingPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />

              {!isEditingPassword ? (
                <button
                  className="btn-primary"
                  onClick={() => setIsEditingPassword(true)}
                >
                  Change Password
                </button>
              ) : (
                <div className="btn-row">
                  <button
                    className="btn-primary"
                    onClick={handlePasswordUpdate}
                    disabled={passwordUpdating}
                  >
                    {passwordUpdating ? "Saving..." : "Save"}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setCurrentPassword("");
                      setNewPassword("");
                      setIsEditingPassword(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="right-column">
            <div className="card">
              <h3>Connected Accounts</h3>

              <div className="account-row">
                <span>Google Drive</span>
                {connectedAccounts.googleDrive ? (
                  <span className="status connected">Connected</span>
                ) : (
                  <span className="status not-connected">Not connected</span>
                )}
              </div>

              <div className="account-row">
                <span>OneDrive</span>
                <span className="status coming-soon">Not connected</span>
              </div>

              <div className="account-row">
                <span>Dropbox</span>
                {connectedAccounts.dropbox ? (
                  <span className="status connected">Connected</span>
                ) : (
                  <span className="status not-connected">Not connected</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Profile;
