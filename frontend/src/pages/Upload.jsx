import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../config/api";
import MainLayout from "../layouts/MainLayout";
import "../styles/upload.css";

const Upload = () => {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const [destinationType, setDestinationType] = useState("drive"); // "drive" | "photos"
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState("root");
  const [loadingFolders, setLoadingFolders] = useState(false);

  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const isImageOrVideo = file && (file.type.startsWith("image/") || file.type.startsWith("video/"));

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await API.get("/accounts");
        setAccounts(res.data);
      } catch (err) {
        console.error("Failed to load accounts", err);
      }
    };
    fetchAccounts();
  }, []);

  // Revert destination type to drive if file is not image/video
  useEffect(() => {
    if (file && !isImageOrVideo) {
      setDestinationType("drive");
    }
  }, [file, isImageOrVideo]);

  // Fetch folders for selected account
  useEffect(() => {
    if (!selectedAccount) {
      setFolders([]);
      setSelectedFolder("root");
      return;
    }

    const fetchFolders = async () => {
      try {
        setLoadingFolders(true);
        const res = await API.get(`/files/folders?accountId=${selectedAccount}`);
        setFolders(res.data || []);
      } catch (err) {
        console.error("Failed to load folders", err);
        setFolders([]);
      } finally {
        setLoadingFolders(false);
      }
    };

    fetchFolders();
  }, [selectedAccount]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return "0 B";
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
  };

  const handleUpload = async (isSmart = false) => {
    if (!file) return;

    let target = isSmart ? "smart" : selectedAccount;
    if (!target) return alert("Please select an account");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("accountId", target);
    formData.append("destinationType", destinationType);
    formData.append("folderId", selectedFolder);

    try {
      setIsUploading(true);
      setProgress(10); // Start progress

      // Simulate some progress while uploading
      const progressInterval = setInterval(() => {
        setProgress(prev => (prev < 90 ? prev + 10 : prev));
      }, 500);

      const res = await API.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      clearInterval(progressInterval);
      setProgress(100);

      setTimeout(() => {
        alert(`File uploaded successfully to ${res.data.uploadedTo}!`);
        navigate("/files");
      }, 500);

    } catch (err) {
      console.error(err);
      alert("Upload failed. " + (err.response?.data?.error || err.response?.data?.message || err.message));
      setIsUploading(false);
      setProgress(0);
    }
  };

  return (
    <MainLayout>
      <div className="upload-page">
        <div className="upload-header">
          <h1>Upload Hub</h1>
          <p>Drag and drop to securely upload files to any of your connected clouds.</p>
        </div>

        {!file ? (
          <div
            className={`dropzone-container ${dragActive ? "drag-active" : ""}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="dropzone-icon">☁️</div>
            <div className="dropzone-text">
              <h3>Click or drag file to this area to upload</h3>
              <p>Supports any file type. Maximum size: 5GB.</p>
            </div>
            <input
              type="file"
              className="file-input"
              ref={fileInputRef}
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div className="routing-section">
            <div className="selected-file-card">
              <div className="file-info">
                <div className="file-icon">📄</div>
                <div className="file-details">
                  <h4>{file.name}</h4>
                  <p>{formatSize(file.size)} • {file.type || "Unknown file type"}</p>
                </div>
              </div>
              <button className="remove-file-btn" onClick={() => setFile(null)} disabled={isUploading}>
                Remove
              </button>
            </div>

            <div className="routing-header">
              <h3>Where should this go?</h3>
              <button
                className="smart-upload-btn"
                onClick={() => handleUpload(true)}
                disabled={isUploading}
              >
                ✨ Smart Upload
              </button>
            </div>

            <div className="accounts-grid">
              {accounts.length === 0 && <p>No accounts connected.</p>}

              {accounts.map(acc => {
                const total = acc.storage?.total || 1;
                const used = acc.storage?.used || 0;
                const free = total - used;
                const progressPct = (used / total) * 100;
                const isSelected = selectedAccount === acc._id;

                return (
                  <div
                    key={acc._id}
                    className={`upload-account-card ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedAccount(acc._id)}
                  >
                    <div className="acc-header">
                      <img src={`/assets/${acc.provider === 'google' ? 'drive' : acc.provider}.png`} alt={acc.provider} />
                      <div className="acc-details">
                        <h5>{acc.email}</h5>
                        <p>{acc.provider === 'google' ? 'Google Drive' : acc.provider === 's3' ? 'Amazon S3' : acc.provider.charAt(0).toUpperCase() + acc.provider.slice(1)}</p>
                      </div>
                    </div>

                    <div className="upload-progress-container">
                      <div className="upload-progress-text">
                        <span>{formatSize(used)} used</span>
                        <span>{formatSize(free)} free</span>
                      </div>
                      <div className="upload-progress-bar">
                        <div
                          className="upload-progress-fill"
                          style={{ width: `${progressPct}%`, background: progressPct > 90 ? '#ff5c5c' : '#6366f1' }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {selectedAccount && (
              <div className="upload-options-card">
                <h3>Upload Options</h3>
                

                {destinationType === "drive" && (
                  <div className="option-group">
                    <label htmlFor="folder-select">Target Folder</label>
                    {loadingFolders ? (
                      <div className="loading-folders-text">Loading folders...</div>
                    ) : (
                      <select
                        id="folder-select"
                        value={selectedFolder}
                        onChange={(e) => setSelectedFolder(e.target.value)}
                        className="folder-dropdown"
                      >
                        <option value="root">📁 Root Folder</option>
                        {folders.map(folder => (
                          <option key={folder.id} value={folder.id}>
                            📁 {folder.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              className="final-upload-btn"
              onClick={() => handleUpload(false)}
              disabled={isUploading || !selectedAccount}
            >
              {isUploading ? `Uploading... ${progress}%` : "Upload File"}
            </button>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default Upload;
