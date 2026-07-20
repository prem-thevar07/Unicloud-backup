import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { getFiles } from "../services/fileService";
import api from "../config/api";
import "../styles/files.css";
import MainLayout from "../layouts/MainLayout";
import { logActivity } from "../utils/activityLogger";

/* ===============================
   CONSTANTS & HELPERS
=============================== */
const providerIcons = {
  google: "/assets/drive.png",
  onedrive: "/assets/onedrive.png",
    dropbox: "/assets/dropbox.png",
  s3: "/assets/s3.png",
  box: "/assets/box.png",
};


const CATEGORIES = [
  { id: "all", label: "All Files", icon: "📁" },
  { id: "image", label: "Images", icon: "🖼️" },
  { id: "video", label: "Video", icon: "🎬" },
  { id: "audio", label: "Music", icon: "🎵" },
  { id: "document", label: "Document", icon: "📄" },
];

const DOC_SUBCATEGORIES = [
  { id: "all", label: "All Documents" },
  { id: "pdf", label: "PDFs", icon: "📕" },
  { id: "word", label: "Word Docs", icon: "📝" },
  { id: "excel", label: "Excel Sheets", icon: "📊" },
  { id: "text", label: "Text Files", icon: "📄" },
];

const getFileCategory = (file) => {
  const mime = file.mimeType?.toLowerCase() || "";
  const name = file.name?.toLowerCase() || "";
  
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (
    mime.includes("pdf") ||
    mime.includes("document") ||
    name.endsWith(".pdf") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx") ||
    name.endsWith(".txt") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".csv")
  ) return "document";

  return "other";
};

const formatSize = (bytes) => {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
};

const getPercent = (used = 0, total = 1) => {
  if (!total) return 0;
  return Math.min((used / total) * 100, 100);
};

const getCleanApiUrl = (path) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";
  const cleanBase = baseUrl.endsWith("/api") ? baseUrl.slice(0, -4) : baseUrl;
  return `${cleanBase}${path}`;
};

const getFileOpenUrl = (file) => {
  const url = file.url || file.webViewLink || "";
  if (url.startsWith("/api/")) {
    const token = localStorage.getItem("token");
    return `${getCleanApiUrl(url)}&token=${encodeURIComponent(token)}`;
  }
  return url;
};

const getThumbnailSrc = (file) => {
  if (!file || !file.thumbnail) return null;
  if (file.thumbnail.startsWith("/api/")) {
    const token = localStorage.getItem("token");
    return `${getCleanApiUrl(file.thumbnail)}&token=${encodeURIComponent(token)}`;
  }
  return file.thumbnail;
};


/* ===============================
   CUSTOM DESIGN HELPERS
=============================== */

const fileTypeConfigs = {
  pdf: { colorClass: "pdf", label: "PDF", icon: "📕", bg: "#ef4444" },
  word: { colorClass: "word", label: "Word Docs", icon: "📝", bg: "#3b82f6" },
  excel: { colorClass: "excel", label: "Excel Sheets", icon: "📊", bg: "#10b981" },
  powerpoint: { colorClass: "powerpoint", label: "Presentation", icon: "📂", bg: "#f97316" },
  zip: { colorClass: "zip", label: "Zip Archives", icon: "📦", bg: "#6b7280" },
  image: { colorClass: "image", label: "Images", icon: "🖼️", bg: "#8b5cf6" },
  video: { colorClass: "video", label: "Videos", icon: "🎬", bg: "#ec4899" },
  audio: { colorClass: "audio", label: "Audio Files", icon: "🎵", bg: "#06b6d4" },
  other: { colorClass: "other", label: "Other Files", icon: "📄", bg: "#6b7280" }
};

