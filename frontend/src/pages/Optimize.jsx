import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getFiles } from "../services/fileService";
import API from "../config/api";
import MainLayout from "../layouts/MainLayout";
import "../styles/optimize.css";

const providerIcons = {
  google: "/assets/drive.png",
  dropbox: "/assets/dropbox.png",
  onedrive: "/assets/onedrive.png",
};

const Optimize = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [loading, setLoading] = useState(true);
  const [allFiles, setAllFiles] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [largeFiles, setLargeFiles] = useState([]);
  const [totalReclaimable, setTotalReclaimable] = useState(0);
  const [activeTab, setActiveTab] = useState("duplicates");
  const [deletingId, setDeletingId] = useState(null);
  const [toastMessage, setToastMessage] = useState("");

  // Auth Guard
  useEffect(() => {
    if (!token) {
      navigate("/auth");
    }
  }, [token, navigate]);

  // Load and Analyze Files
  const loadAndAnalyzeFiles = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await getFiles({ view: "unified", mode: "all", pageSize: 1000 });
      const files = flattenFiles(response.data);
      setAllFiles(files);
      analyzeFiles(files);
    } catch (err) {
      console.error("Failed to fetch files for optimization:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAndAnalyzeFiles();
  }, [token]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  // Duplicate and Large File Heuristics
  const analyzeFiles = (filesList) => {
    const signatures = {};
    const dups = [];
    let reclaimable = 0;

    filesList.forEach((file) => {
      if (file.size && file.name) {
        const sig = `${file.name.toLowerCase()}:${file.size}`;
        if (!signatures[sig]) {
          signatures[sig] = [];
        }
        signatures[sig].push(file);
      }
    });

    Object.keys(signatures).forEach((sig) => {
      const group = signatures[sig];
      if (group.length > 1) {
        dups.push({
          signature: sig,
          name: group[0].name,
          size: group[0].size,
          files: group,
        });
        // We can reclaim size of all copies except the first one
        reclaimable += group[0].size * (group.length - 1);
      }
    });

    // Large Files (> 50 MB)
    const large = filesList
      .filter((f) => f.size && f.size > 50 * 1024 * 1024)
      .sort((a, b) => b.size - a.size);

    setDuplicates(dups);
    setLargeFiles(large);
    setTotalReclaimable(reclaimable);
  };

  // Delete Action
  const handleDeleteFile = async (file) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${file.name}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(file.id);
    try {
      await API.delete(`/files/${file.id}`, {
        params: {
          provider: file.provider,
          accountId: file.accountId,
        },
      });

      // Update state immediately
      const updatedFiles = allFiles.filter((f) => f.id !== file.id);
      setAllFiles(updatedFiles);
      analyzeFiles(updatedFiles);
      showToast("File deleted successfully!");
    } catch (err) {
      console.error("Delete file failed:", err);
      showToast("Failed to delete file. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <MainLayout>
      <main className="optimize-page">
        {/* Toast Notification */}
        {toastMessage && <div className="toast-notification glass show">{toastMessage}</div>}

        {/* HERO TITLE BLOCK */}
        <section className="optimize-hero">
          <div>
            <h1>Storage Optimization & Cleaner 🧹</h1>
            <p className="hero-subtitle">Optimize storage space by identifying duplicate records and large files across all connected clouds.</p>
          </div>
          <button className="btn-secondary" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </button>
        </section>

        {loading ? (
          <div className="optimize-loading">
            <div className="scanner-spinner" />
            <p>Scanning connected cloud drives for duplicates and large files...</p>
          </div>
        ) : (
          <>
            {/* STATS OVERVIEW CARDS */}
            <section className="optimize-stats-row">
              <div className="opt-stat-card glass">
                <span className="opt-icon">⚡</span>
                <div className="opt-stat-details">
                  <h3>{formatSize(totalReclaimable)}</h3>
                  <p>Reclaimable Space</p>
                </div>
              </div>
              <div className="opt-stat-card glass">
                <span className="opt-icon">👥</span>
                <div className="opt-stat-details">
                  <h3>{duplicates.length}</h3>
                  <p>Duplicate Groups</p>
                </div>
              </div>
              <div className="opt-stat-card glass">
                <span className="opt-icon">💾</span>
                <div className="opt-stat-details">
                  <h3>{largeFiles.length}</h3>
                  <p>Large Files (&gt; 50 MB)</p>
                </div>
              </div>
            </section>

            {/* NAV TABS */}
            <div className="optimize-tabs-nav">
              <button
                className={`tab-btn ${activeTab === "duplicates" ? "active" : ""}`}
                onClick={() => setActiveTab("duplicates")}
              >
                Duplicate Files ({duplicates.length})
              </button>
              <button
                className={`tab-btn ${activeTab === "large" ? "active" : ""}`}
                onClick={() => setActiveTab("large")}
              >
                Large Files ({largeFiles.length})
              </button>
            </div>

            {/* TAB PANEL CONTENT */}
            <section className="optimize-content-section">
              {activeTab === "duplicates" ? (
                duplicates.length === 0 ? (
                  <div className="empty-optimize glass animate-fade-in">
                    <span className="empty-icon">🎉</span>
                    <h3>No Duplicates Found</h3>
                    <p className="muted">Your files are completely clean and organized!</p>
                  </div>
                ) : (
                  <div className="duplicates-list">
                    {duplicates.map((dupGroup) => (
                      <div key={dupGroup.signature} className="dup-group glass animate-fade-in">
                        <div className="dup-group-header">
                          <span className="file-icon">📄</span>
                          <div className="header-meta">
                            <h4>{dupGroup.name}</h4>
                            <span className="dup-size-badge">
                              {formatSize(dupGroup.size)} • {dupGroup.files.length} redundant copies
                            </span>
                          </div>
                        </div>
                        <div className="dup-files-list">
                          {dupGroup.files.map((file, idx) => (
                            <div key={file.id} className="dup-file-item">
                              <div className="dup-file-info">
                                <span className="provider-badge">
                                  <img src={providerIcons[file.provider]} alt={file.provider} className="provider-mini-logo" />
                                  <span className="provider-email">{file.accountEmail}</span>
                                </span>
                                <span className="dup-path">
                                  📂 {file.parentFolder || "Root"}
                                </span>
                                <span className="dup-date">
                                  📅 {file.createdAt ? new Date(file.createdAt).toLocaleDateString() : "Unknown"}
                                </span>
                              </div>
                              <button
                                className="btn-danger-sm"
                                onClick={() => handleDeleteFile(file)}
                                disabled={deletingId === file.id}
                              >
                                {deletingId === file.id ? "Deleting..." : "Delete Copy"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : largeFiles.length === 0 ? (
                <div className="empty-optimize glass animate-fade-in">
                  <span className="empty-icon">📁</span>
                  <h3>No Large Files Found</h3>
                  <p className="muted">All files are below 50 MB in size.</p>
                </div>
              ) : (
                <div className="large-files-table-container glass animate-fade-in">
                  <table className="optimize-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Size</th>
                        <th>Account</th>
                        <th>Folder</th>
                        <th>Modified</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {largeFiles.map((file) => (
                        <tr key={file.id}>
                          <td className="file-name-cell" title={file.name}>
                            {file.name}
                          </td>
                          <td className="file-size-cell">{formatSize(file.size)}</td>
                          <td className="file-account-cell">
                            <img src={providerIcons[file.provider]} alt={file.provider} className="provider-mini-logo" />
                            <span>{file.accountEmail}</span>
                          </td>
                          <td className="file-folder-cell">📂 {file.parentFolder || "Root"}</td>
                          <td>{file.createdAt ? new Date(file.createdAt).toLocaleDateString() : "Unknown"}</td>
                          <td>
                            <button
                              className="btn-danger-sm"
                              onClick={() => handleDeleteFile(file)}
                              disabled={deletingId === file.id}
                            >
                              {deletingId === file.id ? "Deleting..." : "Delete"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </MainLayout>
  );
};

export default Optimize;

/* ===============================
   HELPER FUNCTIONS
=============================== */

function flattenFiles(data) {
  if (!data) return [];
  return [
    ...(data.image || []),
    ...(data.video || []),
    ...(data.document || []),
    ...(data.other || []),
  ];
}

function formatSize(bytes) {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
}
