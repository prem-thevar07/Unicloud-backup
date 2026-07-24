import React, { useEffect, useState, useMemo } from "react";
import MainLayout from "../layouts/MainLayout";
import { getAccounts, getExplorerContents, batchTransferFiles, getTransferHistory, createFolder } from "../services/fileService";
import "../styles/transfer.css";

const providerNames = {
  google: "Google Drive",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  s3: "Amazon S3",
  box: "Box",
};

const providerIcons = {
  google: "/assets/drive.png",
  onedrive: "/assets/onedrive.png",
  dropbox: "/assets/dropbox.png",
  s3: "/assets/s3.png",
  box: "/assets/box.png",
};

const Transfer = () => {
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // Left Pane (Source Drive Explorer)
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [sourceBreadcrumbs, setSourceBreadcrumbs] = useState([
    { id: "root", name: "My Drive", path: "/" },
  ]);
  const [sourceSubfolders, setSourceSubfolders] = useState([]);
  const [sourceFiles, setSourceFiles] = useState([]);
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const [selectedFileIds, setSelectedFileIds] = useState([]);

  // Right Pane (Destination Drive Explorer)
  const [targetAccountId, setTargetAccountId] = useState("");
  const [targetBreadcrumbs, setTargetBreadcrumbs] = useState([
    { id: "root", name: "My Drive", path: "/" },
  ]);
  const [targetSubfolders, setTargetSubfolders] = useState([]);
  const [loadingTarget, setLoadingTarget] = useState(false);

  // New Folder Modal State
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Batch Operation State
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferProgressMsg, setTransferProgressMsg] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  // History State
  const [transferHistory, setTransferHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Mount Effect
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoadingAccounts(true);
    try {
      const accRes = await getAccounts();
      const userAccounts = accRes.accounts || accRes || [];
      setAccounts(userAccounts);

      if (userAccounts.length >= 1) {
        const srcAcc = userAccounts[0];
        setSourceAccountId(String(srcAcc._id));
        setSourceBreadcrumbs([{ id: "root", name: getRootLabel(srcAcc.provider), path: "/" }]);
      }
      if (userAccounts.length >= 2) {
        const tgtAcc = userAccounts[1];
        setTargetAccountId(String(tgtAcc._id));
        setTargetBreadcrumbs([{ id: "root", name: getRootLabel(tgtAcc.provider), path: "/" }]);
      } else if (userAccounts.length === 1) {
        const tgtAcc = userAccounts[0];
        setTargetAccountId(String(tgtAcc._id));
        setTargetBreadcrumbs([{ id: "root", name: getRootLabel(tgtAcc.provider), path: "/" }]);
      }
    } catch (err) {
      console.error("Fetch accounts error:", err);
      showToast("Failed to load connected cloud accounts.");
    } finally {
      setLoadingAccounts(false);
    }

    fetchHistory();
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await getTransferHistory();
      setTransferHistory(res.history || []);
    } catch (err) {
      console.error("Fetch history error:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Toast Helper
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  // Load Source Explorer Contents when sourceAccountId or sourceBreadcrumbs change
  useEffect(() => {
    if (sourceAccountId) {
      const currentFolder = sourceBreadcrumbs[sourceBreadcrumbs.length - 1];
      loadSourceExplorer(sourceAccountId, currentFolder.id, currentFolder.path);
    }
  }, [sourceAccountId, sourceBreadcrumbs]);

  const loadSourceExplorer = async (accId, folderId, folderPath) => {
    setLoadingSource(true);
    setSelectedFileIds([]);

    // Check 0ms Session Cache
    const cacheKey = `unicloud_transfer_src_${accId}_${folderId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setSourceSubfolders(parsed.subfolders || []);
        setSourceFiles(parsed.files || []);
        setLoadingSource(false);
      }
    } catch (_) {}

    try {
      const res = await getExplorerContents({
        accountId: accId,
        folderId,
        folderPath,
      });

      setSourceSubfolders(res.subfolders || []);
      setSourceFiles(res.files || []);

      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(res));
      } catch (_) {}
    } catch (err) {
      console.error("Error loading source explorer:", err);
      showToast("Failed to load folder contents.");
    } finally {
      setLoadingSource(false);
    }
  };

  // Load Target Explorer Contents when targetAccountId or targetBreadcrumbs change
  useEffect(() => {
    if (targetAccountId) {
      const currentFolder = targetBreadcrumbs[targetBreadcrumbs.length - 1];
      loadTargetExplorer(targetAccountId, currentFolder.id, currentFolder.path);
    }
  }, [targetAccountId, targetBreadcrumbs]);

  const loadTargetExplorer = async (accId, folderId, folderPath) => {
    setLoadingTarget(true);

    const cacheKey = `unicloud_transfer_tgt_${accId}_${folderId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setTargetSubfolders(parsed.subfolders || []);
        setLoadingTarget(false);
      }
    } catch (_) {}

    try {
      const res = await getExplorerContents({
        accountId: accId,
        folderId,
        folderPath,
      });

      setTargetSubfolders(res.subfolders || []);

      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(res));
      } catch (_) {}
    } catch (err) {
      console.error("Error loading target explorer:", err);
    } finally {
      setLoadingTarget(false);
    }
  };

  // Account object lookups
  const sourceAccount = useMemo(
    () => accounts.find((a) => String(a._id) === String(sourceAccountId)),
    [accounts, sourceAccountId]
  );

  const targetAccount = useMemo(
    () => accounts.find((a) => String(a._id) === String(targetAccountId)),
    [accounts, targetAccountId]
  );

  // Filtered Source Files by Search
  const filteredSourceFiles = useMemo(() => {
    if (!sourceSearch.trim()) return sourceFiles;
    const q = sourceSearch.toLowerCase();
    return sourceFiles.filter((f) => f.name && f.name.toLowerCase().includes(q));
  }, [sourceFiles, sourceSearch]);

  // Source Folder Navigation
  const handleOpenSourceSubfolder = (folder) => {
    setSourceBreadcrumbs((prev) => [
      ...prev,
      { id: folder.id, name: folder.name, path: folder.path || `/${folder.name}` },
    ]);
  };

  const handleSourceBreadcrumbClick = (index) => {
    setSourceBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  // Target Folder Navigation
  const handleOpenTargetSubfolder = (folder) => {
    setTargetBreadcrumbs((prev) => [
      ...prev,
      { id: folder.id, name: folder.name, path: folder.path || `/${folder.name}` },
    ]);
  };

  const handleTargetBreadcrumbClick = (index) => {
    setTargetBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  const getRootLabel = (provider) => {
    if (provider === "box") return "Box Root";
    if (provider === "s3") return "Bucket Root";
    if (provider === "dropbox") return "Dropbox Root";
    if (provider === "onedrive") return "OneDrive Root";
    return "My Drive";
  };

  // Compute Target Path string for transfer
  const currentTargetFolderPath = useMemo(() => {
    if (targetBreadcrumbs.length <= 1) return "/";
    return "/" + targetBreadcrumbs.slice(1).map((b) => b.name).join("/");
  }, [targetBreadcrumbs]);

  // Source Account Change
  const handleSourceAccountChange = (accId) => {
    setSourceAccountId(accId);
    const acc = accounts.find(a => String(a._id) === String(accId));
    const label = acc ? getRootLabel(acc.provider) : "My Drive";
    setSourceBreadcrumbs([{ id: "root", name: label, path: "/" }]);
  };

  // Target Account Change
  const handleTargetAccountChange = (accId) => {
    setTargetAccountId(accId);
    const acc = accounts.find(a => String(a._id) === String(accId));
    const label = acc ? getRootLabel(acc.provider) : "My Drive";
    setTargetBreadcrumbs([{ id: "root", name: label, path: "/" }]);
  };

  // Create Target Folder Handler
  const handleCreateTargetFolder = async (e) => {
    if (e) e.preventDefault();
    if (!newFolderName.trim() || !targetAccountId) return;

    setIsCreatingFolder(true);
    const currentTargetFolder = targetBreadcrumbs[targetBreadcrumbs.length - 1];
    const parentFolderId = currentTargetFolder ? currentTargetFolder.id : "root";

    try {
      const res = await createFolder({
        accountId: targetAccountId,
        folderName: newFolderName.trim(),
        parentFolderId,
        parentFolderPath: currentTargetFolderPath,
      });

      const folderName = newFolderName.trim();
      showToast(`Created folder "${folderName}" in ${targetAccount?.provider || "target drive"}!`);
      setNewFolderName("");
      setShowNewFolderModal(false);

      const created = res.folder;
      if (created) {
        handleOpenTargetSubfolder({
          id: created.id,
          name: created.name,
          path: created.path || `/${created.name}`,
        });
      } else {
        loadTargetExplorer(targetAccountId, parentFolderId, currentTargetFolderPath);
      }
    } catch (err) {
      console.error("Create folder error:", err);
      showToast(err.response?.data?.error || err.message || "Failed to create folder.");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Checkbox Selection
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedFileIds(filteredSourceFiles.map((f) => f.id));
    } else {
      setSelectedFileIds([]);
    }
  };

  const handleToggleFile = (fileId) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  // Batch Transfer Execution
  const handleBatchTransfer = async (operation) => {
    if (!sourceAccountId || !targetAccountId) {
      showToast("Please select both source and destination accounts.");
      return;
    }
    if (selectedFileIds.length === 0) {
      showToast("Please select at least one file to transfer.");
      return;
    }

    setIsTransferring(true);
    setTransferProgressMsg(
      `Streaming ${selectedFileIds.length} file(s) from ${sourceAccount?.provider} to ${targetAccount?.provider}...`
    );

    const currentTargetFolder = targetBreadcrumbs[targetBreadcrumbs.length - 1];
    const targetFolderIdToPass = currentTargetFolder ? currentTargetFolder.id : "root";

    try {
      const res = await batchTransferFiles({
        sourceAccountId,
        sourceFileIds: selectedFileIds,
        targetAccountId,
        targetFolderId: targetFolderIdToPass,
        targetFolderPath: currentTargetFolderPath,
        operation,
      });

      if (res.transferredCount > 0) {
        showToast(`Successfully ${operation === "move" ? "moved" : "copied"} ${res.transferredCount} file(s)!`);
      } else if (res.failedCount > 0) {
        const firstErr = res.errors?.[0]?.message || "Transfer failed due to an authentication error. Please reconnect the account.";
        showToast(`Transfer Failed: ${firstErr}`);
      } else {
        showToast("No files were transferred.");
      }
      setSelectedFileIds([]);

      // Reload active source & target folder explorers & history
      const curSrc = sourceBreadcrumbs[sourceBreadcrumbs.length - 1];
      const curTgt = targetBreadcrumbs[targetBreadcrumbs.length - 1];
      loadSourceExplorer(sourceAccountId, curSrc.id, curSrc.path);
      loadTargetExplorer(targetAccountId, curTgt.id, curTgt.path);
      fetchHistory();
    } catch (err) {
      console.error("Batch transfer error:", err);
      showToast(err.response?.data?.message || err.message || "Failed to execute transfer.");
    } finally {
      setIsTransferring(false);
      setTransferProgressMsg("");
    }
  };

  return (
    <MainLayout>
      <main className="transfer-page">
        {/* Toast Notification */}
        {toastMessage && <div className="toast-notification glass show">{toastMessage}</div>}

        {/* HERO TITLE HEADER */}
        <section className="transfer-hero">
          <div>
            <h1>Cloud Migration & Transfer 🚚 📋</h1>
            <p>
              Browse cloud folders and files exactly like Google Drive or Windows File Explorer, and stream files directly between connected drives.
            </p>
          </div>
          <div className="transfer-hero-stats">
            <div className="stat-card-mini glass">
              <span className="stat-val">{accounts.length}</span>
              <span className="stat-lbl">Connected Accounts</span>
            </div>
            <div className="stat-card-mini glass">
              <span className="stat-val">{transferHistory.length}</span>
              <span className="stat-lbl">Completed Transfers</span>
            </div>
          </div>
        </section>

        {/* DUAL-PANE SPLIT DRIVE EXPLORER */}
        <section className="transfer-dual-container">
          {/* LEFT PANE: SOURCE DRIVE EXPLORER */}
          <div className="transfer-pane glass">
            <div className="pane-header">
              <span className="pane-title">
                📤 Source Cloud Drive
              </span>
              <span className="muted" style={{ fontSize: "0.82rem" }}>
                {sourceSubfolders.length} folder(s), {filteredSourceFiles.length} file(s)
              </span>
            </div>

            {/* SOURCE ACCOUNT SELECTOR */}
            <div>
              <select
                className="account-selector-dropdown"
                value={sourceAccountId}
                onChange={(e) => handleSourceAccountChange(e.target.value)}
                disabled={isTransferring}
              >
                {accounts.map((acc) => (
                  <option key={acc._id} value={acc._id}>
                    {providerNames[acc.provider] || acc.provider} — {acc.email || "Connected"}
                  </option>
                ))}
              </select>
            </div>

            {/* INTERACTIVE SOURCE BREADCRUMB BAR */}
            <div className="explorer-breadcrumb-bar">
              {sourceBreadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.id + idx}>
                  <span
                    className={`breadcrumb-item ${idx === sourceBreadcrumbs.length - 1 ? "active" : ""}`}
                    onClick={() => handleSourceBreadcrumbClick(idx)}
                  >
                    {crumb.name}
                  </span>
                  {idx < sourceBreadcrumbs.length - 1 && <span className="breadcrumb-separator">➔</span>}
                </React.Fragment>
              ))}
            </div>

            {/* SEARCH & SELECT ALL ROW */}
            <div className="pane-search-row">
              <input
                type="text"
                className="pane-search-input"
                placeholder="🔍 Search current folder..."
                value={sourceSearch}
                onChange={(e) => setSourceSearch(e.target.value)}
              />
              <label className="select-all-label">
                <input
                  type="checkbox"
                  className="item-checkbox"
                  checked={
                    filteredSourceFiles.length > 0 &&
                    selectedFileIds.length === filteredSourceFiles.length
                  }
                  onChange={handleSelectAll}
                />
                Select All
              </label>
            </div>

            {/* FOLDERS GRID & FILES LIST CONTAINER */}
            <div className="pane-files-list">
              {loadingSource ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#94a3b8" }}>
                  <div className="skeleton-spinner" style={{ margin: "0 auto 0.8rem auto" }} />
                  Loading contents...
                </div>
              ) : (
                <>
                  {/* SUBFOLDERS SECTION */}
                  {sourceSubfolders.length > 0 && (
                    <div className="explorer-subfolders-grid">
                      {sourceSubfolders.map((folder) => (
                        <div
                          key={folder.id}
                          className="explorer-folder-card"
                          onClick={() => handleOpenSourceSubfolder(folder)}
                          title={`Open ${folder.name}`}
                        >
                          <span className="folder-card-icon">📁</span>
                          <span className="folder-card-name">{folder.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* FILES SECTION */}
                  {filteredSourceFiles.length === 0 && sourceSubfolders.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
                      This folder is empty.
                    </div>
                  ) : (
                    filteredSourceFiles.map((file) => {
                      const isSelected = selectedFileIds.includes(file.id);
                      return (
                        <div
                          key={file.id}
                          className={`transfer-file-item ${isSelected ? "selected" : ""}`}
                          onClick={() => handleToggleFile(file.id)}
                        >
                          <div className="item-left-info">
                            <input
                              type="checkbox"
                              className="item-checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                            />
                            <div className="item-name-box">
                              <span className="item-filename" title={file.name}>
                                {file.name}
                              </span>
                              <span className="item-submeta">
                                {formatSize(file.size)} • {formatDate(file.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </div>

          {/* RIGHT PANE: DESTINATION DRIVE EXPLORER */}
          <div className="transfer-pane glass">
            <div className="pane-header">
              <span className="pane-title">
                📥 Target Destination Drive
              </span>
              <span className="muted" style={{ fontSize: "0.82rem" }}>
                Target Folder: {currentTargetFolderPath}
              </span>
            </div>

            {/* TARGET ACCOUNT SELECTOR */}
            <div>
              <select
                className="account-selector-dropdown"
                value={targetAccountId}
                onChange={(e) => handleTargetAccountChange(e.target.value)}
                disabled={isTransferring}
              >
                {accounts.map((acc) => (
                  <option key={acc._id} value={acc._id}>
                    {providerNames[acc.provider] || acc.provider} — {acc.email || "Connected"}
                  </option>
                ))}
              </select>
            </div>

            {/* INTERACTIVE TARGET BREADCRUMB BAR */}
            <div className="explorer-breadcrumb-bar">
              {targetBreadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.id + idx}>
                  <span
                    className={`breadcrumb-item ${idx === targetBreadcrumbs.length - 1 ? "active" : ""}`}
                    onClick={() => handleTargetBreadcrumbClick(idx)}
                  >
                    {crumb.name}
                  </span>
                  {idx < targetBreadcrumbs.length - 1 && <span className="breadcrumb-separator">➔</span>}
                </React.Fragment>
              ))}
            </div>

            {/* TARGET SUBFOLDERS SELECTION GRID */}
            <div className="pane-files-list">
              {loadingTarget ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#94a3b8" }}>
                  <div className="skeleton-spinner" style={{ margin: "0 auto 0.8rem auto" }} />
                  Loading destination folders...
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                    <span style={{ fontSize: "0.85rem", color: "#a5b4fc", fontWeight: "600" }}>
                      Select Destination Subfolder (or stay in current folder):
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNewFolderModal(true)}
                      title="Create a new folder inside current destination"
                      style={{
                        background: "linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(168, 85, 247, 0.3))",
                        border: "1px solid rgba(168, 85, 247, 0.5)",
                        color: "#f8fafc",
                        padding: "5px 12px",
                        borderRadius: "8px",
                        fontSize: "0.82rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        boxShadow: "0 2px 10px rgba(99, 102, 241, 0.2)",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <span>📁✨</span>
                      <span>+ New Folder</span>
                    </button>
                  </div>

                  {targetSubfolders.length === 0 ? (
                    <div style={{ padding: "1.5rem 1rem", color: "#94a3b8", fontSize: "0.88rem" }}>
                      ✓ Files will be transferred into "{currentTargetFolderPath}". No subfolders inside.
                    </div>
                  ) : (
                    <div className="explorer-subfolders-grid">
                      {targetSubfolders.map((folder) => (
                        <div
                          key={folder.id}
                          className="explorer-folder-card"
                          onClick={() => handleOpenTargetSubfolder(folder)}
                          title={`Select ${folder.name}`}
                        >
                          <span className="folder-card-icon">📁</span>
                          <span className="folder-card-name">{folder.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* CREATE NEW FOLDER INLINE MODAL OVERLAY */}
            {showNewFolderModal && (
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(15, 23, 42, 0.75)",
                  backdropFilter: "blur(6px)",
                  zIndex: 9999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "1rem",
                }}
              >
                <div
                  className="glass"
                  style={{
                    width: "100%",
                    maxWidth: "420px",
                    padding: "1.8rem",
                    borderRadius: "16px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    background: "rgba(30, 41, 59, 0.95)",
                    boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
                  }}
                >
                  <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.2rem", color: "#f8fafc" }}>
                    📁 Create New Folder in {targetAccount ? (providerNames[targetAccount.provider] || targetAccount.provider) : "Target Drive"}
                  </h3>
                  <p style={{ margin: "0 0 1.2rem 0", fontSize: "0.85rem", color: "#94a3b8" }}>
                    New folder will be created inside <strong style={{ color: "#a5b4fc" }}>{currentTargetFolderPath}</strong>
                  </p>

                  <form onSubmit={handleCreateTargetFolder}>
                    <input
                      type="text"
                      className="account-selector-dropdown"
                      placeholder="Folder name (e.g. Migration 2026)"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      autoFocus
                      required
                      style={{ marginBottom: "1.2rem", width: "100%", boxSizing: "border-box" }}
                    />

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewFolderModal(false);
                          setNewFolderName("");
                        }}
                        disabled={isCreatingFolder}
                        style={{
                          background: "rgba(148, 163, 184, 0.2)",
                          border: "1px solid rgba(148, 163, 184, 0.3)",
                          color: "#cbd5e1",
                          padding: "8px 16px",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontWeight: "500",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isCreatingFolder || !newFolderName.trim()}
                        style={{
                          background: "linear-gradient(135deg, #6366f1, #a855f7)",
                          border: "none",
                          color: "#fff",
                          padding: "8px 20px",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontWeight: "600",
                          boxShadow: "0 4px 14px rgba(99, 102, 241, 0.4)",
                        }}
                      >
                        {isCreatingFolder ? "Creating..." : "Create Folder"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* TARGET STORAGE QUOTA GAUGE */}
            {targetAccount && (() => {
              const storageInfo = getAccountStorageInfo(targetAccount);
              const freeBytes = storageInfo.total ? Math.max(0, storageInfo.total - storageInfo.used) : null;
              return (
                <div className="quota-gauge-box">
                  <div className="quota-labels">
                    <span>Storage Used ({providerNames[targetAccount.provider] || targetAccount.provider})</span>
                    <span>
                      {formatSize(storageInfo.used)} / {storageInfo.total ? formatSize(storageInfo.total) : "Unlimited"}
                      {freeBytes !== null && (
                        <span style={{ color: "#94a3b8", marginLeft: "6px", fontWeight: "normal" }}>
                          ({formatSize(freeBytes)} free)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="quota-bar-track">
                    <div
                      className="quota-bar-fill"
                      style={{
                        width: `${storageInfo.percentage}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })()}

            {/* SUMMARY SELECTION BOX */}
            <div className="summary-selection-box">
              <div className="summary-row">
                <span>Selected Source Files:</span>
                <strong style={{ color: "#a5b4fc" }}>{selectedFileIds.length} item(s)</strong>
              </div>
              <div className="summary-row">
                <span>Source Drive:</span>
                <strong style={{ color: "#f8fafc" }}>{sourceAccount?.provider || "None"} ({sourceAccount?.email})</strong>
              </div>
              <div className="summary-row">
                <span>Destination Folder:</span>
                <strong style={{ color: "#a855f7" }}>{targetAccount?.provider || "None"} ({currentTargetFolderPath})</strong>
              </div>
            </div>
          </div>
        </section>

        {/* BATCH CONTROLS ACTION BAR */}
        <section className="batch-controls-bar glass">
          <div>
            <span style={{ fontWeight: "600", fontSize: "1rem", color: "#f8fafc" }}>
              Ready to Transfer {selectedFileIds.length} Selected Item(s)
            </span>
          </div>

          <div className="batch-btn-group">
            <button
              className="btn-batch-action btn-batch-copy"
              onClick={() => handleBatchTransfer("copy")}
              disabled={isTransferring || selectedFileIds.length === 0 || !sourceAccountId || !targetAccountId}
            >
              📋 Batch Copy Selected ({selectedFileIds.length})
            </button>
            <button
              className="btn-batch-action btn-batch-move"
              onClick={() => handleBatchTransfer("move")}
              disabled={isTransferring || selectedFileIds.length === 0 || !sourceAccountId || !targetAccountId}
            >
              🚚 Batch Move Selected ({selectedFileIds.length})
            </button>
          </div>
        </section>

        {/* LIVE PROGRESS STATUS */}
        {isTransferring && (
          <div className="transfer-loading-status glass show" style={{ padding: "1.2rem 1.5rem" }}>
            <div className="skeleton-spinner" style={{ width: "24px", height: "24px" }} />
            <span>{transferProgressMsg}</span>
          </div>
        )}

        {/* TRANSFER HISTORY LOG TABLE */}
        <section className="transfer-history-section">
          <h3>📊 Cloud Migration & Transfer History Log</h3>
          <div className="history-table-container glass">
            {loadingHistory ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "#94a3b8" }}>
                Loading transfer logs...
              </div>
            ) : transferHistory.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
                No transfer history recorded yet. Use the dual explorer above to copy or move files!
              </div>
            ) : (
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {transferHistory.map((item) => (
                    <tr key={item._id}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(item.createdAt)}</td>
                      <td>
                        <span className={`action-badge ${item.type === "file_moved" ? "moved" : "copied"}`}>
                          {item.type === "file_moved" ? "🚚 MOVED" : "📋 COPIED"}
                        </span>
                      </td>
                      <td>{item.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </MainLayout>
  );
};

export default Transfer;

/* Helper Functions */
function getAccountStorageInfo(account) {
  if (!account) return { used: 0, total: null, percentage: 0 };
  const used = account.storage?.used ?? account.storageUsed ?? account.usedStorage ?? 0;
  const total = account.storage?.total ?? account.storageTotal ?? account.totalStorage ?? null;
  const percentage = total && total > 0 ? Math.min(100, (used / total) * 100) : 15;
  return { used, total, percentage };
}

function formatSize(bytes) {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
}

function formatDate(dateStr) {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-GB");
}

function formatDateTime(dateStr) {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-GB") + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
