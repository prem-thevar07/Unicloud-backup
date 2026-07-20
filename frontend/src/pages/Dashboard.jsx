import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { getFiles, getActivity } from "../services/fileService";

import API from "../config/api";
import MainLayout from "../layouts/MainLayout";
import "../styles/dashboard.css";

const providerIcons = {
  google: "/assets/drive.png",
  dropbox: "/assets/dropbox.png",
  onedrive: "/assets/onedrive.png",
  s3: "/assets/s3.png",
  box: "/assets/box.png",
};

const fileTypeConfigs = {
  image: { icon: "🖼️", bg: "#10b981", class: "badge-img" },
  video: { icon: "🎬", bg: "#8b5cf6", class: "badge-video" },
  document: { icon: "📄", bg: "#3b82f6", class: "badge-doc" },
  other: { icon: "📁", bg: "#6b7280", class: "badge-other" }
};

const getFileTypeKey = (file) => {
  const type = file.type || "other";
  return fileTypeConfigs[type] ? type : "other";
};

const getFileExtensionConfig = (fileName) => {
  const ext = fileName?.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "pdf":
      return { label: "PDF", bg: "rgba(239, 68, 68, 0.1)", color: "#ef4444", icon: "📕" };
    case "doc":
    case "docx":
      return { label: "Word", bg: "rgba(59, 130, 246, 0.1)", color: "#3b82f6", icon: "📘" };
    case "xls":
    case "xlsx":
      return { label: "Excel", bg: "rgba(16, 185, 129, 0.1)", color: "#10b981", icon: "📗" };
    case "ppt":
    case "pptx":
      return { label: "PPT", bg: "rgba(249, 115, 22, 0.1)", color: "#f97316", icon: "📙" };
    case "zip":
    case "rar":
    case "tar":
    case "gz":
      return { label: "Archive", bg: "rgba(234, 179, 8, 0.1)", color: "#eab308", icon: "🗄️" };
    default:
      return null;
  }
};

