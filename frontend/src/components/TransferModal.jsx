import React, { useState } from "react";
import { copyFile, moveFile } from "../services/fileService";
import "../styles/TransferModal.css";

const providerIcons = {
  google: "https://cdn-icons-png.flaticon.com/512/2991/2991148.png",
  dropbox: "https://cdn-icons-png.flaticon.com/512/174/174845.png",
  onedrive: "https://cdn-icons-png.flaticon.com/512/732/732224.png",
  s3: "https://cdn-icons-png.flaticon.com/512/888/888837.png",
  box: "https://cdn-icons-png.flaticon.com/512/5968/5968832.png",
};

const providerNames = {
  google: "Google Drive",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  s3: "Amazon S3",
  box: "Box",
};

const TransferModal = ({ isOpen, onClose, file, connectedAccounts, onSuccess }) => {
  const [operation, setOperation] = useState("copy"); // "copy" | "move"
  const [targetAccountId, setTargetAccountId] = useState("");
  const [targetFolder, setTargetFolder] = useState("/");
  const [isTransferring, setIsTransferring] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen || !file) return null;

  // Filter valid target accounts (different account or different provider)
  const availableAccounts = connectedAccounts || [];

  const handleStartTransfer = async () => {
    if (!targetAccountId) {
      setErrorMsg("Please select a target cloud account.");
      return;
    }

    setIsTransferring(true);
    setErrorMsg("");

    try {
      const payload = {
        sourceAccountId: file.accountId,
        sourceFileId: file.id,
        targetAccountId,
        targetFolderId: targetFolder || "/",
      };

      let result;
      if (operation === "move") {
        result = await moveFile(payload);
      } else {
        result = await copyFile(payload);
      }

      if (onSuccess) {
        onSuccess(result);
      }
      onClose();
    } catch (err) {
      console.error("Transfer error:", err);
      setErrorMsg(err.response?.data?.message || err.message || "Failed to transfer file.");
    } finally {
      setIsTransferring(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return "Unknown size";
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
  };

  return (
    <div className="transfer-modal-backdrop" onClick={onClose}>
      <div className="transfer-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="transfer-modal-header">
          <h3>🔄 Cross-Cloud File Transfer</h3>
          <button className="close-modal-btn" onClick={onClose}>✕</button>
        </div>

        {/* SOURCE FILE BADGE */}
        <div className="source-file-badge">
          <span className="source-file-icon">📄</span>
          <div className="source-file-details">
            <span className="source-file-name" title={file.name}>{file.name}</span>
            <span className="source-file-meta">
              {formatSize(file.size)} • Source: {providerNames[file.provider] || file.provider} ({file.accountEmail || "Account"})
            </span>
          </div>
        </div>

        {/* OPERATION SELECTOR */}
        <div className="transfer-field-group">
          <label className="transfer-label">Select Action:</label>
          <div className="operation-selector">
            <button
              type="button"
              className={`op-btn ${operation === "copy" ? "active" : ""}`}
              onClick={() => setOperation("copy")}
              disabled={isTransferring}
            >
              📋 Copy File
            </button>
            <button
              type="button"
              className={`op-btn ${operation === "move" ? "active" : ""}`}
              onClick={() => setOperation("move")}
              disabled={isTransferring}
            >
              🚚 Move File
            </button>
          </div>
          <span className="muted" style={{ fontSize: "0.78rem", marginTop: "2px" }}>
            {operation === "copy"
              ? "Creates a duplicate copy on the target cloud account (original source file remains)."
              : "Transfers file to target cloud account and automatically deletes the original source file."}
          </span>
        </div>

        {/* TARGET ACCOUNT SELECTOR */}
        <div className="transfer-field-group">
          <label className="transfer-label">Target Cloud Account:</label>
          <select
            className="target-select-input"
            value={targetAccountId}
            onChange={(e) => setTargetAccountId(e.target.value)}
            disabled={isTransferring}
          >
            <option value="">-- Choose Target Account --</option>
            {availableAccounts.map((acc) => {
              const name = providerNames[acc.provider] || acc.provider;
              const isSource = String(acc._id) === String(file.accountId);
              return (
                <option key={acc._id} value={acc._id}>
                  {name} ({acc.email || "Connected"}) {isSource ? "• Current Source" : ""}
                </option>
              );
            })}
          </select>
        </div>

        {/* TARGET FOLDER */}
        <div className="transfer-field-group">
          <label className="transfer-label">Destination Folder / Path (Optional):</label>
          <input
            type="text"
            className="target-select-input"
            placeholder="/ or folder name (e.g. Root)"
            value={targetFolder}
            onChange={(e) => setTargetFolder(e.target.value)}
            disabled={isTransferring}
          />
        </div>

        {/* ERROR MESSAGE */}
        {errorMsg && (
          <div style={{ color: "#ef4444", fontSize: "0.85rem", fontWeight: "500" }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* LOADING STATUS */}
        {isTransferring && (
          <div className="transfer-loading-status">
            <div className="skeleton-spinner" style={{ width: "20px", height: "20px" }} />
            <span>
              {operation === "move" ? "Moving" : "Copying"} "{file.name}" to target cloud account... Please wait.
            </span>
          </div>
        )}

        {/* ACTIONS ROW */}
        <div className="transfer-actions-row">
          <button
            type="button"
            className="btn-cancel-transfer"
            onClick={onClose}
            disabled={isTransferring}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-start-transfer"
            onClick={handleStartTransfer}
            disabled={isTransferring || !targetAccountId}
          >
            {isTransferring ? "Transferring..." : operation === "move" ? "🚚 Start Move" : "📋 Start Copy"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransferModal;
