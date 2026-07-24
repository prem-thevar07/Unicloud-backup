import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getFiles } from "../services/fileService";
import API from "../config/api";
import MainLayout from "../layouts/MainLayout";
import "../styles/optimize.css";

const providerIcons = {
  google: "/assets/drive.png",
  dropbox: "/assets/dropbox.png",
  onedrive: "/assets/onedrive.png",
  box: "/assets/box.png",
  s3: "/assets/s3.png",
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

  // Large File Size Threshold & Filter States
  const [presetThreshold, setPresetThreshold] = useState("50MB");
  const [customValue, setCustomValue] = useState(100);
  const [customUnit, setCustomUnit] = useState("MB");
  const [activeThresholdLabel, setActiveThresholdLabel] = useState("50 MB");

  // Duplicate Search Query States
  const [dupSearchInput, setDupSearchInput] = useState("");
  const [activeDupSearchQuery, setActiveDupSearchQuery] = useState("");
  const [isSearchingDuplicates, setIsSearchingDuplicates] = useState(false);

  // Connected Accounts & File Type Filters
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState(["all"]);
  const [selectedFileType, setSelectedFileType] = useState("all");

  // Custom Dropdown Open States
  const [customDropdownOpen, setCustomDropdownOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

  // On-Demand Fetch & Pagination States for Large Files
  const [isFetchingLarge, setIsFetchingLarge] = useState(false);
  const [hasFetchedLarge, setHasFetchedLarge] = useState(false);
  const [largeCurrentPage, setLargeCurrentPage] = useState(1);
  const [fetchedChunksCount, setFetchedChunksCount] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Filtered Duplicates Memo
  const filteredDuplicates = useMemo(() => {
    if (!activeDupSearchQuery.trim()) return duplicates;
    const q = activeDupSearchQuery.toLowerCase();
    return duplicates.filter(
      (group) =>
        group.name?.toLowerCase().includes(q) ||
        group.files?.some(
          (f) =>
            f.name?.toLowerCase().includes(q) ||
            f.accountEmail?.toLowerCase().includes(q) ||
            f.parentFolder?.toLowerCase().includes(q)
        )
    );
  }, [duplicates, activeDupSearchQuery]);

  const SIZE_OPTIONS = [
    { value: "50MB", label: "50 MB" },
    { value: "500MB", label: "500 MB" },
    { value: "1GB", label: "1 GB" },
    { value: "2GB", label: "2 GB" },
    { value: "5GB", label: "5 GB" },
    { value: "10GB", label: "10 GB" },
    { value: "custom", label: "Custom Size..." },
  ];

  const TYPE_OPTIONS = [
    { value: "all", label: "All File Types", icon: "🌐" },
    { value: "document", label: "Documents (PDF, Word, Excel)", icon: "📄" },
    { value: "image", label: "Images (JPG, PNG, WebP)", icon: "🖼️" },
    { value: "video", label: "Videos (MP4, MKV, MOV)", icon: "🎥" },
    { value: "audio", label: "Audio (MP3, WAV, FLAC)", icon: "🎵" },
    { value: "other", label: "Archives & Other", icon: "📦" },
  ];

  const PRESET_BYTES = {
    "50MB": 50 * 1024 * 1024,
    "500MB": 500 * 1024 * 1024,
    "1GB": 1024 * 1024 * 1024,
    "2GB": 2 * 1024 * 1024 * 1024,
    "5GB": 5 * 1024 * 1024 * 1024,
    "10GB": 10 * 1024 * 1024 * 1024,
  };

  const getThresholdBytes = () => {
    if (presetThreshold === "custom") {
      const val = Number(customValue) || 1;
      return customUnit === "GB" ? val * 1024 * 1024 * 1024 : val * 1024 * 1024;
    }
    return PRESET_BYTES[presetThreshold] || 50 * 1024 * 1024;
  };

  const getThresholdLabel = () => {
    if (presetThreshold === "custom") {
      return `${customValue} ${customUnit}`;
    }
    return presetThreshold.replace("MB", " MB").replace("GB", " GB");
  };

  // Auth Guard
  useEffect(() => {
    if (!token) {
      navigate("/auth");
    }
  }, [token, navigate]);

  // Fetch Connected Accounts on mount
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await API.get("/accounts");
        const accList = res.data?.accounts || res.data || [];
        setConnectedAccounts(accList);
      } catch (err) {
        console.error("Failed to load connected accounts for filter:", err);
      }
    };
    if (token) {
      fetchAccounts();
    }
  }, [token]);

  // Page continuation tokens for on-demand cloud page crawling
  const [cloudPageTokens, setCloudPageTokens] = useState({});
  const [hasMoreCloudPages, setHasMoreCloudPages] = useState(false);
  const [isScanningNextPage, setIsScanningNextPage] = useState(false);

  // Load and Analyze Files (Instant 0ms Load with Session Cache & Sub-Second Background Sync)
  const loadAndAnalyzeFiles = async () => {
    if (!token) return;

    let hasCache = false;
    try {
      const cached = sessionStorage.getItem("unicloud_optimize_files_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAllFiles(parsed);
          analyzeFiles(parsed);
          setLoading(false); // Instant rendering!
          hasCache = true;
        }
      }
    } catch (e) {
      console.warn("Session cache read error:", e);
    }

    if (!hasCache) {
      setLoading(true);
    }

    try {
      const response = await getFiles({ 
        view: "unified", 
        mode: "all", 
        pageSize: 200 // Sub-second fast response
      });

      const files = flattenFiles(response?.data || response);
      const tokensObj = response?.nextPageTokens || response?.data?.nextPageTokens || response?.pageTokens;
      
      if (tokensObj && typeof tokensObj === "object") {
        setCloudPageTokens(tokensObj);
        setHasMoreCloudPages(Object.values(tokensObj).some((t) => t && t !== "EOF"));
      } else {
        setHasMoreCloudPages(false);
      }

      if (files && files.length > 0) {
        setAllFiles(files);
        analyzeFiles(files);
        try {
          sessionStorage.setItem("unicloud_optimize_files_cache", JSON.stringify(files));
        } catch (e) {
          console.warn("Session cache write error:", e);
        }
      }
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

  // Duplicate Analysis
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
        reclaimable += group[0].size * (group.length - 1);
      }
    });

    setDuplicates(dups);
    setTotalReclaimable(reclaimable);
  };

  // Compute largest file in drive
  const maxFileSizeInDrive = useMemo(() => {
    if (!allFiles || allFiles.length === 0) return 0;
    return Math.max(...allFiles.map((f) => Number(f.size) || 0));
  }, [allFiles]);

  // Target-Count Chunk Fetcher (Gathers 10 matching files per page action)
  const handleFetchLargeFiles = async () => {
    setIsFetchingLarge(true);
    setFetchedChunksCount(1);
    const targetBytes = getThresholdBytes();
    const label = getThresholdLabel();
    setActiveThresholdLabel(label);

    try {
      const queryAccounts = !selectedAccountIds.includes("all") && selectedAccountIds.length > 0
        ? selectedAccountIds.join(",")
        : undefined;

      const queryType = selectedFileType !== "all" ? selectedFileType : undefined;

      let accumulatedFetchedFiles = [];
      let currentTokens = null;
      let hasMorePages = true;
      let batchCount = 0;
      const MAX_BATCH_ATTEMPTS = 12; // Safety cap
      const TARGET_MATCH_COUNT = 10; // Target matching files per page

      let matchedList = [];

      while (hasMorePages && matchedList.length < TARGET_MATCH_COUNT && batchCount < MAX_BATCH_ATTEMPTS) {
        batchCount++;
        const response = await getFiles({
          view: "unified",
          mode: "all",
          type: queryType,
          accounts: queryAccounts,
          pageSize: 250,
          pageTokens: currentTokens,
        });

        const batch = flattenFiles(response?.data || response);
        if (batch && batch.length > 0) {
          accumulatedFetchedFiles = [...accumulatedFetchedFiles, ...batch];
        }

        const tokensObj = response?.nextPageTokens || response?.data?.nextPageTokens || response?.pageTokens;
        if (tokensObj && typeof tokensObj === "object") {
          currentTokens = tokensObj;
          hasMorePages = Object.values(tokensObj).some((t) => t && t !== "EOF");
        } else {
          hasMorePages = false;
        }

        const uniqueMap = new Map();
        accumulatedFetchedFiles.forEach((f) => {
          if (f && f.id) uniqueMap.set(f.id, f);
        });
        const batchMergedList = Array.from(uniqueMap.values());
        matchedList = batchMergedList
          .filter((f) => {
            if (!f.size || Number(f.size) < targetBytes) return false;
            if (queryType) {
              if (queryType === "document") return f.type === "document" || f.mimeType?.includes("pdf") || f.mimeType?.includes("word");
              if (queryType === "image") return f.type === "image" || f.mimeType?.startsWith("image/");
              if (queryType === "video") return f.type === "video" || f.mimeType?.startsWith("video/");
              if (queryType === "audio") return f.type === "audio" || f.mimeType?.startsWith("audio/");
              if (queryType === "other") return f.type === "other" || (!["image", "video", "document", "audio"].includes(f.type));
            }
            return true;
          })
          .sort((a, b) => b.size - a.size);
      }

      setCloudPageTokens(currentTokens || {});
      setHasMoreCloudPages(hasMorePages);

      const uniqueMap = new Map();
      [...allFiles, ...accumulatedFetchedFiles].forEach((f) => {
        if (f && f.id) uniqueMap.set(f.id, f);
      });
      const finalMergedList = Array.from(uniqueMap.values());
      setAllFiles(finalMergedList);
      analyzeFiles(finalMergedList);

      try {
        sessionStorage.setItem("unicloud_optimize_files_cache", JSON.stringify(finalMergedList));
      } catch (e) {
        console.warn("Session cache update error:", e);
      }

      setLargeFiles(matchedList);
      setHasFetchedLarge(true);
      setLargeCurrentPage(1);
    } catch (err) {
      console.error("Fetch large files error:", err);
      showToast("Failed to fetch large files.");
    } finally {
      setIsFetchingLarge(false);
    }
  };

  // On-Demand Next 10 Matching Files Fetcher
  const handleScanNextCloudPage = async () => {
    if (!hasMoreCloudPages || isScanningNextPage) return;
    setIsScanningNextPage(true);
    const targetBytes = getThresholdBytes();

    try {
      const queryAccounts = !selectedAccountIds.includes("all") && selectedAccountIds.length > 0
        ? selectedAccountIds.join(",")
        : undefined;

      const queryType = selectedFileType !== "all" ? selectedFileType : undefined;

      let accumulatedFetchedFiles = [];
      let currentTokens = { ...cloudPageTokens };
      let hasMorePages = true;
      let batchCount = 0;
      const MAX_BATCH_ATTEMPTS = 12;
      const TARGET_ADDITIONAL_MATCHES = 10;
      const initialMatchCount = largeFiles.length;

      let newMatchedList = [...largeFiles];

      while (hasMorePages && (newMatchedList.length - initialMatchCount) < TARGET_ADDITIONAL_MATCHES && batchCount < MAX_BATCH_ATTEMPTS) {
        batchCount++;
        const response = await getFiles({
          view: "unified",
          mode: "all",
          type: queryType,
          accounts: queryAccounts,
          pageSize: 250,
          pageTokens: currentTokens,
        });

        const batch = flattenFiles(response?.data || response);
        if (batch && batch.length > 0) {
          accumulatedFetchedFiles = [...accumulatedFetchedFiles, ...batch];
        }

        const tokensObj = response?.nextPageTokens || response?.data?.nextPageTokens || response?.pageTokens;
        if (tokensObj && typeof tokensObj === "object") {
          currentTokens = tokensObj;
          hasMorePages = Object.values(tokensObj).some((t) => t && t !== "EOF");
        } else {
          hasMorePages = false;
        }

        const uniqueMap = new Map();
        [...allFiles, ...accumulatedFetchedFiles].forEach((f) => {
          if (f && f.id) uniqueMap.set(f.id, f);
        });
        const mergedList = Array.from(uniqueMap.values());
        newMatchedList = mergedList
          .filter((f) => f.size && Number(f.size) >= targetBytes)
          .sort((a, b) => b.size - a.size);
      }

      setCloudPageTokens(currentTokens || {});
      setHasMoreCloudPages(hasMorePages);

      const uniqueMap = new Map();
      [...allFiles, ...accumulatedFetchedFiles].forEach((f) => {
        if (f && f.id) uniqueMap.set(f.id, f);
      });
      const finalMergedList = Array.from(uniqueMap.values());
      setAllFiles(finalMergedList);
      analyzeFiles(finalMergedList);

      try {
        sessionStorage.setItem("unicloud_optimize_files_cache", JSON.stringify(finalMergedList));
      } catch (e) {
        console.warn("Session cache update error:", e);
      }

      setLargeFiles(newMatchedList);
      const newlyAdded = newMatchedList.length - initialMatchCount;
      const nextChunkNo = fetchedChunksCount + 1;
      setFetchedChunksCount(nextChunkNo);

      if (newlyAdded > 0) {
        setLargeCurrentPage((prev) => prev + 1);
      } else {
        setHasMoreCloudPages(false);
      }
    } catch (err) {
      console.error("Fetch next page error:", err);
      showToast("Failed to load next page.");
    } finally {
      setIsScanningNextPage(false);
    }
  };

  // Dynamic On-Demand Search for Duplicate Files Across Clouds
  const handleSearchDuplicates = async (queryOverride) => {
    const targetQuery = queryOverride !== undefined ? queryOverride : dupSearchInput;
    if (!targetQuery || !targetQuery.trim()) {
      setDupSearchInput("");
      setActiveDupSearchQuery("");
      analyzeFiles(allFiles);
      return;
    }

    const cleanQuery = targetQuery.trim();
    setIsSearchingDuplicates(true);
    setActiveDupSearchQuery(cleanQuery);

    try {
      const response = await getFiles({
        view: "unified",
        mode: "all",
        search: cleanQuery,
        pageSize: 1000,
      });

      const searchedFiles = flattenFiles(response?.data || response);

      const uniqueMap = new Map();
      [...allFiles, ...searchedFiles].forEach((f) => {
        if (f && f.id) uniqueMap.set(f.id, f);
      });
      const mergedList = Array.from(uniqueMap.values());
      setAllFiles(mergedList);
      analyzeFiles(mergedList);

      showToast(`Searched cloud drives for "${cleanQuery}"`);
    } catch (err) {
      console.error("Duplicate dynamic search error:", err);
      showToast("Failed to search cloud drives for duplicates.");
    } finally {
      setIsSearchingDuplicates(false);
    }
  };

  const handleClearDupSearch = () => {
    setDupSearchInput("");
    setActiveDupSearchQuery("");
    analyzeFiles(allFiles);
  };

  // Open File Action
  const handleOpenFile = (file) => {
    if (!file) return;
    if (file.url) {
      window.open(file.url, "_blank", "noopener,noreferrer");
    } else {
      const accountParam = file.accountId ? `?accountId=${file.accountId}` : "";
      const openUrl = `/api/${file.provider}/open/${encodeURIComponent(file.id)}${accountParam}`;
      window.open(openUrl, "_blank", "noopener,noreferrer");
    }
  };

  // Download File Action
  const handleDownloadFile = (file) => {
    if (!file) return;
    const token = localStorage.getItem("token");
    const accountParam = file.accountId ? `&accountId=${file.accountId}` : "";
    const nameParam = file.name ? `&name=${encodeURIComponent(file.name)}` : "";
    const downloadUrl = `/api/${file.provider}/download/${encodeURIComponent(file.id)}?token=${encodeURIComponent(token)}${accountParam}${nameParam}`;

    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", file.name || "download");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Downloading "${file.name}"...`);
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

      const updatedFiles = allFiles.filter((f) => f.id !== file.id);
      setAllFiles(updatedFiles);
      analyzeFiles(updatedFiles);
      try {
        sessionStorage.setItem("unicloud_optimize_files_cache", JSON.stringify(updatedFiles));
      } catch (e) {
        console.warn("Session cache update error:", e);
      }
      
      if (hasFetchedLarge) {
        const targetBytes = getThresholdBytes();
        let matched = updatedFiles.filter((f) => f.size && Number(f.size) >= targetBytes);
        if (!selectedAccountIds.includes("all") && selectedAccountIds.length > 0) {
          matched = matched.filter((f) => selectedAccountIds.includes(String(f.accountId)));
        }
        if (selectedFileType !== "all") {
          matched = matched.filter((f) => {
            if (selectedFileType === "document") return f.type === "document" || f.mimeType?.includes("pdf") || f.mimeType?.includes("word");
            if (selectedFileType === "image") return f.type === "image" || f.mimeType?.startsWith("image/");
            if (selectedFileType === "video") return f.type === "video" || f.mimeType?.startsWith("video/");
            if (selectedFileType === "audio") return f.type === "audio" || f.mimeType?.startsWith("audio/");
            if (selectedFileType === "other") return f.type === "other" || (!["image", "video", "document", "audio"].includes(f.type));
            return true;
          });
        }
        matched.sort((a, b) => b.size - a.size);
        setLargeFiles(matched);
      }
      
      showToast("File deleted successfully!");
    } catch (err) {
      console.error("Delete file failed:", err);
      showToast("Failed to delete file. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  // Pagination Math for Large Files
  const totalLargePages = Math.ceil(largeFiles.length / ITEMS_PER_PAGE) || 1;
  const paginatedLargeFiles = largeFiles.slice(
    (largeCurrentPage - 1) * ITEMS_PER_PAGE,
    largeCurrentPage * ITEMS_PER_PAGE
  );

  // Render Duplicate Files Tab Content
  const renderDuplicatesTab = () => {
    if (duplicates.length === 0) {
      return (
        <div className="empty-optimize glass animate-fade-in">
          <span className="empty-icon">🎉</span>
          <h3>No Duplicates Found</h3>
          <p className="muted">Your files are completely clean and organized!</p>
        </div>
      );
    }

    return (
      <div className="duplicates-section">
        {/* DUPLICATE SEARCH BAR WITH ON-DEMAND SEARCH BUTTON */}
        <div className="dup-search-bar glass">
          <div className="dup-search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Type file name to search copies across all connected clouds..."
              value={dupSearchInput}
              onChange={(e) => setDupSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearchDuplicates();
                }
              }}
              className="dup-search-input"
            />
            {dupSearchInput && (
              <button className="clear-search-btn" onClick={handleClearDupSearch} title="Clear Search">
                ✕
              </button>
            )}
          </div>
          <button
            className="btn-fetch-large"
            onClick={() => handleSearchDuplicates()}
            disabled={isSearchingDuplicates || !dupSearchInput.trim()}
            style={{ whiteSpace: "nowrap" }}
          >
            {isSearchingDuplicates ? "Searching Clouds..." : "🔍 Search Duplicate Copies"}
          </button>
          <span className="dup-count-badge">
            {activeDupSearchQuery
              ? `Showing ${filteredDuplicates.length} matching group(s) for "${activeDupSearchQuery}"`
              : `Showing ${filteredDuplicates.length} of ${duplicates.length} duplicate groups`}
          </span>
        </div>

        {isSearchingDuplicates ? (
          <div className="skeleton-loader-container glass animate-fade-in">
            <div className="skeleton-header">
              <div className="skeleton-spinner" />
              <div>
                <h4 className="skeleton-text-glow">🔍 Searching Cloud Storage for Duplicate Copies...</h4>
                <p className="muted" style={{ fontSize: "0.85rem", marginTop: "2px" }}>
                  Searching all connected cloud drives for copies of "{dupSearchInput}". Please wait...
                </p>
              </div>
            </div>
            <div className="skeleton-rows-wrapper">
              <div className="skeleton-row" />
              <div className="skeleton-row" />
              <div className="skeleton-row" />
            </div>
          </div>
        ) : filteredDuplicates.length === 0 ? (
          <div className="empty-optimize glass animate-fade-in">
            <span className="empty-icon">🔍</span>
            <h3>No Matching Duplicate Copies Found</h3>
            <p className="muted">No duplicate files matched your search query "{activeDupSearchQuery || dupSearchInput}".</p>
            <button
              className="btn-secondary"
              style={{ marginTop: "1rem" }}
              onClick={handleClearDupSearch}
            >
              Clear Search Filter
            </button>
          </div>
        ) : (
          <div className="duplicates-list">
            {filteredDuplicates.map((dupGroup) => (
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
                  {dupGroup.files.map((file) => (
                    <div key={file.id} className="dup-file-item">
                      <div className="dup-file-info">
                        <span className="provider-badge">
                          {providerIcons[file.provider] && (
                            <img src={providerIcons[file.provider]} alt={file.provider} className="provider-mini-logo" />
                          )}
                          <span className="provider-email">{file.accountEmail}</span>
                        </span>
                        <span className="dup-path">
                          📂 {file.parentFolder || "Root"}
                        </span>
                        <span className="dup-date">
                          📅 {formatDate(file.createdAt)}
                        </span>
                      </div>
                      <div className="dup-item-actions">
                        <button
                          className="btn-opt-action btn-opt-open"
                          onClick={() => handleOpenFile(file)}
                          title="Open File"
                        >
                          👁️ Open
                        </button>
                        <button
                          className="btn-opt-action btn-opt-download"
                          onClick={() => handleDownloadFile(file)}
                          title="Download File"
                        >
                          📥 Download
                        </button>
                        <button
                          className="btn-danger-sm"
                          onClick={() => handleDeleteFile(file)}
                          disabled={deletingId === file.id}
                        >
                          {deletingId === file.id ? "Deleting..." : "Delete Copy"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render Large Files Tab Content
  const renderLargeFilesTab = () => {
    return (
      <div className="large-files-section">
        {/* LARGE FILES FILTER & FETCH CONTROL BAR */}
        <div className="large-files-filter-bar glass">
          
          {/* 1. SIZE THRESHOLD DROPDOWN */}
          <div className="filter-group">
            <label className="filter-label">⚡ Min Size:</label>
            <div className="custom-dropdown-container">
              <div 
                className="custom-dropdown-trigger glass"
                onClick={() => {
                  setCustomDropdownOpen(!customDropdownOpen);
                  setAccountDropdownOpen(false);
                  setTypeDropdownOpen(false);
                }}
              >
                <span>{SIZE_OPTIONS.find((o) => o.value === presetThreshold)?.label || "Select Threshold"}</span>
                <span className="dropdown-arrow">{customDropdownOpen ? "▲" : "▼"}</span>
              </div>

              {customDropdownOpen && (
                <div className="custom-dropdown-menu glass">
                  {SIZE_OPTIONS.map((opt) => (
                    <div
                      key={opt.value}
                      className={`dropdown-option ${presetThreshold === opt.value ? "selected" : ""}`}
                      onClick={() => {
                        setPresetThreshold(opt.value);
                        setCustomDropdownOpen(false);
                      }}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* OUTSIDE CUSTOM SIZE INPUT */}
          {presetThreshold === "custom" && (
            <div className="custom-size-outer-wrapper glass">
              <input
                type="number"
                min="1"
                max="100000"
                value={customValue}
                onChange={(e) => setCustomValue(Math.max(1, Number(e.target.value)))}
                className="custom-outer-input"
                placeholder="Value"
              />
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                className="custom-outer-select"
              >
                <option value="MB">MB</option>
                <option value="GB">GB</option>
              </select>
            </div>
          )}

          {/* 2. ACCOUNTS FILTER DROPDOWN */}
          <div className="filter-group">
            <label className="filter-label">☁️ Accounts:</label>
            <div className="custom-dropdown-container">
              <div 
                className="custom-dropdown-trigger glass"
                onClick={() => {
                  setAccountDropdownOpen(!accountDropdownOpen);
                  setCustomDropdownOpen(false);
                  setTypeDropdownOpen(false);
                }}
              >
                <span>
                  {selectedAccountIds.includes("all")
                    ? `All Accounts (${connectedAccounts.length})`
                    : `${selectedAccountIds.length} Account(s)`}
                </span>
                <span className="dropdown-arrow">{accountDropdownOpen ? "▲" : "▼"}</span>
              </div>

              {accountDropdownOpen && (
                <div className="custom-dropdown-menu glass accounts-dropdown-menu">
                  <div
                    className={`dropdown-option ${selectedAccountIds.includes("all") ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedAccountIds(["all"]);
                      setAccountDropdownOpen(false);
                    }}
                  >
                    🌐 All Connected Accounts
                  </div>
                  {connectedAccounts.map((acc) => {
                    const isAccSelected = selectedAccountIds.includes(String(acc._id));
                    const providerName = acc.provider === 'google' ? 'Google Drive' : acc.provider === 'dropbox' ? 'Dropbox' : acc.provider === 's3' ? 'Amazon S3' : acc.provider === 'box' ? 'Box' : 'OneDrive';
                    
                    return (
                      <div
                        key={acc._id}
                        className={`dropdown-option account-option ${isAccSelected ? "selected" : ""}`}
                        onClick={() => {
                          if (selectedAccountIds.includes("all")) {
                            setSelectedAccountIds([String(acc._id)]);
                          } else {
                            if (isAccSelected) {
                              const updated = selectedAccountIds.filter(id => id !== String(acc._id));
                              setSelectedAccountIds(updated.length === 0 ? ["all"] : updated);
                            } else {
                              setSelectedAccountIds([...selectedAccountIds, String(acc._id)]);
                            }
                          }
                        }}
                      >
                        {providerIcons[acc.provider] && (
                          <img src={providerIcons[acc.provider]} alt={acc.provider} className="provider-mini-logo" />
                        )}
                        <span className="account-opt-email">{acc.email || providerName}</span>
                        {isAccSelected && <span className="check-mark">✓</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 3. FILE TYPE FILTER DROPDOWN */}
          <div className="filter-group">
            <label className="filter-label">📁 File Type:</label>
            <div className="custom-dropdown-container">
              <div 
                className="custom-dropdown-trigger glass"
                onClick={() => {
                  setTypeDropdownOpen(!typeDropdownOpen);
                  setCustomDropdownOpen(false);
                  setAccountDropdownOpen(false);
                }}
              >
                <span>
                  {TYPE_OPTIONS.find(o => o.value === selectedFileType)?.label || "All Types"}
                </span>
                <span className="dropdown-arrow">{typeDropdownOpen ? "▲" : "▼"}</span>
              </div>

              {typeDropdownOpen && (
                <div className="custom-dropdown-menu glass">
                  {TYPE_OPTIONS.map((opt) => (
                    <div
                      key={opt.value}
                      className={`dropdown-option ${selectedFileType === opt.value ? "selected" : ""}`}
                      onClick={() => {
                        setSelectedFileType(opt.value);
                        setTypeDropdownOpen(false);
                      }}
                    >
                      {opt.icon} {opt.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ON-DEMAND FETCH BUTTON */}
          <button
            className="btn-fetch-large"
            onClick={handleFetchLargeFiles}
            disabled={isFetchingLarge}
          >
            {isFetchingLarge ? "Fetching..." : "🔍 Fetch Large Files"}
          </button>
        </div>

        {isFetchingLarge ? (
          <div className="skeleton-loader-container glass animate-fade-in">
            <div className="skeleton-header">
              <div className="skeleton-spinner" />
              <div>
                <h4 className="skeleton-text-glow">📡 Scanning Connected Cloud Storage...</h4>
                <p className="muted" style={{ fontSize: "0.85rem", marginTop: "2px" }}>
                  Scanning connected cloud drives in chunks until 10 matching files are collected. Please wait...
                </p>
              </div>
            </div>
            <div className="skeleton-rows-wrapper">
              <div className="skeleton-row" />
              <div className="skeleton-row" />
              <div className="skeleton-row" />
              <div className="skeleton-row" />
              <div className="skeleton-row" />
              <div className="skeleton-row" />
            </div>
          </div>
        ) : !hasFetchedLarge ? (
          <div className="empty-optimize glass animate-fade-in">
            <span className="empty-icon">🔍</span>
            <h3>Configure Filters & Click Fetch</h3>
            <p className="muted">Choose your size threshold, account(s), and file type above, then click <strong>Fetch Large Files</strong> to run full cloud scan.</p>
          </div>
        ) : largeFiles.length === 0 ? (
          <div className="empty-optimize glass animate-fade-in">
            <span className="empty-icon">📁</span>
            <h3>No Large Files Found</h3>
            <p className="muted">
              No files found matching size &ge; {activeThresholdLabel}.<br />
              Largest file in storage: <strong>{formatSize(maxFileSizeInDrive)}</strong>.
            </p>
            {maxFileSizeInDrive > 0 && maxFileSizeInDrive < getThresholdBytes() && (
              <button 
                className="btn-secondary" 
                style={{ marginTop: "1rem" }}
                onClick={() => {
                  setPresetThreshold("50MB");
                  handleFetchLargeFiles();
                }}
              >
                Try 50 MB Filter
              </button>
            )}
          </div>
        ) : (
          <div className="large-files-results-wrapper">
            <div className="large-files-table-container glass animate-fade-in">
              <table className="optimize-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Account</th>
                    <th>Folder</th>
                    <th>Modified</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLargeFiles.map((file) => (
                    <tr key={file.id}>
                      <td className="file-name-cell" title={file.name}>
                        {file.name}
                      </td>
                      <td className="file-size-cell">{formatSize(file.size)}</td>
                      <td className="file-account-cell">
                        {providerIcons[file.provider] && (
                          <img src={providerIcons[file.provider]} alt={file.provider} className="provider-mini-logo" />
                        )}
                        <span>{file.accountEmail}</span>
                      </td>
                      <td className="file-folder-cell">📂 {file.parentFolder || "Root"}</td>
                      <td>{formatDate(file.createdAt)}</td>
                      <td className="opt-action-cell">
                        <button
                          className="btn-opt-action btn-opt-open"
                          onClick={() => handleOpenFile(file)}
                          title="Open File"
                        >
                          👁️ Open
                        </button>
                        <button
                          className="btn-opt-action btn-opt-download"
                          onClick={() => handleDownloadFile(file)}
                          title="Download File"
                        >
                          📥 Download
                        </button>
                        <button
                          className="btn-danger-sm"
                          onClick={() => handleDeleteFile(file)}
                          disabled={deletingId === file.id}
                          title="Delete File"
                        >
                          {deletingId === file.id ? "Deleting..." : "🗑️ Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* UNIFIED PAGINATION CONTROL BAR */}
            {largeFiles.length > 0 && (
              <div className="large-files-pagination-bar glass">
                <button
                  className="btn-pagination"
                  onClick={() => setLargeCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={largeCurrentPage === 1 || isScanningNextPage}
                >
                  ◀ Previous
                </button>

                <span className="pagination-info">
                  Page <strong>{largeCurrentPage}</strong> of <strong>{totalLargePages}</strong>
                  <span className="pagination-count-label">
                    {" "}
                    (Showing {(largeCurrentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(largeCurrentPage * ITEMS_PER_PAGE, largeFiles.length)} of {largeFiles.length})
                  </span>
                </span>

                {largeCurrentPage < totalLargePages ? (
                  <button
                    className="btn-pagination"
                    onClick={() => setLargeCurrentPage((p) => Math.min(totalLargePages, p + 1))}
                  >
                    Next ▶
                  </button>
                ) : hasMoreCloudPages ? (
                  <button
                    className="btn-pagination btn-load-more-inline"
                    onClick={handleScanNextCloudPage}
                    disabled={isScanningNextPage}
                  >
                    {isScanningNextPage ? "Fetching More..." : "📥 Load More Files ▶"}
                  </button>
                ) : (
                  <button
                    className="btn-pagination btn-no-more-pages"
                    disabled={true}
                  >
                    ✓ No More Pages
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
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
                  <h3>{hasFetchedLarge ? largeFiles.length : "-"}</h3>
                  <p>Large Files ({hasFetchedLarge ? `≥ ${activeThresholdLabel}` : "Click Fetch to View"})</p>
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
                Large Files {hasFetchedLarge ? `(${largeFiles.length})` : ""}
              </button>
            </div>

            {/* TAB PANEL CONTENT */}
            <section className="optimize-content-section">
              {activeTab === "duplicates" ? renderDuplicatesTab() : renderLargeFilesTab()}
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

function formatDate(dateStr) {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Unknown";
  // Explicit Date-Month-Year format (DD/MM/YYYY)
  return d.toLocaleDateString("en-GB");
}