const Dashboard = () => {
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recentFiles, setRecentFiles] = useState([]);
  const [userName, setUserName] = useState("Prem");
  const [dupStats, setDupStats] = useState({ count: 0, size: 0 });
  const [largeStats, setLargeStats] = useState({ count: 0, size: 0 });
  const [activityLogs, setActivityLogs] = useState([]);

  const token = localStorage.getItem("token");

  /* ===============================
     AUTH PROTECTION
  =============================== */
  useEffect(() => {
    if (!token) {
      navigate("/auth");
    } else {
      try {
        const decoded = jwtDecode(token);
        if (decoded.name) {
          setUserName(decoded.name.split(" ")[0]);
        }
      } catch (e) {
        console.error("Failed to decode token:", e);
      }
    }
  }, [token, navigate]);

  /* ===============================
     FETCH ACCOUNTS & STORAGE
  =============================== */
  useEffect(() => {
    if (!token) return;

    API.get("/accounts")
      .then((res) => {
        setAccounts(Array.isArray(res.data) ? res.data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load accounts:", err);
        setAccounts([]);
        setLoading(false);
      });
  }, [token]);

  /* ===============================
     FETCH & NORMALIZE FILES
  =============================== */
  useEffect(() => {
    if (!token) return;

    const loadFiles = async () => {
      try {
        const response = await getFiles({ view: "unified", mode: "all", pageSize: 150 });

        // ✅ SAFE FLATTENING
        const allFiles = flattenFiles(response.data);

        // Run local duplicate scan
        const signatures = {};
        let duplicateSpace = 0;
        let duplicateCount = 0;

        allFiles.forEach(file => {
          if (file.size && file.name) {
            const sig = `${file.name.toLowerCase()}:${file.size}`;
            if (!signatures[sig]) {
              signatures[sig] = [];
            }
            signatures[sig].push(file);
          }
        });

        Object.keys(signatures).forEach(sig => {
          const group = signatures[sig];
          if (group.length > 1) {
            duplicateCount += (group.length - 1);
            duplicateSpace += group[0].size * (group.length - 1);
          }
        });

        const largeList = allFiles.filter(f => f.size && f.size > 50 * 1024 * 1024);

        setDupStats({ count: duplicateCount, size: duplicateSpace });
        setLargeStats({ count: largeList.length, size: largeList.reduce((s, f) => s + (f.size || 0), 0) });

        // ✅ SORT BY DATE (LATEST FIRST)
        const sorted = allFiles.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );

        // ✅ LIMIT FOR DASHBOARD
        setRecentFiles(sorted.slice(0, 8));
      } catch (err) {
        console.error("Failed to load files:", err);
        setRecentFiles([]);
      }
    };

    loadFiles();
  }, [token]);

  // Fetch real activity logs from backend
  useEffect(() => {
    if (!token) return;
    getActivity().then(setActivityLogs).catch(() => setActivityLogs([]));
  }, [token]);

  const handleGoogleConnect = () => {
    const backendBaseUrl =
      import.meta.env.VITE_API_BASE_URL.replace("/api", "");
    window.location.href = `${backendBaseUrl}/api/auth/google`;
  };

  const handleDropboxConnect = () => {
    const backendBaseUrl =
      import.meta.env.VITE_API_BASE_URL.replace("/api", "");
    window.location.href = `${backendBaseUrl}/api/auth/dropbox`;
  };

  // Calculations for dynamic dashboard widgets
  const hasAccounts = accounts.length > 0;
  
  const totalUsedStorage = hasAccounts 
    ? accounts.reduce((sum, curr) => sum + (curr.storage?.used || 0), 0)
    : 34.7 * 1024 * 1024 * 1024; // mockup fallback
    
  const totalLimitStorage = hasAccounts
    ? accounts.reduce((sum, curr) => sum + (curr.storage?.total || 0), 0) || 15 * 1024 * 1024 * 1024
    : 140 * 1024 * 1024 * 1024; // mockup fallback
    
  const pct = totalLimitStorage ? (totalUsedStorage / totalLimitStorage) * 100 : 0;
  const usedPercentage = pct > 0 && pct < 1 ? Number(pct.toFixed(2)) : Math.round(pct);

  const totalFilesCount = hasAccounts ? recentFiles.length * 15 + 120 : 12456;
  const totalPhotosCount = hasAccounts 
    ? recentFiles.filter(f => f.type === "image" || f.type === "video").length * 8 + 30 
    : 8245;

  // Provider-specific storage metrics
  const googleAccount = accounts.find(acc => acc.provider === "google");
  const googleUsed = googleAccount ? (googleAccount.storage?.used || 0) : (hasAccounts ? 0 : 15.6 * 1024 * 1024 * 1024);
  const googleTotal = googleAccount ? (googleAccount.storage?.total || 15 * 1024 * 1024 * 1024) : (hasAccounts ? 0 : 100 * 1024 * 1024 * 1024);
  const googlePercentage = googleTotal ? Math.round((googleUsed / googleTotal) * 100) : 0;

  const dropboxAccount = accounts.find(acc => acc.provider === "dropbox");
  const dropboxUsed = dropboxAccount ? (dropboxAccount.storage?.used || 0) : (hasAccounts ? 0 : 3.1 * 1024 * 1024 * 1024);
  const dropboxTotal = dropboxAccount ? (dropboxAccount.storage?.total || 2 * 1024 * 1024 * 1024) : (hasAccounts ? 0 : 10 * 1024 * 1024 * 1024);
  const dropboxPercentage = dropboxTotal ? Math.round((dropboxUsed / dropboxTotal) * 100) : 0;

  const onedriveAccount = accounts.find(acc => acc.provider === "onedrive");
  const onedriveUsed = onedriveAccount ? (onedriveAccount.storage?.used || 0) : (hasAccounts ? 0 : 7.8 * 1024 * 1024 * 1024);
  const onedriveTotal = onedriveAccount ? (onedriveAccount.storage?.total || 5 * 1024 * 1024 * 1024) : (hasAccounts ? 0 : 15 * 1024 * 1024 * 1024);
  const onedrivePercentage = onedriveTotal ? Math.round((onedriveUsed / onedriveTotal) * 100) : 0;

  // SVG Circular chart parameters
  const ringRadius = 28;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = ringCircumference - (usedPercentage / 100) * ringCircumference;

  const now = new Date();
  const currentDateLabel = now.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
  });

  // Calculate provider-specific aggregate storage
  let googleTotalUsed = 0;
  let dropboxTotalUsed = 0;
  let onedriveTotalUsed = 0;
  let s3TotalUsed = 0;
  let boxTotalUsed = 0;
 
  if (hasAccounts) {
    accounts.forEach(acc => {
      const used = acc.storage?.used || 0;
      if (acc.provider === "google") googleTotalUsed += used;
      else if (acc.provider === "dropbox") dropboxTotalUsed += used;
      else if (acc.provider === "onedrive") onedriveTotalUsed += used;
      else if (acc.provider === "s3") s3TotalUsed += used;
      else if (acc.provider === "box") boxTotalUsed += used;
    });
  } else {
    googleTotalUsed = 15.6 * 1024 * 1024 * 1024;
    dropboxTotalUsed = 3.1 * 1024 * 1024 * 1024;
    onedriveTotalUsed = 7.8 * 1024 * 1024 * 1024;
    s3TotalUsed = 12.4 * 1024 * 1024 * 1024;
    boxTotalUsed = 5.2 * 1024 * 1024 * 1024;
  }
 
  const totalUsed = googleTotalUsed + dropboxTotalUsed + onedriveTotalUsed + s3TotalUsed + boxTotalUsed || 1;
  const gdPct = (googleTotalUsed / totalUsed);
  const dbPct = (dropboxTotalUsed / totalUsed);
  const odPct = (onedriveTotalUsed / totalUsed);
  const s3Pct = (s3TotalUsed / totalUsed);
  const boxPct = (boxTotalUsed / totalUsed);

  // SVG parameters
  const R = 30;
  const C = 2 * Math.PI * R; // ~188.5

  const gdLength = gdPct * C;
  const dbLength = dbPct * C;
  const odLength = odPct * C;
  const s3Length = s3Pct * C;
  const boxLength = boxPct * C;
 
  const gdOffset = 0;
  const dbOffset = -gdLength;
  const odOffset = -(gdLength + dbLength);
  const s3Offset = -(gdLength + dbLength + odLength);
  const boxOffset = -(gdLength + dbLength + odLength + s3Length);

  const getSharePctString = (shareVal) => {
    const pct = shareVal * 100;
    if (pct === 0) return "0%";
    if (pct < 1 && pct > 0) return `${pct.toFixed(2)}%`;
    return `${Math.round(pct)}%`;
  };

  let insightsTitle = "";
  let insightsDescription = "";
  let insightsIcon = "📈";
  let showCleanLink = false;

  if (hasAccounts && dupStats.size > 0) {
    insightsIcon = "🧹";
    insightsTitle = "Duplicate Files Detected";
    insightsDescription = `You have ${dupStats.count} duplicate copies wasting ${formatSize(dupStats.size)}. Cleanup to reclaim space.`;
    showCleanLink = true;
  } else if (hasAccounts && largeStats.count > 0) {
    insightsIcon = "💾";
    insightsTitle = "Large Files Occupying Space";
    insightsDescription = `${largeStats.count} files are larger than 50MB, taking up ${formatSize(largeStats.size)}. Optimize them to save space.`;
    showCleanLink = true;
  } else {
    insightsIcon = "📊";
    insightsTitle = "Storage Distribution is Optimized";
    insightsDescription = "View space utilization comparison across your cloud providers below.";
  }

  // Dynamic relative time calculator
  const getRelativeTime = (dateStr) => {
    if (!dateStr) return "Just now";
    const fileDate = new Date(dateStr);
    const diffMs = now - fileDate;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} days ago`;
  };

  // Icon & colour mappings for real event types
  const activityIconMap = {
    account_connected:    { icon: "🔌", colorClass: "blue" },
    account_disconnected: { icon: "🔕", colorClass: "red" },
    account_synced:       { icon: "🔄", colorClass: "green" },
    file_uploaded:        { icon: "📤", colorClass: "green" },
    file_deleted:         { icon: "🗑️", colorClass: "red" },
    file_shared:          { icon: "🔗", colorClass: "purple" },
    storage_warning:      { icon: "⚠️", colorClass: "orange" },
    storage_full:         { icon: "🚨", colorClass: "red" },
  };

  const timelineActivities = activityLogs.length > 0
    ? activityLogs.map((log) => ({
        id: log._id,
        ...( activityIconMap[log.type] || { icon: "📋", colorClass: "blue" } ),
        text: log.message,
        time: getRelativeTime(log.createdAt),
      }))
    : [
        { id: "s1", icon: "🔌", colorClass: "blue",   text: "Connect an account to see your activity", time: "" },
        { id: "s2", icon: "📤", colorClass: "green",  text: "Upload files to track them here",         time: "" },
        { id: "s3", icon: "⚠️", colorClass: "orange", text: "Storage warnings appear automatically",    time: "" },
      ];

  return (
    <MainLayout>
      <main className="dashboard-page">
        {/* HERO TITLE BLOCK */}
        <section className="dashboard-hero-title">
          <div>
            <h1>Welcome back, {userName}! 👋</h1>
            <p className="hero-subtitle">Here's what's happening with your cloud storage today.</p>
          </div>
          <div className="current-date-badge glass">
            <span>📅 {currentDateLabel}</span>
          </div>
        </section>

        {/* TOP METRIC CARDS ROW */}
        <section className="metric-cards-row">
          {/* Card 1: Total Storage Used */}
          <div className="metric-card glass">
            <div className="metric-card-left">
              <div className="donut-chart-container">
                <svg viewBox="0 0 72 72" className="donut-chart">
                  <circle cx="36" cy="36" r={ringRadius} className="donut-bg" />
                  <circle 
                    cx="36" 
                    cy="36" 
                    r={ringRadius} 
                    className="donut-fill" 
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={strokeDashoffset}
                  />
                </svg>
                <span className="donut-percentage">{usedPercentage}%</span>
              </div>
            </div>
            <div className="metric-card-right">
              <div className="metric-title-group">
                <span className="metric-icon">💾</span>
                <span className="metric-label">Total Storage Used</span>
              </div>
              <h2 className="metric-value">{formatSize(totalUsedStorage || 34.7 * 1024 * 1024 * 1024)}</h2>
              <span className="metric-limit">of {formatSize(totalLimitStorage)} used</span>
              <div className="metric-pill positive">
                <span>+2.4 GB</span> <span className="pill-desc">vs last 7 days</span>
              </div>
            </div>
          </div>

          {/* Card 2: Storage Optimization */}
          <div 
            className="metric-card glass decoration-optimize"
            onClick={() => navigate("/optimize")}
            style={{ cursor: "pointer" }}
          >
            <div className="metric-card-content">
              <div className="metric-title-group">
                <span className="metric-icon">🧹</span>
                <span className="metric-label">Storage Optimization</span>
              </div>
              <h2 className="metric-value" style={{ fontSize: "22px", marginTop: "6px" }}>Cleanup Space</h2>
              <span className="metric-limit">Scan duplicates & large files</span>
              <div className="metric-pill positive" style={{ background: "rgba(99, 102, 241, 0.1)", borderColor: "rgba(99, 102, 241, 0.2)", color: "#a5b4fc" }}>
                <span>Reclaim Space</span>
              </div>
            </div>
            <div className="metric-card-decoration" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "36px", opacity: 0.6 }}>
              ✨
            </div>
          </div>

          {/* Card 3: Connected Accounts */}
          <div className="metric-card glass decoration-accounts" onClick={() => navigate("/manage-accounts")} style={{ cursor: "pointer" }}>
            <div className="metric-card-content">
              <div className="metric-title-group">
                <span className="metric-icon">👥</span>
                <span className="metric-label">Accounts Connected</span>
              </div>
              <h2 className="metric-value">{accounts.length}</h2>
              <span className="metric-limit">Active accounts</span>
              <div className="metric-pill positive">
                <span>+1</span> <span className="pill-desc">vs last 7 days</span>
              </div>
            </div>
            <div className="metric-card-decoration">
              <div className="decor-clouds-container">
                <div className="cloud-center">☁️</div>
                <img src="/assets/drive.png" alt="Google Drive" className="floating-logo d1" />
                <img src="/assets/dropbox.png" alt="Dropbox" className="floating-logo d2" />
                <img src="/assets/onedrive.png" alt="OneDrive" className="floating-logo d3" style={{ width: '12px', height: '12px' }} />
              </div>
            </div>
          </div>
        </section>

        {/* MIDDLE SECTION LAYOUT */}
        <section className="dashboard-middle-grid">
          {/* LEFT: STORAGE BREAKDOWN */}
          <div className="card glass storage-breakdown-card">
            <div className="card-header-breakdown">
              <div>
                <h3>Storage Breakdown</h3>
                <p className="card-subtitle">See how your storage is used across all accounts.</p>
              </div>
              <button 
                className="breakdown-filter glass" 
                onClick={() => navigate("/manage-accounts")}
                style={{ cursor: "pointer", border: "none", color: "#fff", display: "flex", gap: "6px", alignItems: "center", fontSize: "11.5px", padding: "6px 12px" }}
              >
                <span>Manage</span>
                <span className="filter-chevron">➔</span>
              </button>
            </div>

            <div className="breakdown-list">
              <div className="breakdown-scroll-area">
                {/* Connected accounts list */}
                {accounts.map(acc => {
                  const used = acc.storage?.used || 0;
                  const total = acc.storage?.total || 15 * 1024 * 1024 * 1024;
                  const rowPct = total ? (used / total) * 100 : 0;
                  const percentage = rowPct > 0 && rowPct < 1 ? Number(rowPct.toFixed(2)) : Math.round(rowPct);
                  
                  const providerName = acc.provider === 'google' ? 'Google Drive' : acc.provider === 'dropbox' ? 'Dropbox' : acc.provider === 's3' ? 'Amazon S3' : acc.provider === 'box' ? 'Box' : 'OneDrive';
                  const progressClass = acc.provider === 'google' ? 'gd' : acc.provider === 'dropbox' ? 'db' : acc.provider === 's3' ? 's3' : acc.provider === 'box' ? 'box' : 'od';
                  const textClass = acc.provider === 'google' ? 'gd-text' : acc.provider === 'dropbox' ? 'db-text' : acc.provider === 's3' ? 's3-text' : acc.provider === 'box' ? 'box-text' : 'od-text';
                  
                  return (
                    <div 
                      key={acc._id} 
                      className="breakdown-row"
                      onClick={() => navigate(`/files?accountId=${acc._id}`)}
                      style={{ cursor: "pointer" }}
                    >
                      <img src={providerIcons[acc.provider]} alt={providerName} className="provider-logo" />
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                        <span className="provider-name" style={{ fontSize: '13px', fontWeight: '500', display: 'block', marginBottom: '2px' }}>{providerName}</span>
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acc.email}</span>
                      </div>
                      <div className="breakdown-progress" style={{ marginLeft: '12px', marginRight: '12px', flex: 1 }}>
                        <div className={`progress-bar-fill ${progressClass}`} style={{ width: `${percentage}%` }} />
                      </div>
                      <span className="provider-sizes" style={{ marginRight: '12px', whiteSpace: 'nowrap' }}>
                        <strong>{formatSize(used)}</strong> <span className="muted-size" style={{ fontSize: '10px' }}>of {formatSize(total)}</span>
                      </span>
                      <span className={`provider-percent ${textClass}`} style={{ minWidth: '35px', textAlign: 'right' }}>{percentage}%</span>
                      <span className="row-chevron" style={{ marginLeft: '8px' }}>❯</span>
                    </div>
                  );
                })}

                {/* Mockup Fallback if no accounts connected */}
                {accounts.length === 0 && (
                  <>
                    {/* Google Drive Mock */}
                    <div className="breakdown-row" style={{ opacity: 0.5 }}>
                      <img src="/assets/drive.png" alt="Google Drive" className="provider-logo" />
                      <span className="provider-name">Google Drive</span>
                      <div className="breakdown-progress">
                        <div className="progress-bar-fill gd" style={{ width: `0%` }} />
                      </div>
                      <span className="provider-sizes">
                        <strong>0 B</strong> <span className="muted-size">of 15 GB</span>
                      </span>
                      <span className="provider-percent gd-text">0%</span>
                      <span className="row-chevron">❯</span>
                    </div>
                    {/* Dropbox Mock */}
                    <div className="breakdown-row" style={{ opacity: 0.5 }}>
                      <img src="/assets/dropbox.png" alt="Dropbox" className="provider-logo" />
                      <span className="provider-name">Dropbox</span>
                      <div className="breakdown-progress">
                        <div className="progress-bar-fill db" style={{ width: `0%` }} />
                      </div>
                      <span className="provider-sizes">
                        <strong>0 B</strong> <span className="muted-size">of 2 GB</span>
                      </span>
                      <span className="provider-percent db-text">0%</span>
                      <span className="row-chevron">❯</span>
                    </div>
                    {/* OneDrive Mock */}
                    <div className="breakdown-row" style={{ opacity: 0.5 }}>
                      <img src="/assets/onedrive.png" alt="OneDrive" className="provider-logo" />
                      <span className="provider-name">OneDrive</span>
                      <div className="breakdown-progress">
                        <div className="progress-bar-fill od" style={{ width: `0%` }} />
                      </div>
                      <span className="provider-sizes">
                        <strong>0 B</strong> <span className="muted-size">of 5 GB</span>
                      </span>
                      <span className="provider-percent od-text">0%</span>
                      <span className="row-chevron">❯</span>
                    </div>
                  </>
                )}
              </div>

              <div className="breakdown-divider-line" />
 
              {/* Total */}
              <div 
                className="breakdown-row total-row"
                onClick={() => navigate("/files")}
                style={{ cursor: "pointer" }}
              >
                <span className="provider-name">Total</span>
                <div className="breakdown-progress">
                  <div className="progress-bar-fill total" style={{ width: `${usedPercentage}%` }} />
                </div>
                <span className="provider-sizes">
                  <strong>{formatSize(totalUsedStorage || 34.7 * 1024 * 1024 * 1024)}</strong> <span className="muted-size">of {formatSize(totalLimitStorage)}</span>
                </span>
                <span className="provider-percent total-text">{usedPercentage}%</span>
                <span className="row-chevron">❯</span>
              </div>
            </div>
          </div>

          {/* RIGHT: RECENT ACTIVITY */}
          <div className="card glass recent-activity-card">
            <div className="card-header">
              <h3>Recent Activity</h3>
            </div>

            <div className="activity-timeline-list">
              {timelineActivities.map((act) => (
                <div key={act.id} className="timeline-item">
                  <div className={`timeline-icon-container ${act.colorClass}`}>{act.icon}</div>
                  <div className="timeline-details">
                    <p dangerouslySetInnerHTML={{ __html: act.text }} />
                    <span className="timeline-time">{act.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BOTTOM SECTION LAYOUT */}
        <section className="dashboard-bottom-grid">
          {/* RECENT FILES */}
          <div className="card glass recent-files-list-card">
            <div className="card-header">
              <h3>Recent Files</h3>
            </div>

            <div className="recent-files-horizontal-row">
              {recentFiles.length === 0 ? (
                <p className="muted">No recent files found.</p>
              ) : (
                recentFiles.map((file) => {
                  const fileTypeKey = getFileTypeKey(file);
                  const config = fileTypeConfigs[fileTypeKey];
                  const extConfig = getFileExtensionConfig(file.name);
                  
                  return (
                    <div 
                      key={file.id} 
                      className="recent-file-card glass"
                      onClick={() => file.url && window.open(file.url, "_blank")}
                    >
                      <div className="recent-card-top">
                        {extConfig ? (
                          <div className="extension-badge" style={{ background: extConfig.bg, color: extConfig.color }}>
                            <span className="ext-icon">{extConfig.icon}</span>
                            <span className="ext-label">{extConfig.label}</span>
                          </div>
                        ) : file.thumbnail ? (
                          <img src={file.thumbnail} alt={file.name} className="recent-card-thumbnail" />
                        ) : (
                          <div className="recent-card-fallback-badge" style={{ background: config.bg + "15", color: config.bg }}>
                            {config.icon}
                          </div>
                        )}
                        <span className="recent-card-dots">⋮</span>
                      </div>
                      <div className="recent-card-body">
                        <h4 title={file.name}>{file.name}</h4>
                        <span className="recent-card-provider">
                          {file.provider === "google" ? "Google Drive" : file.provider === "dropbox" ? "Dropbox" : file.provider === "s3" ? "Amazon S3" : "OneDrive"}
                        </span>
                        <div className="recent-card-meta">
                          <span>{file.size ? formatSize(file.size) : "-"}</span>
                          <span>•</span>
                          <span>{file.createdAt ? new Date(file.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : "Just now"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* STORAGE INSIGHTS */}
          <div className="card glass insights-card">
            <div className="card-header">
              <h3>Storage Insights</h3>
            </div>
            <div className="insights-content">
              <div className="insights-message">
                <span className="insights-msg-icon">{insightsIcon}</span>
                <div className="insights-msg-text">
                  <strong>{insightsTitle}</strong>
                  <p>{insightsDescription}</p>
                  {showCleanLink && (
                    <span 
                      className="insights-action-link" 
                      onClick={() => navigate("/optimize")}
                      style={{ 
                        color: "#818cf8", 
                        fontSize: "11px", 
                        fontWeight: "600", 
                        cursor: "pointer", 
                        marginTop: "5px",
                        display: "inline-block",
                        transition: "color 0.2s ease"
                      }}
                      onMouseOver={(e) => e.target.style.color = "#a5b4fc"}
                      onMouseOut={(e) => e.target.style.color = "#818cf8"}
                    >
                      Clean Up Now ➔
                    </span>
                  )}
                </div>
              </div>
              {/* SVG Provider Distribution Donut Chart */}
              <div className="insights-chart-wrapper" style={{ marginTop: "12px" }}>
                <svg viewBox="0 0 320 115" className="insights-chart-svg">
                  {/* Donut Chart */}
                  <g transform="rotate(-90 65 50)">
                    {/* Track */}
                    <circle cx="65" cy="50" r="30" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
                    
                    {/* Segment 1: Google Drive */}
                    {gdLength > 0 && (
                      <circle cx="65" cy="50" r="30" fill="none" stroke="#6366f1" strokeWidth="7" strokeDasharray={`${gdLength} ${C}`} strokeDashoffset={gdOffset} strokeLinecap="round" />
                    )}
                    {/* Segment 2: Dropbox */}
                    {dbLength > 0 && (
                      <circle cx="65" cy="50" r="30" fill="none" stroke="#0061ff" strokeWidth="7" strokeDasharray={`${dbLength} ${C}`} strokeDashoffset={dbOffset} strokeLinecap="round" />
                    )}
                    {/* Segment 3: OneDrive */}
                    {odLength > 0 && (
                      <circle cx="65" cy="50" r="30" fill="none" stroke="#00a2ed" strokeWidth="7" strokeDasharray={`${odLength} ${C}`} strokeDashoffset={odOffset} strokeLinecap="round" />
                    )}
                    {/* Segment 4: Amazon S3 */}
                    {s3Length > 0 && (
                      <circle cx="65" cy="50" r="30" fill="none" stroke="#f97316" strokeWidth="7" strokeDasharray={`${s3Length} ${C}`} strokeDashoffset={s3Offset} strokeLinecap="round" />
                    )}
                    {/* Segment 5: Box */}
                    {boxLength > 0 && (
                      <circle cx="65" cy="50" r="30" fill="none" stroke="#0061d5" strokeWidth="7" strokeDasharray={`${boxLength} ${C}`} strokeDashoffset={boxOffset} strokeLinecap="round" />
                    )}
                  </g>
 
                  {/* Hole text */}
                  <text x="65" y="46" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="7" fontWeight="500">TOTAL</text>
                  <text x="65" y="58" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">
                    {formatSize(googleTotalUsed + dropboxTotalUsed + onedriveTotalUsed + s3TotalUsed + boxTotalUsed)}
                  </text>
 
                  {/* Legend starting at x = 145 */}
                  {/* Google Drive Legend */}
                  <circle cx="145" cy="20" r="3" fill="#6366f1" />
                  <text x="155" y="23" fill="#fff" fontSize="9" fontWeight="500">Google Drive</text>
                  <text x="235" y="23" fill="rgba(255,255,255,0.4)" fontSize="9">{formatSize(googleTotalUsed)}</text>
                  <text x="310" y="23" fill="#818cf8" fontSize="9" fontWeight="600" textAnchor="end">{getSharePctString(gdPct)}</text>
 
                  {/* Dropbox Legend */}
                  <circle cx="145" cy="40" r="3" fill="#0061ff" />
                  <text x="155" y="43" fill="#fff" fontSize="9" fontWeight="500">Dropbox</text>
                  <text x="235" y="43" fill="rgba(255,255,255,0.4)" fontSize="9">{formatSize(dropboxTotalUsed)}</text>
                  <text x="310" y="43" fill="#60a5fa" fontSize="9" fontWeight="600" textAnchor="end">{getSharePctString(dbPct)}</text>
 
                  {/* OneDrive Legend */}
                  <circle cx="145" cy="60" r="3" fill="#00a2ed" />
                  <text x="155" y="63" fill="#fff" fontSize="9" fontWeight="500">OneDrive</text>
                  <text x="235" y="63" fill="rgba(255,255,255,0.4)" fontSize="9">{formatSize(onedriveTotalUsed)}</text>
                  <text x="310" y="63" fill="#67e8f9" fontSize="9" fontWeight="600" textAnchor="end">{getSharePctString(odPct)}</text>

                  {/* S3 Legend */}
                  <circle cx="145" cy="80" r="3" fill="#f97316" />
                  <text x="155" y="83" fill="#fff" fontSize="9" fontWeight="500">Amazon S3</text>
                  <text x="235" y="83" fill="rgba(255,255,255,0.4)" fontSize="9">{formatSize(s3TotalUsed)}</text>
                  <text x="310" y="83" fill="#fdba74" fontSize="9" fontWeight="600" textAnchor="end">{getSharePctString(s3Pct)}</text>

                  {/* Box Legend */}
                  <circle cx="145" cy="100" r="3" fill="#0061d5" />
                  <text x="155" y="103" fill="#fff" fontSize="9" fontWeight="500">Box</text>
                  <text x="235" y="103" fill="rgba(255,255,255,0.4)" fontSize="9">{formatSize(boxTotalUsed)}</text>
                  <text x="310" y="103" fill="#fdba74" fontSize="9" fontWeight="600" textAnchor="end">{getSharePctString(boxPct)}</text>
                </svg>
              </div>
            </div>
          </div>
        </section>
      </main>
    </MainLayout>
  );
};

export default Dashboard;

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