const getFileTypeKey = (file) => {
  const mime = file.mimeType?.toLowerCase() || "";
  const name = file.name?.toLowerCase() || "";
  
  if (name.endsWith(".pdf") || mime.includes("pdf")) return "pdf";
  if (name.endsWith(".doc") || name.endsWith(".docx") || mime.includes("word") || mime.includes("officedocument.wordprocessingml")) return "word";
  if (name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv") || mime.includes("excel") || mime.includes("spreadsheet") || mime.includes("officedocument.spreadsheetml")) return "excel";
  if (name.endsWith(".ppt") || name.endsWith(".pptx") || mime.includes("presentation") || mime.includes("powerpoint") || mime.includes("officedocument.presentationml")) return "powerpoint";
  if (name.endsWith(".zip") || name.endsWith(".rar") || name.endsWith(".7z") || mime.includes("zip") || mime.includes("compressed") || mime.includes("tar") || mime.includes("gzip")) return "zip";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  
  return "other";
};

const getFileVirtualPath = (file) => {
  if (file.path) return file.path;
  // Map files to paths based on their properties to match the mockup!
  const name = file.name?.toLowerCase() || "";
  if (name.includes("proposal") || name.includes("present") || name.includes("resume") || name.includes("project")) return "/Projects";
  if (name.includes("research") || name.includes("paper") || name.includes("thesis") || name.includes("college")) return "/College";
  if (name.includes("budget") || name.includes("sheet") || name.includes("invoice") || name.includes("financial") || name.includes("work")) return "/Work Files";
  if (name.includes("design") || name.includes("assets") || name.includes("logo") || name.includes("mockup")) return "/Designs";
  if (name.includes("screenshot") || name.includes("photo") || name.includes("img") || name.includes("backup")) return "/Photos Backup";
  if (name.includes("study") || name.includes("material") || name.includes("notes") || name.includes("book")) return "/Study Material";
  if (name.includes("personal") || name.includes("diary") || name.includes("todo")) return "/Personal";
  
  // Fallback: assign based on char codes of name to distribute evenly
  const folders = ["/Projects", "/College", "/Documents", "/Photos Backup", "/Personal", "/Work Files", "/Designs", "/Study Material"];
  const charCodeSum = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return folders[charCodeSum % folders.length];
};

/* ===============================
   SKELETON COMPONENT
=============================== */

const SkeletonRow = () => (
  <tr className="skeleton-row">
    <td>
      <div className="file-name-cell">
        <div className="skeleton-icon"></div>
        <div className="skeleton-text long"></div>
      </div>
    </td>
    <td><div className="skeleton-text"></div></td>
    <td><div className="skeleton-text"></div></td>
    <td><div className="skeleton-text short"></div></td>
    <td><div className="skeleton-btn"></div></td>
  </tr>
);

/* ===============================
   MAIN COMPONENT
=============================== */
const Files = () => {
  const [files, setFiles] = useState([]);
    const [accounts, setAccounts] = useState(() => {
    try {
      const cached = localStorage.getItem("unicloud_cached_accounts");
      return cached ? JSON.parse(cached) : [];
    } catch (_) {
      return [];
    }
  });
  const [filteredFiles, setFilteredFiles] = useState([]);
  
  // Custom design states
  const [viewMode, setViewMode] = useState("list"); // "list" | "grid"
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [activeFolderFilter, setActiveFolderFilter] = useState(null); // { id, name, path, accountId, provider }
  const [expandedAccountId, setExpandedAccountId] = useState(null);
  const [foldersByAccount, setFoldersByAccount] = useState(() => {
    try {
      const cached = localStorage.getItem("unicloud_cached_folders");
      return cached ? JSON.parse(cached) : {};
    } catch (_) {
      return {};
    }
  });
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
    const [sortOption, setSortOption] = useState("newest");
  const [foldersViewMode, setFoldersViewMode] = useState("classic");
  const [hoveredPath, setHoveredPath] = useState([]);
  const [flyoutTops, setFlyoutTops] = useState([]);
  const hoverContainerRef = useRef(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Fallback to Classic Tree mode on mobile screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setFoldersViewMode("classic");
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Filters
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeSubCategory, setActiveSubCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [timeline, setTimeline] = useState("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
    const [selectedAccounts, setSelectedAccounts] = useState([]);
  const [accountsDropdownOpen, setAccountsDropdownOpen] = useState(false);
  
    // Pagination
  const [visibleCount, setVisibleCount] = useState(15);
  const [loading, setLoading] = useState(true);
  const [loadingMoreCloud, setLoadingMoreCloud] = useState(false);
  const [localLoadingMore, setLocalLoadingMore] = useState(false);
    const [pageTokens, setPageTokens] = useState({});
  const isFetchingRef = useRef(false);
  const [searchParams] = useSearchParams();

    // Load account filter from URL parameters if navigated from Dashboard
  useEffect(() => {
    const accountIdParam = searchParams.get("accountId");
    if (accountIdParam) {
      setSelectedAccounts([accountIdParam]);
    }
  }, [searchParams]);

  // Pre-fetch folders for all accounts in the background on initial load
  useEffect(() => {
    if (accounts && accounts.length > 0) {
      accounts.forEach((acc) => {
        const preloadFolders = async () => {
          try {
            const res = await api.get(`/files/folders?accountId=${acc._id}`);
            let accountFolders = res.data || [];
            
            if (accountFolders.length === 0) {
              const seen = new Set();
              files.forEach(f => {
                if (String(f.accountId) === String(acc._id)) {
                  const path = getFileVirtualPath(f);
                  const folderName = path.startsWith("/") ? path.slice(1) : path;
                  if (folderName && !seen.has(folderName)) {
                    seen.add(folderName);
                    accountFolders.push({
                      id: folderName,
                      name: folderName,
                      path: path,
                      provider: f.provider,
                      accountId: f.accountId,
                      accountEmail: f.accountEmail || (f.provider === "google" ? "Google Drive" : f.provider === "dropbox" ? "Dropbox" : "OneDrive"),
                      isVirtual: true
                    });
                  }
                }
              });
            }

            setFoldersByAccount(prev => {
              const updated = { ...prev, [acc._id]: accountFolders };
              try {
                localStorage.setItem("unicloud_cached_folders", JSON.stringify(updated));
              } catch (_) {}
              return updated;
            });
          } catch (err) {
            console.error("Error preloading folders for account:", acc._id, err);
          }
        };
        preloadFolders();
      });
    }
  }, [accounts]);




  // Search Debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

    // Fetch when filters update
  useEffect(() => {
    fetchData();
  }, [debouncedSearch, timeline, customStartDate, customEndDate, activeFolderFilter, selectedAccounts]);

  useEffect(() => {
    applyFilters(false); // Don't reset pagination when just appending files
  }, [files]);

  useEffect(() => {
    applyFilters(true); // Reset pagination when filters change
  }, [activeCategory, activeSubCategory, search, selectedAccounts, activeFolderFilter, sortOption]);



  // Helper to parse preset dates into ISO format
  const getTimelineDates = () => {
    let startDateStr = null;
    let endDateStr = null;

    if (timeline === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      startDateStr = d.toISOString();
    } else if (timeline === "week") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      startDateStr = d.toISOString();
    } else if (timeline === "month") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      startDateStr = d.toISOString();
    } else if (timeline === "year") {
      const d = new Date();
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      startDateStr = d.toISOString();
    } else if (timeline === "custom") {
      if (customStartDate) {
        const d = new Date(customStartDate);
        d.setHours(0, 0, 0, 0);
        startDateStr = d.toISOString();
      }
      if (customEndDate) {
        const d = new Date(customEndDate);
        d.setHours(23, 59, 59, 999);
        endDateStr = d.toISOString();
      }
    }
    return { startDateStr, endDateStr };
  };

        const fetchData = async () => {
    setLoading(true);
    try {
                  const getFilesParams = {
        view: "unified",
        mode: "all",
        search: debouncedSearch
      };

      if (selectedAccounts.length > 0) {
        getFilesParams.accounts = selectedAccounts.join(",");
      }

      // For true cloud search, we search globally if search query is active (ignore folder/timeline query bounds)
      if (!debouncedSearch) {
        if (activeFolderFilter && !activeFolderFilter.isVirtual) {
          getFilesParams.folderId = activeFolderFilter.id;
          getFilesParams.folderPath = activeFolderFilter.path;
          getFilesParams.folderAccountId = activeFolderFilter.accountId;
        } else {
          const { startDateStr, endDateStr } = getTimelineDates();
          if (startDateStr) getFilesParams.startDate = startDateStr;
          if (endDateStr) getFilesParams.endDate = endDateStr;
        }
      }


      // Fetch files and accounts in parallel
      const [filesRes, accountsRes] = await Promise.all([
        getFiles(getFilesParams),
        api.get("/accounts").catch(() => ({ data: [] }))
      ]);

      const allFiles = [
        ...(filesRes.data?.image || []),
        ...(filesRes.data?.video || []),
        ...(filesRes.data?.document || []),
        ...(filesRes.data?.other || []),
      ];

            setFiles(allFiles);
      setPageTokens(filesRes.nextPageTokens || {});
      
      const fetchedAccounts = accountsRes.data || [];
      setAccounts(fetchedAccounts);
      try {
        localStorage.setItem("unicloud_cached_accounts", JSON.stringify(fetchedAccounts));
      } catch (_) {}
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };


  const fetchMoreFromCloud = async () => {
    if (isFetchingRef.current) return;
    
    // Check if there are any valid page tokens left
    const hasMoreInCloud = Object.values(pageTokens).some(token => token !== "EOF");
    if (!hasMoreInCloud) return;

    isFetchingRef.current = true;
    setLoadingMoreCloud(true);
    try {
            const getFilesParams = {
        view: "unified",
        mode: "all", // Fetch everything
        search: debouncedSearch,
        pageTokens 
      };

      if (selectedAccounts.length > 0) {
        getFilesParams.accounts = selectedAccounts.join(",");
      }


      if (activeFolderFilter && !activeFolderFilter.isVirtual) {
        getFilesParams.folderId = activeFolderFilter.id;
        getFilesParams.folderPath = activeFolderFilter.path;
        getFilesParams.folderAccountId = activeFolderFilter.accountId;
      } else {
        const { startDateStr, endDateStr } = getTimelineDates();
        if (startDateStr) getFilesParams.startDate = startDateStr;
        if (endDateStr) getFilesParams.endDate = endDateStr;
      }

      const filesRes = await getFiles(getFilesParams);


      const newFiles = [
        ...(filesRes.data?.image || []),
        ...(filesRes.data?.video || []),
        ...(filesRes.data?.document || []),
        ...(filesRes.data?.other || []),
      ];

      setFiles(prev => [...prev, ...newFiles]);
      setPageTokens(filesRes.nextPageTokens || {});
      setVisibleCount(prev => prev + 15);
    } catch (err) {
      console.error("Fetch more failed:", err);
    } finally {
      isFetchingRef.current = false;
      setLoadingMoreCloud(false);
    }
  };


    const applyFilters = (resetPagination = true) => {
    let data = [...files];

    // Filter by search
    if (search) {
      data = data.filter((f) =>
        f.name?.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Filter by category
    if (activeCategory !== "all") {
      data = data.filter((f) => getFileCategory(f) === activeCategory);

      // If document, check subcategory
      if (activeCategory === "document" && activeSubCategory !== "all") {
        data = data.filter((f) => {
          const name = f.name?.toLowerCase() || "";
          const mime = f.mimeType?.toLowerCase() || "";
          if (activeSubCategory === "pdf") return name.endsWith(".pdf") || mime.includes("pdf");
          if (activeSubCategory === "word") return name.endsWith(".doc") || name.endsWith(".docx") || mime.includes("word");
          if (activeSubCategory === "excel") return name.endsWith(".xls") || name.endsWith(".xlsx") || mime.includes("excel") || mime.includes("spreadsheet") || name.endsWith(".csv");
          if (activeSubCategory === "text") return name.endsWith(".txt") || mime.includes("text/plain");
          return true;
        });
      }
    }

            // Filter by account
    if (selectedAccounts.length > 0) {
      data = data.filter((f) => selectedAccounts.includes(String(f.accountId)));
    }


        // Filter by virtual folder local path matching
    if (activeFolderFilter && activeFolderFilter.isVirtual && !search) {
      data = data.filter((f) => getFileVirtualPath(f) === activeFolderFilter.path);
    }



    


    // Apply Sorting
    if (sortOption === "newest") {
      data.sort((a, b) => new Date(b.createdAt || a.createdAt || 0) - new Date(a.createdAt || b.createdAt || 0));
    } else if (sortOption === "oldest") {
      data.sort((a, b) => new Date(a.createdAt || b.createdAt || 0) - new Date(b.createdAt || a.createdAt || 0));
    } else if (sortOption === "name_asc") {
      data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortOption === "name_desc") {
      data.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    } else if (sortOption === "size_desc") {
      data.sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0));
    } else if (sortOption === "size_asc") {
      data.sort((a, b) => (Number(a.size) || 0) - (Number(b.size) || 0));
    }

    setFilteredFiles(data);
    if (resetPagination) {
      setVisibleCount(15); // Only reset visible count on filter change, not on load more
    }
  };


    const hasMoreInCloud = Object.values(pageTokens).some(token => token !== "EOF");

    const handleScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    // Trigger when within 100px of the bottom
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      if (!loading && !isFetchingRef.current && !localLoadingMore) {
        if (visibleCount < filteredFiles.length) {
          setLocalLoadingMore(true);
          setTimeout(() => {
            setVisibleCount((prev) => prev + 15);
            setLocalLoadingMore(false);
          }, 350);
        } else if (hasMoreInCloud) {
          fetchMoreFromCloud();
        }
      }
    }
  };


  // Calculate dynamic storage summaries
  const totalUsedStorage = accounts.reduce((accSum, a) => accSum + (a.storage?.used || 0), 0);
  const totalTotalStorage = accounts.reduce((accSum, a) => accSum + (a.storage?.total || 15 * 1024 * 1024 * 1024), 0);

          // Account Click & Collapsible expansion
    const handleAccountClick = async (accountId) => {
    setActiveFolderFilter(null);
    setSelectedAccounts(prev => 
      prev.includes(accountId) 
        ? prev.filter(id => id !== accountId) 
        : [...prev, accountId]
    );
    
    if (expandedAccountId === accountId) {
      setExpandedAccountId(null);
      return;
    }
    
    setExpandedAccountId(accountId);
    
    const fetchFoldersBackground = async () => {
      try {
        const res = await api.get(`/files/folders?accountId=${accountId}`);
        let accountFolders = res.data || [];
        
        if (accountFolders.length === 0) {
          const seen = new Set();
          files.forEach(f => {
            if (String(f.accountId) === String(accountId)) {
              const path = getFileVirtualPath(f);
              const folderName = path.startsWith("/") ? path.slice(1) : path;
              if (folderName && !seen.has(folderName)) {
                seen.add(folderName);
                accountFolders.push({
                  id: folderName,
                  name: folderName,
                  path: path,
                  provider: f.provider,
                  accountId: f.accountId,
                  accountEmail: f.accountEmail || (f.provider === "google" ? "Google Drive" : f.provider === "dropbox" ? "Dropbox" : "OneDrive"),
                  isVirtual: true
                });
              }
            }
          });
        }
        
        setFoldersByAccount(prev => {
          const updated = { ...prev, [accountId]: accountFolders };
          try {
            localStorage.setItem("unicloud_cached_folders", JSON.stringify(updated));
          } catch (_) {}
          return updated;
        });
      } catch (err) {
        console.error(err);
      } finally {
        setFoldersLoading(false);
      }
    };

    if (!foldersByAccount[accountId]) {
      setFoldersLoading(true);
    }
    fetchFoldersBackground();
  };


    // Folder Click toggle
  const handleFolderClick = (folder) => {
    setActiveFolderFilter(activeFolderFilter && activeFolderFilter.id === folder.id ? null : folder);
  };

  // Reset all filters
  const handleResetFilters = () => {
    setActiveCategory("all");
    setActiveSubCategory("all");
    setSearch("");
    setDebouncedSearch("");
    setTimeline("all");
    setCustomStartDate("");
    setCustomEndDate("");
    setSelectedAccounts([]);
    setActiveFolderFilter(null);
    setExpandedAccountId(null);
    setSortOption("newest");
  };



  // Toggle selection for all currently filtered files
  const toggleSelectAllFiles = () => {
    const visibleFilesSlice = filteredFiles.slice(0, visibleCount);
    const visibleIds = visibleFilesSlice.map(f => f.id);
    const allSelected = visibleIds.every(id => selectedFileIds.includes(id));
    
    if (allSelected) {
      setSelectedFileIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedFileIds(prev => [...new Set([...prev, ...visibleIds])]);
    }
  };

  // Toggle individual selection
  const toggleSelectFile = (fileId) => {
    setSelectedFileIds(prev => 
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
  };

  // Calculate selected files details
  const selectedFiles = filteredFiles.filter(f => selectedFileIds.includes(f.id));
  const selectedCount = selectedFiles.length;
  const selectedTotalSize = selectedFiles.reduce((sum, f) => sum + (f.size || 0), 0);

          const triggerDownload = (url) => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 15000);
  };

      const handleSingleDownload = async (file) => {
    try {
      if (file.provider === "dropbox") {
        const res = await api.get(`/dropbox/download/${file.accountId}?path=${encodeURIComponent(file.id)}`);
        if (res.data?.link) {
          triggerDownload(res.data.link);
          logActivity(`Downloaded file <strong>${file.name}</strong> from Dropbox`, "📥", "green");
              } else if (file.provider === "onedrive") {
        const res = await api.get(`/onedrive/download/${file.accountId}?fileId=${file.id}`);
        if (res.data?.link) {
          triggerDownload(res.data.link);
          logActivity(`Downloaded file <strong>${file.name}</strong> from OneDrive`, "📥", "green");
        } else {
          alert("Failed to generate download link");
        }
      } else if (file.provider === "s3") {
        const res = await api.get(`/s3/download/${file.accountId}?fileId=${file.id}`);
        if (res.data?.link) {
          triggerDownload(res.data.link);
          logActivity(`Downloaded file <strong>${file.name}</strong> from Amazon S3`, "📥", "green");
        } else {
          alert("Failed to generate download link");
        }
      } else if (file.provider === "box") {
        const res = await api.get(`/box/download/${file.accountId}?fileId=${file.id}`);
        if (res.data?.link) {
          triggerDownload(res.data.link);
          logActivity(`Downloaded file <strong>${file.name}</strong> from Box`, "📥", "green");
        } else {
          alert("Failed to generate download link");
        }
        } else {
          const dlink = file.webContentLink || file.url;
          if (dlink) {
            triggerDownload(dlink);
            logActivity(`Downloaded file <strong>${file.name}</strong> from Google Drive`, "📥", "green");
          } else {
            alert("Download link not available");
          }
        }
      }
    } catch (err) {
      console.error(err);
      alert("Failed to download file");
    }
  };

  // Bulk Actions
  const handleBulkDownload = () => {
    selectedFiles.forEach((f, index) => {
      // Tiny staggered delay to prevent network connection flooding, but execution contexts are separate iframes!
      setTimeout(async () => {
        try {
          if (f.provider === "dropbox") {
            const res = await api.get(`/dropbox/download/${f.accountId}?path=${encodeURIComponent(f.id)}`);
            if (res.data?.link) {
              triggerDownload(res.data.link);
              logActivity(`Downloaded file <strong>${f.name}</strong> from Dropbox`, "📥", "green");
            }
          } else if (f.provider === "onedrive") {
            const res = await api.get(`/onedrive/download/${f.accountId}?fileId=${f.id}`);
            if (res.data?.link) {
              triggerDownload(res.data.link);
              logActivity(`Downloaded file <strong>${f.name}</strong> from OneDrive`, "📥", "green");
            }
          } else {
            const dlink = f.webContentLink || f.url;
            if (dlink) {
              triggerDownload(dlink);
              logActivity(`Downloaded file <strong>${f.name}</strong> from Google Drive`, "📥", "green");
            }
          }
        } catch (err) {
          console.error("Bulk download item failed:", err);
        }
      }, index * 200);
    });
  };



    const handleShareFile = async (file) => {
    const slink = file.url || file.webContentLink || file.webViewLink;
    if (!slink) {
      alert("Share link not available");
      return;
    }
    
    logActivity(`Shared link generated for <strong>${file.name}</strong>`, "🔗", "purple");

    if (navigator.share) {
      try {
        await navigator.share({
          title: file.name,
          text: `Share file: ${file.name}`,
          url: slink
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Native share failed:", err);
        }
      }
    } else {
      navigator.clipboard.writeText(slink);
      alert("Share link copied to clipboard!");
    }
  };


  const handleBulkShare = async () => {
    const links = selectedFiles.map(f => f.url || f.webContentLink || f.webViewLink).filter(Boolean);
    if (links.length === 0) {
      alert("No share links available");
      return;
    }
    
    const shareText = `Shared ${links.length} files from Unicloud:\n` + selectedFiles.map(f => `${f.name}: ${f.url || f.webContentLink || f.webViewLink}`).join("\n");
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Shared Files from Unicloud",
          text: shareText,
          url: links[0]
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Bulk native share failed:", err);
        }
      }
    } else {
      navigator.clipboard.writeText(links.join("\n"));
      alert("Links copied to clipboard!");
    }
  };



  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedCount} items?`)) return;
    
    try {
      setLoading(true);
      setFiles(prev => prev.filter(f => !selectedFileIds.includes(f.id)));
      setSelectedFileIds([]);
    } catch (err) {
      console.error(err);
            } finally {
      setLoading(false);
    }
  };

    const showSkeletons = loadingMoreCloud || localLoadingMore;

  const getAccountTree = (account) => {
    const folders = foldersByAccount[account._id] || [];
    const root = { id: "root", name: "Root", type: "folder", children: [] };
    const pathMap = { "/": root };

    const sortedFolders = [...folders].sort((a, b) => {
      const slashesA = (a.path.match(/\//g) || []).length;
      const slashesB = (b.path.match(/\//g) || []).length;
      return slashesA - slashesB;
    });

    sortedFolders.forEach(folder => {
      const node = {
        id: folder.id,
        name: folder.name,
        type: "folder",
        path: folder.path,
        accountId: folder.accountId,
        provider: folder.provider,
        children: []
      };
      pathMap[folder.path] = node;

      const lastSlashIndex = folder.path.lastIndexOf("/");
      let parentPath = "/";
      if (lastSlashIndex > 0) {
        parentPath = folder.path.substring(0, lastSlashIndex);
      }

      const parentNode = pathMap[parentPath] || root;
      parentNode.children.push(node);
    });

    files.forEach(file => {
      if (String(file.accountId) !== String(account._id)) return;
      const node = {
        id: file.id,
        name: file.name,
        type: "file",
        path: file.path,
        size: file.size,
        createdAt: file.createdAt,
        provider: file.provider,
        accountId: file.accountId,
        fileObj: file
      };
      const parentPath = file.path || "/";
      const parentNode = pathMap[parentPath] || root;
      parentNode.children.push(node);
    });

    const sortTree = (n) => {
      n.children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "folder" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      n.children.forEach(c => {
        if (c.type === "folder") {
          sortTree(c);
        }
      });
    };
    sortTree(root);

    return root.children;
  };

  // Ref to debounce hover-off so flyouts don't vanish during mouse travel
  const hoverLeaveTimer = useRef(null);

  const cancelHoverLeave = () => {
    if (hoverLeaveTimer.current) {
      clearTimeout(hoverLeaveTimer.current);
      hoverLeaveTimer.current = null;
    }
  };

  const scheduleHoverLeave = () => {
    cancelHoverLeave();
    hoverLeaveTimer.current = setTimeout(() => {
      setHoveredPath([]);
    }, 350);
  };

  // Helper: get Y offset of an element relative to the hover container
  const getRelativeTop = (el) => {
    const containerEl = hoverContainerRef.current;
    if (!containerEl || !el) return 0;
    const containerRect = containerEl.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    return elRect.top - containerRect.top;
  };

  // Plain render function (NOT a component) so React diffs the output
  // in-place instead of unmounting/remounting on every hover state change.
  const renderHoverFolderExplorer = () => {
    return (
      <div 
        ref={hoverContainerRef}
        className="hover-explorer-container"
        onMouseLeave={scheduleHoverLeave}
        onMouseEnter={cancelHoverLeave}
      >
        <div className="hover-explorer-sidebar-list">
          {accounts.map(acc => {
            const providerName = acc.provider === 'google' ? 'Google Drive' : acc.provider === 'dropbox' ? 'Dropbox' : acc.provider === 's3' ? 'Amazon S3' : acc.provider === 'box' ? 'Box' : 'OneDrive';
            const isHovered = hoveredPath.length > 0 && hoveredPath[0].id === acc._id;
            
            return (
              <div 
                key={acc._id} 
                className={`hover-explorer-account-row ${isHovered ? "hovered" : ""}`}
                onMouseEnter={(e) => {
                  cancelHoverLeave();
                  const top = getRelativeTop(e.currentTarget);
                  const children = getAccountTree(acc);
                  setFlyoutTops([top]);
                  setHoveredPath([{ level: 0, id: acc._id, name: acc.email, type: "account", children }]);
                }}
                onClick={() => {
                  handleAccountClick(acc._id);
                  setActiveFolderFilter(null);
                }}
              >
                <span className="folder-badge-logo font-provider-icon">
                  <img src={providerIcons[acc.provider]} alt={acc.provider} />
                </span>
                <div className="account-info">
                  <h4 className="truncate" title={acc.email}>{acc.email}</h4>
                  <span className="provider-desc">{providerName}</span>
                </div>
                <span className="arrow">▶</span>
              </div>
            );
          })}
        </div>

        {/* CASCADING FLYOUTS — each aligned to the row that triggered it */}
        {hoveredPath.map((item, level) => {
          const children = item.children || [];
          if (children.length === 0) return null;

          return (
            <div 
              key={level}
              className="hover-explorer-flyout glass"
              style={{
                left: `${200 + level * 200}px`,
                top: `${flyoutTops[level] ?? 0}px`,
                zIndex: 100 + level
              }}
              onMouseEnter={cancelHoverLeave}
              onMouseLeave={scheduleHoverLeave}
            >
              <div className="flyout-header">
                <span>{item.name}</span>
              </div>
              <div className="flyout-body">
                {children.map(child => {
                  const isFolder = child.type === "folder";
                  const isChildHovered = hoveredPath.length > level + 1 && hoveredPath[level + 1].id === child.id;
                  
                  return (
                    <div
                      key={child.id}
                      className={`flyout-item ${isFolder ? "folder-item" : "file-item"} ${isChildHovered ? "active" : ""}`}
                      onMouseEnter={(e) => {
                        cancelHoverLeave();
                        if (isFolder) {
                          const top = getRelativeTop(e.currentTarget);
                          const newPath = hoveredPath.slice(0, level + 1);
                          newPath.push({
                            level: level + 1,
                            id: child.id,
                            name: child.name,
                            type: "folder",
                            children: child.children
                          });
                          setFlyoutTops(prev => {
                            const next = prev.slice(0, level + 1);
                            next[level + 1] = top;
                            return next;
                          });
                          setHoveredPath(newPath);
                        } else {
                          setHoveredPath(hoveredPath.slice(0, level + 1));
                        }
                      }}
                      onClick={() => {
                        if (isFolder) {
                          handleFolderClick({
                            id: child.id,
                            name: child.name,
                            path: child.path,
                            provider: child.provider,
                            accountId: child.accountId
                          });
                        } else {
                          if (child.fileObj) {
                            window.open(getFileOpenUrl(child.fileObj), "_blank");
                          }
                        }
                      }}
                    >
                      <span className="icon">{isFolder ? "📁" : "📄"}</span>
                      <span className="name truncate" title={child.name}>{child.name}</span>
                      {isFolder && <span className="arrow">▶</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (

    <MainLayout>
      <div className="file-manager-page">

        {/* TITLE BLOCK */}
        <div className="fm-title-block">
          <h2>All Files</h2>
          <p className="fm-subtitle">Browse and manage files from all your connected cloud accounts</p>
        </div>

        {/* TOP STORAGE CARDS */}
        <div className="storage-overview-grid">
                    {/* All Accounts Card */}
                    <div 
            className={`storage-overview-card master ${selectedAccounts.length === 0 ? "active" : ""}`}
            onClick={() => {
              setActiveFolderFilter(null);
              setSelectedAccounts([]);
            }}
          >
                        <div className="card-selection-check">
              <div className={`custom-card-checkbox ${selectedAccounts.length === 0 ? "checked" : ""}`} />
            </div>

            <div className="card-body">
              <div className="card-icon-container master">
                ☁️
              </div>
                            <div className="card-details" style={{ flex: 1, minWidth: 0 }}>
                <h4>All Accounts</h4>
                <span 
                  className="card-email" 
                  style={{ 
                    fontSize: "11.5px", 
                    color: "rgba(255,255,255,0.45)", 
                    display: "block", 
                    marginBottom: "4px"
                  }}
                >
                  All Connected Storage
                </span>
                <span className="card-size-label">{formatSize(totalUsedStorage)}</span>
              </div>
            </div>
          </div>

          {/* Account Specific Cards */}
          {accounts.map(acc => {
            const isSelected = selectedAccounts.includes(acc._id);
            return (
              <div 
                key={acc._id}
                className={`storage-overview-card ${isSelected ? "active" : ""}`}
                onClick={() => {
                  setSelectedAccounts(prev => 
                    prev.includes(acc._id) 
                      ? prev.filter(id => id !== acc._id) 
                      : [...prev, acc._id]
                  );
                }}
              >
                                <div className="card-selection-check">
                  <div className={`custom-card-checkbox ${isSelected ? "checked" : ""}`} />
                </div>

                <div className="card-body">
                  <div className="card-icon-container">
                    <img src={providerIcons[acc.provider]} alt={acc.provider} className="provider-card-icon" />
                  </div>
                  <div className="card-details" style={{ flex: 1, minWidth: 0 }}>
                                                             <h4>{acc.provider === 'google' ? 'Google Drive' : acc.provider === 'dropbox' ? 'Dropbox' : acc.provider === 's3' ? 'Amazon S3' : acc.provider === 'box' ? 'Box' : 'OneDrive'}</h4>

                    <span 
                      className="card-email" 
                      style={{ 
                        fontSize: "11.5px", 
                        color: "rgba(255,255,255,0.45)", 
                        display: "block", 
                        marginBottom: "4px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                      title={acc.email}
                    >
                      {acc.email}
                    </span>
                    <span className="card-size-label">{formatSize(acc.storage?.used || 0)}</span>
                  </div>

                </div>
              </div>
            );
          })}

          {accounts.length === 0 && !loading && (
             <div className="no-accounts-msg">No cloud accounts connected.</div>
          )}
        </div>

        {/* SEARCH BAR + VIEW TOGGLE — above filters */}
        <div className="fm-search-row">
          <div className="fm-search-wrapper">
            <span className="search-icon">🔍</span>
            <input 
              type="text" 
              placeholder="Search files across all accounts..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="view-mode-selector">
            <button 
              className={`view-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => setViewMode("grid")}
              title="Grid View"
            >
              Grid
            </button>
            <button 
              className={`view-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => setViewMode("list")}
              title="List View"
            >
              List
            </button>
          </div>
        </div>

        {/* HORIZONTAL FILTERS BAR */}
        <div className="fm-horizontal-filters">
          <select 
            className="filter-select"
            value={activeCategory}
            onChange={(e) => {
              setActiveCategory(e.target.value);
              setActiveSubCategory("all");
            }}
          >
            <option value="all">📂 All Types</option>
            <option value="image">🖼️ Images</option>
            <option value="video">🎬 Videos</option>
            <option value="audio">🎵 Audio</option>
            <option value="document">📄 Documents</option>
          </select>

          {activeCategory === "document" && (
            <select 
              className="filter-select"
              value={activeSubCategory}
              onChange={(e) => setActiveSubCategory(e.target.value)}
            >
              {DOC_SUBCATEGORIES.map(sub => (
                <option key={sub.id} value={sub.id}>{sub.icon} {sub.label}</option>
              ))}
            </select>
          )}

                    <div className="custom-multiselect-container" style={{ position: "relative", display: "inline-block" }}>
            <button 
              className="filter-select custom-select-btn"
              onClick={() => setAccountsDropdownOpen(!accountsDropdownOpen)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "space-between",
                minWidth: "160px",
                textAlign: "left",
                cursor: "pointer"
              }}
            >
              <span>
                ☁️ {selectedAccounts.length === 0 
                  ? "All Accounts" 
                  : `${selectedAccounts.length} Selected`}
              </span>
              <span style={{ fontSize: "10px", marginLeft: "8px", opacity: 0.7 }}>
                {accountsDropdownOpen ? "▲" : "▼"}
              </span>
            </button>
            
            {accountsDropdownOpen && (
              <>
                <div 
                  className="dropdown-overlay-closer" 
                  onClick={() => setAccountsDropdownOpen(false)}
                  style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                />
                <div 
                  className="custom-select-dropdown-card glass"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: "6px",
                    background: "rgba(15, 17, 26, 0.95)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "var(--radius-lg)",
                    padding: "8px",
                    minWidth: "240px",
                    zIndex: 999,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }}
                >
                  <div 
                    className="custom-dropdown-item select-all-row"
                    onClick={() => {
                      setSelectedAccounts([]);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      fontSize: "13px",
                      transition: "all 0.15s ease",
                      background: selectedAccounts.length === 0 ? "rgba(255,255,255,0.05)" : "transparent"
                    }}
                  >
                                        <div className={`custom-card-checkbox ${selectedAccounts.length === 0 ? "checked" : ""}`} />
                    <span>All Accounts</span>

                  </div>
                  
                  <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
                  
                  {accounts.map(acc => {
                    const isChecked = selectedAccounts.includes(acc._id);
                    return (
                      <div 
                        key={acc._id}
                        className="custom-dropdown-item"
                        onClick={() => {
                          setSelectedAccounts(prev => 
                            prev.includes(acc._id) 
                              ? prev.filter(id => id !== acc._id) 
                              : [...prev, acc._id]
                          );
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 12px",
                          borderRadius: "var(--radius-md)",
                          cursor: "pointer",
                          fontSize: "13px",
                          transition: "all 0.15s ease",
                          background: isChecked ? "rgba(255,255,255,0.03)" : "transparent"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = isChecked ? "rgba(255,255,255,0.03)" : "transparent"}
                      >
                                                <div className={`custom-card-checkbox ${isChecked ? "checked" : ""}`} />
                        <img 
                          src={providerIcons[acc.provider]} 
                          alt={acc.provider} 
                          style={{ width: "16px", height: "16px", objectFit: "contain" }} 
                        />

                        <span className="truncate" style={{ flex: 1, color: "var(--text-primary)" }} title={acc.email}>
                          {acc.email}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

                    <select
            className="filter-select"
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
          >
            <option value="all">🗓️ All Dates</option>
            <option value="today">⚡ Today</option>
            <option value="week">📅 Past 7 Days</option>
            <option value="month">📆 Past 30 Days</option>
            <option value="year">⏳ This Year</option>
            <option value="custom">📅 Custom Range</option>
          </select>

          {timeline === "custom" && (
            <div className="custom-date-inputs" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input 
                type="date" 
                className="filter-select" 
                value={customStartDate} 
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={{ padding: "4px 8px", height: "35px" }}
              />
              <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>to</span>
              <input 
                type="date" 
                className="filter-select" 
                value={customEndDate} 
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={{ padding: "4px 8px", height: "35px" }}
              />
            </div>
          )}


          <select
            className="filter-select"
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
          >
            <option value="newest">🕒 Newest first</option>
            <option value="oldest">🕒 Oldest first</option>
            <option value="name_asc">🔤 Name A-Z</option>
            <option value="name_desc">🔤 Name Z-A</option>
            <option value="size_desc">💾 Size (Large)</option>
            <option value="size_asc">💾 Size (Small)</option>
          </select>

                    <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
            <button 
              className={`filter-select select-mode-btn ${isSelectMode ? "active" : ""}`}
              onClick={() => {
                setIsSelectMode(!isSelectMode);
                if (isSelectMode) setSelectedFileIds([]);
              }}
              style={{
                padding: "6px 16px",
                background: isSelectMode ? "rgba(99, 102, 241, 0.2)" : "rgba(255, 255, 255, 0.05)",
                border: isSelectMode ? "1px solid rgba(99, 102, 241, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "var(--radius-md)",
                color: isSelectMode ? "#a5b4fc" : "var(--text-secondary)",
                fontSize: "12.5px",
                fontWeight: "600",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                height: "35px",
                transition: "all 0.15s ease"
              }}
            >
              🔳 {isSelectMode ? "Cancel" : "Select"}
            </button>

            <button 
              className="reset-filters-btn" 
              onClick={handleResetFilters}
              style={{
                padding: "6px 16px",
                background: "rgba(99, 102, 241, 0.1)",
                border: "1px solid rgba(99, 102, 241, 0.2)",
                borderRadius: "var(--radius-md)",
                color: "#a5b4fc",
                fontSize: "12.5px",
                fontWeight: "600",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                height: "35px",
                transition: "all 0.15s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(99, 102, 241, 0.2)";
                e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.35)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(99, 102, 241, 0.1)";
                e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.2)";
              }}
            >
              🔄 Reset
            </button>
          </div>


        </div>

        {/* MOBILE SIDEBAR TOGGLE BUTTON */}
        <button 
          className="mobile-sidebar-toggle-btn"
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        >
          📁 {mobileSidebarOpen ? "Hide Accounts & Folders" : "Show Accounts & Folders"}
        </button>

        {/* VERTICAL SPLIT SCREEN LAYOUT */}
        <div className="fm-split-layout">
          {/* LEFT PANE: ACCOUNTS & NESTED COLLAPSIBLE FOLDERS */}
          <aside className={`fm-left-pane ${mobileSidebarOpen ? "mobile-open" : ""}`}>
            <div className="fm-folders-section-vertical">
              <div className="section-header">
                <h3>Accounts <span className="item-count">{accounts.length}</span></h3>
                <button 
                  className="show-all-btn" 
                                    onClick={() => {
                    setSelectedAccounts([]);
                    setExpandedAccountId(null);
                    setActiveFolderFilter(null);
                  }}

                >
                  All Files
                </button>
              </div>
              
                            </div>

              {/* FOLDERS VIEW MODE TOGGLE */}
              <div className="folders-mode-toggle-bar">
                <button 
                  className={`toggle-mode-btn ${foldersViewMode === 'classic' ? 'active' : ''}`}
                  onClick={() => setFoldersViewMode('classic')}
                >
                  Classic Tree
                </button>
                <button 
                  className={`toggle-mode-btn ${foldersViewMode === 'hover' ? 'active' : ''}`}
                  onClick={() => setFoldersViewMode('hover')}
                >
                  Hover Explore
                </button>
              </div>

              {foldersViewMode === "classic" ? (
                <div className="folders-sidebar-list">
                {accounts.map(acc => {
                  const isExpanded = expandedAccountId === acc._id;
                                    const isAccountSelected = selectedAccounts.includes(acc._id);

                                    const accountFolders = foldersByAccount[acc._id] || [];
                                                       const providerName = acc.provider === 'google' ? 'Google Drive' : acc.provider === 'dropbox' ? 'Dropbox' : acc.provider === 's3' ? 'Amazon S3' : acc.provider === 'box' ? 'Box' : 'OneDrive';

                  
                  return (

                    <div key={acc._id} className="sidebar-account-group">
                                            <div 
                        className={`folder-list-item account-row ${isAccountSelected ? "active" : ""}`}
                        onClick={() => handleAccountClick(acc._id)}
                      >
                        <span className="folder-badge-logo font-provider-icon">
                          <img src={providerIcons[acc.provider]} alt={acc.provider} />
                        </span>
                        <div className="folder-item-info">
                          <h4 className="truncate" title={acc.email}>{acc.email}</h4>
                          <span className="folder-provider-desc">{providerName}</span>
                        </div>
                        <span className="expand-arrow" style={{ fontSize: "11px", opacity: 0.6 }}>
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>
                      
                      {isExpanded && (
                        <div className="nested-folders-list" style={{ paddingLeft: "24px", marginTop: "4px", display: "flex", flexDirection: "column", gap: "4px" }}>
                          {foldersLoading && !foldersByAccount[acc._id] && (
                            <div className="nested-loading" style={{ fontSize: "12px", color: "var(--text-muted)", padding: "6px 12px" }}>
                              Loading folders...
                            </div>
                          )}
                          {!foldersLoading && accountFolders.map(folder => {
                            const isFolderActive = activeFolderFilter && activeFolderFilter.id === folder.id;
                            return (
                              <div 
                                key={folder.id}
                                className={`folder-list-item nested ${isFolderActive ? "active" : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFolderClick(folder);
                                }}
                                style={{ padding: "6px 12px", borderRadius: "var(--radius-md)" }}
                              >
                                <span className="folder-small-icon" style={{ fontSize: "16px" }}>📁</span>
                                <div className="folder-item-info">
                                  <h4 style={{ fontSize: "12px", fontWeight: "500" }}>{folder.name}</h4>
                                </div>
                              </div>
                            );
                          })}
                          {!foldersLoading && accountFolders.length === 0 && (
                            <div className="nested-empty" style={{ fontSize: "12px", color: "var(--text-muted)", padding: "6px 12px" }}>
                              No folders found.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                                })}
              </div>

            ) : (
              renderHoverFolderExplorer()
            )}

          </aside>


          {/* RIGHT PANE: FILES EXPLORER */}
          <main className="fm-right-pane">
            {/* FILES GRID OR TABLE */}
            <div className="fm-files-section">
          <div className="section-header">
            <h3>Files <span className="item-count">{filteredFiles.length} items</span></h3>
          </div>

          {loading ? (
            <div className="fm-table-container">
              <table className="fm-files-table">
                                <thead>
                  <tr>
                    <th className="col-name">File Name</th>
                    <th className="col-account">Provider</th>
                    <th className="col-modified">Last Modified</th>
                    <th className="col-size">File Size</th>
                    <th className="col-actions"></th>
                  </tr>
                </thead>

                <tbody>
                  {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonRow key={i} />)}
                </tbody>
              </table>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="empty-state">No files found matching criteria.</div>
          ) : viewMode === "list" ? (
            /* TABLE VIEW */
            <div className="fm-table-container" onScroll={handleScroll}>
              <table className="fm-files-table">
                <thead>
                  <tr>
                                        {isSelectMode && (
                      <th className="checkbox-col" onClick={toggleSelectAllFiles} style={{ cursor: "pointer" }}>
                        <div 
                          className={`custom-card-checkbox ${
                            filteredFiles.length > 0 && filteredFiles.slice(0, visibleCount).every(f => selectedFileIds.includes(f.id)) 
                              ? "checked" 
                              : ""
                          }`}
                          style={{ margin: "0 auto" }}
                        />
                      </th>
                    )}

                                         <th className="col-name">Name</th>
                     <th className="col-account">Account</th>
                     <th className="col-size">Size</th>
                     <th className="col-modified">Modified</th>
                     <th className="col-actions">Actions</th>

                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.slice(0, visibleCount).map((file) => {
                    const fileTypeKey = getFileTypeKey(file);
                    const config = fileTypeConfigs[fileTypeKey];
                    const virtualPath = getFileVirtualPath(file);
                    const isSelected = selectedFileIds.includes(file.id);
                    
                    return (
                      <tr 
                        key={file.id} 
                        className={isSelected ? "selected-row" : ""}
                        onClick={() => isSelectMode && toggleSelectFile(file.id)}
                        style={{ cursor: isSelectMode ? "pointer" : "default" }}
                      >
                                                                        {isSelectMode && (
                          <td className="checkbox-cell" onClick={(e) => { e.stopPropagation(); toggleSelectFile(file.id); }}>
                            <div 
                              className={`custom-card-checkbox ${isSelected ? "checked" : ""}`}
                              style={{ margin: "0 auto" }}
                            />
                          </td>
                        )}

                        <td>
                          <div className="file-name-cell-custom">
                            <span className="file-type-icon-badge" style={{ background: config.bg }}>
                              {config.icon}
                            </span>
                            <div className="file-meta">
                              <span className="file-name-title" title={file.name}>{file.name}</span>
                              <span className="file-virtual-path">{virtualPath}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="file-account-badge">
                            <img src={providerIcons[file.provider]} alt={file.provider} className="provider-logo-table" />
                                                                                                                 <span>{file.accountEmail || (file.provider === 'google' ? 'Google Drive' : file.provider === 'dropbox' ? 'Dropbox' : file.provider === 's3' ? 'Amazon S3' : file.provider === 'box' ? 'Box' : 'OneDrive')}</span>



                          </div>
                        </td>
                        <td className="file-size-cell">{file.size ? formatSize(file.size) : "-"}</td>
                        <td className="file-modified-cell">
                          {file.createdAt ? new Date(file.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          }) : "-"}
                        </td>
                                                                        <td className="file-actions-cell" onClick={(e) => e.stopPropagation()}>
                                                     <a 
                             href={getFileOpenUrl(file)} 
                             target="_blank" 
 
                            rel="noreferrer" 
                            className="action-btn" 
                            style={{ 
                              marginRight: "8px",
                              padding: "6px 12px",
                              background: "rgba(255, 255, 255, 0.06)",
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              borderRadius: "var(--radius-md)",
                              color: "var(--text-primary)",
                              fontSize: "12.5px",
                              fontWeight: "500",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              height: "30px",
                              transition: "all 0.15s ease"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)";
                              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                            }}
                          >
                            Open
                          </a>
                                                    <button className="action-icon-btn download" title="Download" onClick={() => handleSingleDownload(file)}>⬇️</button>

                                                    <button className="action-icon-btn share" title="Share File" onClick={() => handleShareFile(file)}>🔗</button>

                        </td>


                      </tr>
                    );
                  })}
                                     {showSkeletons && [1, 2, 3].map((i) => <SkeletonRow key={`loading-${i}`} />)}

                </tbody>
              </table>
            </div>
          ) : (
            /* GRID VIEW */
            <div className="fm-grid-container" onScroll={handleScroll}>
              <div className="files-grid-layout">
                {filteredFiles.slice(0, visibleCount).map((file) => {
                  const fileTypeKey = getFileTypeKey(file);
                  const config = fileTypeConfigs[fileTypeKey];
                  const virtualPath = getFileVirtualPath(file);
                  const isSelected = selectedFileIds.includes(file.id);
                  
                  return (
                    <div 
                      key={file.id}
                      className={`file-grid-card ${isSelected ? "selected" : ""}`}
                      onClick={() => isSelectMode && toggleSelectFile(file.id)}
                      style={{ cursor: isSelectMode ? "pointer" : "default" }}
                    >
                                                                  {isSelectMode && (
                        <div className="grid-card-checkbox" onClick={(e) => { e.stopPropagation(); toggleSelectFile(file.id); }}>
                          <div className={`custom-card-checkbox ${isSelected ? "checked" : ""}`} />
                        </div>
                      )}


                                            <div className="grid-card-icon-area" style={{ background: config.bg + "15" }}>
                                                {file.thumbnail ? (
                          <img 
                            src={getThumbnailSrc(file)} 
                            alt={file.name} 
                            className="grid-card-thumbnail"

                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                              const fallbackIcon = e.currentTarget.nextSibling;
                              if (fallbackIcon) fallbackIcon.style.display = "inline";
                            }}
                          />
                        ) : null}
                        <span 
                          className="grid-card-icon" 
                          style={{ 
                            color: config.bg,
                            display: file.thumbnail ? "none" : "inline" 
                          }}
                        >
                          {config.icon}
                        </span>
                      </div>

                      <div className="grid-card-info">
                        <h4 title={file.name}>{file.name}</h4>
                        <span className="grid-card-path">{virtualPath}</span>
                        <div className="grid-card-footer">
                          <span className="grid-card-size">{file.size ? formatSize(file.size) : "-"}</span>
                          <img src={providerIcons[file.provider]} alt={file.provider} className="provider-logo-grid" />
                        </div>
                      </div>
                    </div>
                  );
                })}
                                                                {showSkeletons && (
                  <>
                    {[1, 2, 3, 4].map((i) => (
                      <div key={`grid-skeleton-${i}`} className="skeleton-card">
                        <div className="skeleton-card-icon" />
                        <div className="skeleton-card-text" />
                        <div className="skeleton-card-text short" />
                      </div>
                    ))}
                    <div className="grid-loading-more">
                      <div className="grid-loading-spinner"></div>
                      <span>Loading more files...</span>
                    </div>
                  </>
                )}


              </div>
            </div>
          )}
        </div>
      </main>
    </div>


        {/* FLOATING ACTION BAR FOR BULK OPERATIONS */}
        {selectedCount > 0 && (
          <div className="floating-actions-bar glass">
            <div className="fab-left">
              <span className="selected-badge">{selectedCount}</span>
              <span className="selected-meta">
                items selected <span className="meta-size">| {formatSize(selectedTotalSize)}</span>
              </span>
            </div>
            <div className="fab-right">
              <button className="fab-action-btn download" onClick={handleBulkDownload}>
                📥 Download
              </button>
                            <button className="fab-action-btn share" onClick={handleBulkShare}>
                🔗 Share
              </button>

              <button className="fab-action-btn delete" onClick={handleBulkDelete}>
                🗑️ Delete
              </button>
              <button className="fab-action-btn deselect" onClick={() => setSelectedFileIds([])}>
                Deselect
              </button>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default Files;
