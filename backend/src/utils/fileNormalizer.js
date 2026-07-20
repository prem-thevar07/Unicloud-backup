export const normalizeFile = (
  file,
  provider,
  accountId,
  accountEmail
) => {
  if (!file) return null;

  let type = "other";

  /* ===============================
     GOOGLE NORMALIZATION
  =============================== */
  if (provider === "google") {
    // ❌ Skip folders (important)
    if (file.mimeType === "application/vnd.google-apps.folder") {
      return null;
    }

    const mime = file.mimeType || "";
    const name = file.name || "Unnamed File";

    /* ===============================
       TYPE DETECTION (ROBUST)
    =============================== */
    if (mime.startsWith("image/")) {
      type = "image";
    } else if (mime.startsWith("video/")) {
      type = "video";
    } else if (
      mime.includes("pdf") ||
      mime.includes("document") ||
      mime.includes("word") ||
      mime.includes("sheet") ||
      mime.includes("excel") ||
      mime.includes("presentation") ||
      mime.includes("text")
    ) {
      type = "document";
    }

    /* ===============================
       CLEAN RETURN OBJECT
    =============================== */
    return {
      id: file.id,

      // 🔥 Safe name
      name,

      type,

      size: Number(file.size) || 0,

      provider,

      accountId,
      accountEmail,

      // 🔥 Thumbnail fix (sometimes Google blocks it)
      thumbnail:
        file.thumbnailLink
          ? file.thumbnailLink.replace("=s220", "=s400")
          : null,

      url: file.webViewLink || null,
      webContentLink: `/api/google/download/${accountId}?fileId=${file.id}`,

      createdAt: file.createdTime || null,

      // 🔥 Extra (future use)
      mimeType: mime,
    };
  }

  /* ===============================
     DROPBOX NORMALIZATION
  =============================== */
  if (provider === "dropbox") {
    // Skip folders
    if (file[".tag"] === "folder") {
      return null;
    }

    const name = file.name || "Unnamed File";
    let type = "other";

    // Detect file type by file extension
    const ext = name.split(".").pop().toLowerCase();
    const images = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
    const videos = ["mp4", "mov", "avi", "mkv", "webm"];
    const docs = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf"];

    if (images.includes(ext)) {
      type = "image";
    } else if (videos.includes(ext)) {
      type = "video";
    } else if (docs.includes(ext)) {
      type = "document";
    }

    return {
      id: file.id,
      name,
      type,
      size: Number(file.size) || 0,
      provider,
      accountId,
      accountEmail,
      thumbnail: file.thumbnailLink || null,
      path: file.path_display ? file.path_display.substring(0, file.path_display.lastIndexOf("/")) || "/" : "/",
      url: file.webViewLink || `https://www.dropbox.com/home` + (file.path_display || ""),
      createdAt: file.server_modified || null,
      mimeType: type === "image" ? `image/${ext}` : type === "video" ? `video/${ext}` : "application/octet-stream",
    };
  }

  /* ===============================
     ONEDRIVE NORMALIZATION
  =============================== */
  if (provider === "onedrive") {
    if (file.folder) {
      return null;
    }

    const name = file.name || "Unnamed File";
    let type = "other";
    const mime = file.file?.mimeType || "";

    if (mime.startsWith("image/")) {
      type = "image";
    } else if (mime.startsWith("video/")) {
      type = "video";
    } else if (
      mime.includes("pdf") ||
      mime.includes("document") ||
      mime.includes("word") ||
      mime.includes("sheet") ||
      mime.includes("excel") ||
      mime.includes("presentation") ||
      mime.includes("text")
    ) {
      type = "document";
    } else {
      const ext = name.split(".").pop().toLowerCase();
      const images = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
      const videos = ["mp4", "mov", "avi", "mkv", "webm"];
      const docs = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf"];

      if (images.includes(ext)) {
        type = "image";
      } else if (videos.includes(ext)) {
        type = "video";
      } else if (docs.includes(ext)) {
        type = "document";
      }
    }

    const rawPath = file.parentReference?.path || "";
    const pathSegs = rawPath.replace(/^\/drive\/root:/, "").split("/").filter(Boolean);
    const cleanPath = "/" + pathSegs.join("/");

    return {
      id: file.id,
      name,
      type,
      size: Number(file.size) || 0,
      provider,
      accountId,
      accountEmail,
      thumbnail: type === "image" || type === "video" ? `/api/onedrive/thumbnail/${accountId}?fileId=${file.id}` : null,
      path: cleanPath,
      url: file.webUrl || null,
      webContentLink: file["@microsoft.graph.downloadUrl"] || null,
      createdAt: file.createdDateTime || file.lastModifiedDateTime || null,
      mimeType: mime || "application/octet-stream"
    };
  }

  /* ===============================
     AMAZON S3 NORMALIZATION
  =============================== */
  if (provider === "s3") {
    const name = file.Key.split("/").pop() || "Unnamed File";
    let type = "other";
    const ext = name.split(".").pop().toLowerCase();

    const images = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
    const videos = ["mp4", "mov", "avi", "mkv", "webm"];
    const docs = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf"];
    const audio = ["mp3", "wav", "ogg", "aac", "flac"];

    let mimeType = "application/octet-stream";
    if (images.includes(ext)) {
      type = "image";
      mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    } else if (videos.includes(ext)) {
      type = "video";
      mimeType = `video/${ext === 'mov' ? 'quicktime' : ext}`;
    } else if (docs.includes(ext)) {
      type = "document";
      mimeType = ext === "pdf" ? "application/pdf" : "application/octet-stream";
    } else if (audio.includes(ext)) {
      type = "audio";
      mimeType = `audio/${ext}`;
    }

    const parts = file.Key.split("/");
    parts.pop(); // remove file name
    const cleanPath = "/" + parts.join("/");

    return {
      id: file.Key,
      name,
      type,
      size: Number(file.Size) || 0,
      provider,
      accountId,
      accountEmail,
      thumbnail: null,
      path: cleanPath,
      url: `/api/s3/download/${accountId}?fileId=${encodeURIComponent(file.Key)}`,
      webContentLink: `/api/s3/download/${accountId}?fileId=${encodeURIComponent(file.Key)}`,
      createdAt: file.LastModified || null,
      mimeType
    };
  }

  /* ===============================
     BOX.COM NORMALIZATION
  =============================== */
  if (provider === "box") {
    if (file.type === "folder") {
      return null;
    }

    const name = file.name || "Unnamed File";
    let type = "other";
    const ext = file.extension || name.split(".").pop().toLowerCase();

    const images = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
    const videos = ["mp4", "mov", "avi", "mkv", "webm"];
    const docs = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf"];
    const audio = ["mp3", "wav", "ogg", "aac", "flac"];

    let mimeType = "application/octet-stream";
    if (images.includes(ext)) {
      type = "image";
      mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    } else if (videos.includes(ext)) {
      type = "video";
      mimeType = `video/${ext === 'mov' ? 'quicktime' : ext}`;
    } else if (docs.includes(ext)) {
      type = "document";
      mimeType = ext === "pdf" ? "application/pdf" : "application/octet-stream";
    } else if (audio.includes(ext)) {
      type = "audio";
      mimeType = `audio/${ext}`;
    }

    let cleanPath = "/";
    if (file.path_collection?.entries) {
      const pathSegs = file.path_collection.entries
        .filter(p => p.id !== "0")
        .map(p => p.name);
      cleanPath = "/" + pathSegs.join("/");
    }

    return {
      id: file.id,
      name,
      type,
      size: Number(file.size) || 0,
      provider,
      accountId,
      accountEmail,
      thumbnail: null,
      path: cleanPath,
      url: file.shared_link?.url || `https://app.box.com/file/${file.id}`,
      webContentLink: `/api/box/download/${accountId}?fileId=${file.id}`,
      createdAt: file.modified_at || file.created_at || null,
      mimeType
    };
  }

  return null;
};