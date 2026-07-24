import { useState, useEffect, useRef, useCallback } from "react";
import API from "../config/api";
import MainLayout from "../layouts/MainLayout";
import "../styles/photos.css";

const Photos = () => {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [pageTokens, setPageTokens] = useState({});
  const [hasMore, setHasMore] = useState(true);
  const [showVideos, setShowVideos] = useState(false);
  
  const observer = useRef();
  
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [downloadingPhoto, setDownloadingPhoto] = useState(false);
  const [zoom, setZoom] = useState(100);

  const getCleanApiUrl = (path) => {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";
    const cleanBase = baseUrl.endsWith("/api") ? baseUrl.slice(0, -4) : baseUrl;
    return `${cleanBase}${path}`;
  };

  const getPhotoSrc = (photo, highRes = false) => {
    if (!photo) return "/assets/logo.png";
    const src = photo.thumbnailLink || photo.baseUrl || "/assets/logo.png";
    if (src.startsWith("/api/")) {
      const token = localStorage.getItem("token");
      return `${getCleanApiUrl(src)}&token=${encodeURIComponent(token)}`;
    }
    return highRes ? src.replace("=s220", "=s2048") : src.replace("=s220", "=s400");
  };

  // Fetch accounts on mount
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await API.get("/accounts");
        const accs = Array.isArray(res.data) ? res.data : [];
        setAccounts(accs);
        
        // Default to selecting all connected source keys on mount
        const initialKeys = [];
        accs.forEach(acc => {
          if (acc.provider === "google") {
            initialKeys.push(`${acc._id}_drive`);
            initialKeys.push(`${acc._id}_photos`);
          } else if (acc.provider === "dropbox") {
            initialKeys.push(`${acc._id}_dropbox`);
          } else if (acc.provider === "onedrive") {
            initialKeys.push(`${acc._id}_onedrive`);
          } else if (acc.provider === "s3") {
            initialKeys.push(`${acc._id}_s3`);
          } else if (acc.provider === "box") {
            initialKeys.push(`${acc._id}_box`);
          }
        });
        setSelectedKeys(initialKeys);
      } catch (err) {
        console.error("Failed to load accounts", err);
      }
    };
    fetchAccounts();
  }, []);

  // Fetch photos
  const fetchPhotos = async (isLoadMore = false) => {
    try {
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      // Convert selectedKeys to accountSelections
      const accountSelections = selectedKeys.map(key => {
        const parts = key.split("_");
        return {
          accountId: parts[0],
          source: parts[1] // 'drive', 'photos', or 'dropbox'
        };
      });

      const res = await API.post("/photos", {
        accountSelections,
        pageTokens: isLoadMore ? pageTokens : undefined,
        includeVideos: showVideos
      });

      const newPhotos = res.data.files || [];
      const newTokens = res.data.nextTokens || {};

      if (isLoadMore) {
        setPhotos(prev => [...prev, ...newPhotos]);
      } else {
        setPhotos(newPhotos);
      }

      setPageTokens(newTokens);

      // Check if there's any valid token left
      const moreAvailable = Object.values(newTokens).some(token => token !== "EOF");
      setHasMore(moreAvailable);

    } catch (err) {
      console.error("Failed to load photos", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // When keys or video toggle changes, fetch from scratch
  useEffect(() => {
    if (accounts.length > 0) {
      fetchPhotos(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeys, showVideos]);

  const lastPhotoElementRef = useCallback(node => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        fetchPhotos(true);
      }
    });
    
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore, pageTokens, selectedKeys]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest(".custom-dropdown-container")) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  const handleDownload = async (photo) => {
    if (photo.provider === "s3") {
      try {
        const token = localStorage.getItem("token");
        const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";
        const durl = `${baseUrl}/s3/download/${photo.accountId}?fileId=${encodeURIComponent(photo.id)}&token=${encodeURIComponent(token)}`;
        window.open(durl, "_blank");
      } catch (err) {
        console.error(err);
        alert("Failed to download S3 file");
      }
      return;
    }

    if (photo.provider !== "dropbox") {
      window.open(photo.webContentLink, "_blank");
      return;
    }

    try {
      setDownloadingPhoto(true);
      const res = await API.get(`/dropbox/download/${photo.accountId}?path=${encodeURIComponent(photo.id)}`);
      if (res.data && res.data.link) {
        window.open(res.data.link, "_blank");
      } else {
        alert("Failed to generate download link");
      }
    } catch (err) {
      console.error("Download failed", err);
      alert("Failed to download file");
    } finally {
      setDownloadingPhoto(false);
    }
  };

  const selectableSources = [];
  accounts.forEach(acc => {
    if (acc.provider === "google") {
      selectableSources.push({
        key: `${acc._id}_drive`,
        accountId: acc._id,
        email: acc.email,
        source: "drive",
        provider: "google",
        label: `${acc.email} (Google Drive)`
      });
      selectableSources.push({
        key: `${acc._id}_photos`,
        accountId: acc._id,
        email: acc.email,
        source: "photos",
        provider: "google-photos",
        label: `${acc.email} (Google Photos)`
      });
    } else if (acc.provider === "dropbox") {
      selectableSources.push({
        key: `${acc._id}_dropbox`,
        accountId: acc._id,
        email: acc.email,
        source: "dropbox",
        provider: "dropbox",
        label: `${acc.email} (Dropbox)`
      });
    } else if (acc.provider === "onedrive") {
      selectableSources.push({
        key: `${acc._id}_onedrive`,
        accountId: acc._id,
        email: acc.email,
        source: "onedrive",
        provider: "onedrive",
        label: `${acc.email} (OneDrive)`
      });
    } else if (acc.provider === "s3") {
      selectableSources.push({
        key: `${acc._id}_s3`,
        accountId: acc._id,
        email: acc.email,
        source: "s3",
        provider: "s3",
        label: `${acc.email} (S3)`
      });
    } else if (acc.provider === "box") {
      selectableSources.push({
        key: `${acc._id}_box`,
        accountId: acc._id,
        email: acc.email,
        source: "box",
        provider: "box",
        label: `${acc.email} (Box)`
      });
    }
  });

  const dropdownLabel = selectedKeys.length === selectableSources.length
    ? "All Accounts"
    : selectedKeys.length === 0
    ? "No Accounts"
    : selectedKeys.length === 1
    ? selectableSources.find(s => s.key === selectedKeys[0])?.label || "1 Selection"
    : `${selectedKeys.length} Selections`;

  const allDriveKeys = accounts.filter(a => a.provider === 'google').map(a => `${a._id}_drive`);
  const isAllDriveSelected = allDriveKeys.length > 0 && allDriveKeys.every(k => selectedKeys.includes(k));

  const allPhotosKeys = accounts.filter(a => a.provider === 'google').map(a => `${a._id}_photos`);
  const isAllPhotosSelected = allPhotosKeys.length > 0 && allPhotosKeys.every(k => selectedKeys.includes(k));

  const allDropboxKeys = accounts.filter(a => a.provider === 'dropbox').map(a => `${a._id}_dropbox`);
  const isAllDropboxSelected = allDropboxKeys.length > 0 && allDropboxKeys.every(k => selectedKeys.includes(k));

  return (
    <MainLayout>
      <div className="photos-page">
        <header className="photos-hero glass">
          <div className="photos-hero-text">
            <h1>Photos</h1>
            <p className="photos-subtitle">
              Browse and manage your pictures and videos unified across all clouds
            </p>
          </div>
          
          <div className="photos-hero-controls">
            <div className="header-controls">
              <label className="video-toggle">
                <span className="toggle-label">Show Videos</span>
                <div className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={showVideos} 
                    onChange={(e) => setShowVideos(e.target.checked)} 
                  />
                  <span className="slider"></span>
                </div>
              </label>

              {accounts.length > 0 && (
                <div className={`custom-dropdown-container ${dropdownOpen ? "open" : ""}`}>
                  <button 
                    className="custom-dropdown-trigger"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                  >
                    {dropdownLabel}
                  </button>
                  <div className="custom-dropdown-menu">
                    {/* Select All Item with Submenu */}
                    <div 
                      className={`custom-dropdown-item select-all-row has-submenu ${selectedKeys.length === selectableSources.length ? "selected" : selectedKeys.length > 0 ? "partial-selected" : ""}`}
                      onClick={(e) => {
                        if (e.target.closest(".custom-dropdown-submenu")) return;
                        
                        if (selectedKeys.length === selectableSources.length) {
                          setSelectedKeys([]);
                        } else {
                          setSelectedKeys(selectableSources.map(s => s.key));
                        }
                      }}
                    >
                      <div className={`custom-dropdown-checkbox ${selectedKeys.length > 0 && selectedKeys.length < selectableSources.length ? "partial" : ""}`}></div>
                      <div className="custom-dropdown-info">
                        <span className="custom-dropdown-email">Select All</span>
                      </div>
                      <span className="submenu-arrow">▼</span>

                      {/* Select All Submenu Flyout */}
                      <div className="custom-dropdown-submenu" onClick={(e) => e.stopPropagation()}>
                        {accounts.some(a => a.provider === 'google') && (
                          <>
                            {/* All Drive */}
                            <div 
                              className={`custom-dropdown-subitem ${isAllDriveSelected ? "selected" : ""}`}
                              onClick={() => {
                                if (isAllDriveSelected) {
                                  setSelectedKeys(selectedKeys.filter(k => !allDriveKeys.includes(k)));
                                } else {
                                  setSelectedKeys([...new Set([...selectedKeys, ...allDriveKeys])]);
                                }
                              }}
                            >
                              <div className="custom-dropdown-checkbox"></div>
                              <img src="/assets/drive.png" className="custom-dropdown-provider-icon" alt="Drive" />
                              <span>All Google Drive</span>
                            </div>

                            {/* All Photos */}
                            <div 
                              className={`custom-dropdown-subitem ${isAllPhotosSelected ? "selected" : ""}`}
                              onClick={() => {
                                if (isAllPhotosSelected) {
                                  setSelectedKeys(selectedKeys.filter(k => !allPhotosKeys.includes(k)));
                                } else {
                                  setSelectedKeys([...new Set([...selectedKeys, ...allPhotosKeys])]);
                                }
                              }}
                            >
                              <div className="custom-dropdown-checkbox"></div>
                              <img src="/assets/google_photos.svg" className="custom-dropdown-provider-icon" alt="Photos" />
                              <span>All Google Photos</span>
                            </div>
                          </>
                        )}

                        {accounts.some(a => a.provider === 'dropbox') && (
                          <div 
                            className={`custom-dropdown-subitem ${isAllDropboxSelected ? "selected" : ""}`}
                            onClick={() => {
                              if (isAllDropboxSelected) {
                                setSelectedKeys(selectedKeys.filter(k => !allDropboxKeys.includes(k)));
                              } else {
                                setSelectedKeys([...new Set([...selectedKeys, ...allDropboxKeys])]);
                              }
                            }}
                          >
                            <div className="custom-dropdown-checkbox"></div>
                            <img src="/assets/dropbox.png" className="custom-dropdown-provider-icon" alt="Dropbox" />
                            <span>All Dropbox</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Individual Items */}
                    {accounts.map(acc => {
                      if (acc.provider === "google") {
                        const driveKey = `${acc._id}_drive`;
                        const photosKey = `${acc._id}_photos`;
                        const isDriveSelected = selectedKeys.includes(driveKey);
                        const isPhotosSelected = selectedKeys.includes(photosKey);
                        const isAllGoogleSelected = isDriveSelected && isPhotosSelected;
                        const isSomeGoogleSelected = isDriveSelected || isPhotosSelected;

                        return (
                          <div 
                            key={acc._id}
                            className={`custom-dropdown-item has-submenu ${isAllGoogleSelected ? "selected" : isSomeGoogleSelected ? "partial-selected" : ""}`}
                            onClick={(e) => {
                              // If the click originated inside the submenu, ignore it here
                              if (e.target.closest(".custom-dropdown-submenu")) return;
                              
                              if (isDriveSelected && isPhotosSelected) {
                                setSelectedKeys(selectedKeys.filter(k => k !== driveKey && k !== photosKey));
                              } else {
                                setSelectedKeys([...new Set([...selectedKeys, driveKey, photosKey])]);
                              }
                            }}
                          >
                            <div className={`custom-dropdown-checkbox ${isSomeGoogleSelected && !isAllGoogleSelected ? "partial" : ""}`}></div>
                            <div className="custom-dropdown-info">
                              <span className="custom-dropdown-email" title={acc.email}>{acc.email}</span>
                              <span className="custom-dropdown-provider">
                                <img 
                                  src="/assets/google.png" 
                                  alt="Google" 
                                  className="custom-dropdown-provider-icon" 
                                />
                                Google Account
                              </span>
                            </div>
                            <span className="submenu-arrow">▼</span>

                            {/* Submenu flyout */}
                            <div className="custom-dropdown-submenu" onClick={(e) => e.stopPropagation()}>
                              {/* Drive Subitem */}
                              <div 
                                className={`custom-dropdown-subitem ${isDriveSelected ? "selected" : ""}`}
                                onClick={() => {
                                  if (isDriveSelected) {
                                    setSelectedKeys(selectedKeys.filter(k => k !== driveKey));
                                  } else {
                                    setSelectedKeys([...selectedKeys, driveKey]);
                                  }
                                }}
                              >
                                <div className="custom-dropdown-checkbox"></div>
                                <img src="/assets/drive.png" className="custom-dropdown-provider-icon" alt="Drive" />
                                <span>Google Drive</span>
                              </div>

                              {/* Photos Subitem */}
                              <div 
                                className={`custom-dropdown-subitem ${isPhotosSelected ? "selected" : ""}`}
                                onClick={() => {
                                  if (isPhotosSelected) {
                                    setSelectedKeys(selectedKeys.filter(k => k !== photosKey));
                                  } else {
                                    setSelectedKeys([...selectedKeys, photosKey]);
                                  }
                                }}
                              >
                                <div className="custom-dropdown-checkbox"></div>
                                <img src="/assets/google_photos.svg" className="custom-dropdown-provider-icon" alt="Photos" />
                                <span>Google Photos</span>
                              </div>
                            </div>
                          </div>
                        );
                      } else {
                        const providerKey = `${acc._id}_${acc.provider}`;
                        const isSelected = selectedKeys.includes(providerKey);
                        const logoUrl = acc.provider === "dropbox" 
                          ? "/assets/dropbox.png" 
                          : acc.provider === "onedrive" 
                          ? "/assets/onedrive.png" 
                          : "/assets/s3.png";
                        const providerLabel = acc.provider === "dropbox" 
                          ? "Dropbox" 
                          : acc.provider === "onedrive" 
                          ? "OneDrive" 
                          : "Amazon S3";

                        return (
                          <div 
                            key={acc._id}
                            className={`custom-dropdown-item ${isSelected ? "selected" : ""}`}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedKeys(selectedKeys.filter(k => k !== providerKey));
                              } else {
                                setSelectedKeys([...selectedKeys, providerKey]);
                              }
                            }}
                          >
                            <div className="custom-dropdown-checkbox"></div>
                            <div className="custom-dropdown-info">
                              <span className="custom-dropdown-email" title={acc.email}>{acc.email}</span>
                              <span className="custom-dropdown-provider">
                                <img 
                                  src={logoUrl} 
                                  alt={providerLabel} 
                                  className="custom-dropdown-provider-icon" 
                                />
                                {providerLabel}
                              </span>
                            </div>
                          </div>
                        );
                      }
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {loading ? (
          <div className="photos-grid">
            {[...Array(12)].map((_, i) => (
              <div key={`skeleton-${i}`} className="skeleton-card" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="empty-state">
            <h3>No media found</h3>
            <p>Upload some images or videos to your cloud to see them here.</p>
          </div>
        ) : (
          <>
            <div className="photos-grid">
              {photos.map((photo, index) => {
                const isLast = index === photos.length - 1;
                const isVideo = photo.mimeType?.includes("video");

                return (
                  <div 
                    ref={isLast ? lastPhotoElementRef : null}
                    key={photo.id + index} 
                    className="photo-card"
                    onClick={() => { setLightboxPhoto(photo); setZoom(100); }}
                  >
                    <img 
                      src={getPhotoSrc(photo)} 
                      alt={photo.name} 
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.target.onerror = null; 
                        e.target.src = "/assets/logo.png";
                        e.target.style.objectFit = "contain";
                        e.target.style.padding = "40px";
                      }}
                    />
                    {isVideo && (
                      <div className="video-indicator">
                        ▶
                      </div>
                    )}
                    <div className="photo-overlay">
                      <span className="photo-name">{photo.name}</span>
                      <span className="photo-date">
                        {new Date(photo.createdTime).toLocaleDateString("en-GB")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className="load-more-container">
                <button 
                  className="load-more-btn" 
                  onClick={() => fetchPhotos(true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* LIGHTBOX */}
      {lightboxPhoto && (
        <div className="lightbox-overlay" onClick={() => setLightboxPhoto(null)}>
          <div className="lightbox-top-header" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-header-left">
              <button 
                className="lightbox-icon-btn close-btn" 
                onClick={() => setLightboxPhoto(null)} 
                title="Close"
              >
                ✕
              </button>
              <div className="lightbox-title-section">
                <h3 className="lightbox-title">{lightboxPhoto.name}</h3>
                <div className="lightbox-subtitle-info">
                  <img 
                    src={
                      lightboxPhoto.provider === "google"
                        ? "/assets/drive.png"
                        : lightboxPhoto.provider === "google-photos"
                        ? "/assets/google_photos.svg"
                        : lightboxPhoto.provider === "dropbox"
                        ? "/assets/dropbox.png"
                        : lightboxPhoto.provider === "onedrive"
                        ? "/assets/onedrive.png"
                        : "/assets/s3.png"
                    } 
                    alt={lightboxPhoto.provider} 
                    className="lightbox-provider-badge" 
                  />
                  <span>{lightboxPhoto.accountEmail}</span>
                  <span className="info-dot">•</span>
                  <span>{new Date(lightboxPhoto.createdTime).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="lightbox-header-right">
              <a 
                href={lightboxPhoto.webViewLink} 
                target="_blank" 
                rel="noreferrer" 
                className="lightbox-header-btn"
              >
                Open in {lightboxPhoto.provider === "dropbox" ? "Dropbox" : lightboxPhoto.provider === "onedrive" ? "OneDrive" : lightboxPhoto.provider === "s3" ? "Amazon S3" : "Drive"}
              </a>
              <button 
                onClick={() => handleDownload(lightboxPhoto)} 
                className="lightbox-header-btn"
                disabled={downloadingPhoto}
              >
                {downloadingPhoto ? "Generating..." : "Download"}
              </button>
            </div>
          </div>
          
          <div className="lightbox-viewer-canvas" onClick={() => setLightboxPhoto(null)}>
            <div 
              className="lightbox-image-container" 
              style={{ transform: `scale(${zoom / 100})` }}
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={getPhotoSrc(lightboxPhoto, true)} 
                alt={lightboxPhoto.name} 
                className="lightbox-viewer-img"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.target.onerror = null; 
                  e.target.src = "/assets/logo.png";
                  e.target.style.objectFit = "contain";
                  e.target.style.opacity = "0.5";
                }}
              />
            </div>
          </div>

          <div className="lightbox-bottom-toolbar" onClick={(e) => e.stopPropagation()}>
            <div className="zoom-controls">
              <button 
                className="zoom-btn" 
                onClick={() => setZoom(prev => Math.max(50, prev - 10))} 
                disabled={zoom <= 50}
                title="Zoom Out"
              >
                ➖
              </button>
              <span className="zoom-value">{zoom}%</span>
              <button 
                className="zoom-btn" 
                onClick={() => setZoom(prev => Math.min(300, prev + 10))} 
                disabled={zoom >= 300}
                title="Zoom In"
              >
                ➕
              </button>
              <button 
                className="zoom-reset-btn" 
                onClick={() => setZoom(100)}
                title="Reset Zoom"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default Photos;
