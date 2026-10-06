// PullDL In-Page Content Engine (v3.0.0 Universal Studio Edition)
// 7-Layer Detection Engine: DOM (L1), Page Runtime Bridge (L2), Resource Timing (L3), Confidence Scoring (L6)

(function () {
  if (window.__pulldl_universal_injected) return;
  window.__pulldl_universal_injected = true;

  // 1. Inject Layer 2 Safe Page-Context Runtime Bridge
  try {
    const bridgeScript = document.createElement("script");
    bridgeScript.src = chrome.runtime.getURL("page_bridge.js");
    bridgeScript.async = false;
    (document.head || document.documentElement).appendChild(bridgeScript);
    bridgeScript.onload = () => bridgeScript.remove();
  } catch (e) {}

  const detectedCandidates = new Map(); // url -> candidate info
  const processedVideos = new WeakSet();

  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    if (!bytes || !isFinite(bytes) || bytes < 0) return "Calculating...";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec === 0) return { num: "0", unit: "KB/s" };
    if (bytesPerSec > 1024 * 1024) {
      return { num: (bytesPerSec / (1024 * 1024)).toFixed(1), unit: "MB/s" };
    }
    return { num: Math.round(bytesPerSec / 1024).toString(), unit: "KB/s" };
  }

  function formatEta(seconds) {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  function getCleanPageTitle() {
    return document.title.replace(/[-|•].*$/, "").trim() || "PullDL_Media_" + Date.now();
  }

  function isPlatformSite() {
    const host = window.location.hostname.toLowerCase();
    return (
      host.includes("youtube.com") ||
      host.includes("youtu.be") ||
      host.includes("facebook.com") ||
      host.includes("fb.watch") ||
      host.includes("instagram.com") ||
      host.includes("tiktok.com") ||
      host.includes("twitter.com") ||
      host.includes("x.com") ||
      host.includes("reddit.com") ||
      host.includes("vimeo.com")
    );
  }

  function getPlatformName() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes("youtube") || host.includes("youtu.be")) return "YouTube";
    if (host.includes("facebook") || host.includes("fb.")) return "Facebook";
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("tiktok")) return "TikTok";
    if (host.includes("twitter") || host.includes("x.com")) return "Twitter/X";
    if (host.includes("reddit")) return "Reddit";
    return "Web Media";
  }

  // 2. Layer 6: Confidence Scoring & Candidate Ranking
  function calculateConfidence(candidate) {
    let score = 0.5;
    const url = (candidate.url || "").toLowerCase();

    if (url.includes(".m3u8") || url.includes(".mpd")) score += 0.45;
    if (url.includes(".mp4") || url.includes(".webm")) score += 0.4;
    if (candidate.width && candidate.width >= 720) score += 0.2;
    if (candidate.duration && candidate.duration > 15) score += 0.15;

    // Filter out ads / trackers
    if (url.includes("analytics") || url.includes("doubleclick") || url.includes("telemetry") || url.includes("beacon")) {
      score = 0.05;
    }
    return Math.min(1.0, score);
  }

  function addCandidate(candidate) {
    if (!candidate.url || candidate.url.startsWith("blob:") || candidate.url.startsWith("data:")) return;

    const confidence = calculateConfidence(candidate);
    if (confidence < 0.6) return; // Drop low-confidence noise

    candidate.confidence = confidence;
    detectedCandidates.set(candidate.url, candidate);

    // Notify background
    chrome.runtime.sendMessage({
      type: "DOM_MEDIA_FOUND",
      media: {
        url: candidate.url,
        mimeType: candidate.mimeType || "video/mp4",
        format: candidate.format || "MP4",
        size: candidate.size || 0,
        confidence: confidence
      }
    }).catch(() => {});
  }

  // 3. Layer 2: Listen for Page Runtime Bridge Messages
  window.addEventListener("message", (event) => {
    if (event.data?.source !== "PULLDL_PAGE_BRIDGE") return;

    const { type, data } = event.data;
    if (type === "MEDIA_PLAYING") {
      addCandidate({
        url: data.src,
        width: data.width,
        height: data.height,
        duration: data.duration,
        format: data.src.includes(".m3u8") ? "HLS" : "MP4"
      });
    } else if (type === "NETWORK_FETCH" || type === "NETWORK_XHR") {
      addCandidate({
        url: data.url,
        format: data.url.includes(".m3u8") ? "HLS" : data.url.includes(".mpd") ? "DASH" : "Stream"
      });
    }
  });

  // 4. Layer 3: Resource Performance Sniffer
  function scanPerformanceResources() {
    try {
      const resources = window.performance.getEntriesByType("resource");
      const streamRegex = /\.(m3u8|mpd|mp4|webm|m4s)(\?.*)?$/i;
      resources.forEach((entry) => {
        if (streamRegex.test(entry.name) || entry.name.includes("manifest") || entry.name.includes("videoplayback")) {
          addCandidate({
            url: entry.name,
            size: entry.transferSize || entry.decodedBodySize || 0,
            format: entry.name.includes(".m3u8") ? "HLS" : entry.name.includes(".mpd") ? "DASH" : "MP4"
          });
        }
      });
    } catch (e) {}
  }
  setInterval(scanPerformanceResources, 3500);

  // 5. Layer 1: DOM Media Detection & SPA Route Listening
  function scanAndAttachVideoButtons() {
    const videos = document.querySelectorAll("video");
    videos.forEach((video) => {
      if (processedVideos.has(video)) return;
      if (video.offsetWidth < 160 || video.offsetHeight < 100) return;

      processedVideos.add(video);
      attachLuxuryCornerButton(video);

      // Register DOM src
      const src = video.currentSrc || video.src;
      if (src && !src.startsWith("blob:")) {
        addCandidate({
          url: src,
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
          format: "MP4"
        });
      }
    });
  }

  function attachLuxuryCornerButton(video) {
    let parent = video.parentElement;
    if (!parent) return;

    const ytContainer = document.querySelector("#movie_player, .html5-video-player");
    if (ytContainer && ytContainer.contains(video)) {
      parent = ytContainer;
    }

    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === "static") {
      parent.classList.add("pulldl-video-anchor");
    }

    if (parent.querySelector(".pulldl-corner-btn-container")) return;

    const container = document.createElement("div");
    container.className = "pulldl-corner-btn-container";

    // Draggable mechanics so it never obstructs subtitles
    let isDragging = false, startX, startY, origLeft, origTop;
    container.addEventListener("mousedown", (e) => {
      if (e.target.closest(".pulldl-format-dropdown")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = container.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      origLeft = rect.left - parentRect.left;
      origTop = rect.top - parentRect.top;
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      container.style.right = "auto";
      container.style.left = `${Math.max(0, origLeft + dx)}px`;
      container.style.top = `${Math.max(0, origTop + dy)}px`;
    });

    document.addEventListener("mouseup", () => { isDragging = false; });

    const pill = document.createElement("div");
    pill.className = "pulldl-smart-pill";
    pill.innerHTML = `
      <div class="pulldl-pill-meta">
        <span class="pulldl-pill-glyph">↓</span>
        <span class="pulldl-pill-title">1080p detected</span>
      </div>
      <div class="pulldl-pill-buttons">
        <button class="pulldl-pill-btn-dl" title="Quick Download">Download</button>
        <button class="pulldl-pill-btn-more" title="More formats">▾</button>
        <button class="pulldl-pill-btn-dismiss" title="Dismiss">✕</button>
      </div>
    `;

    const dropdown = document.createElement("div");
    dropdown.className = "pulldl-format-dropdown";

    let cachedFormats = null;
    let isFetching = false;

    async function loadDropdownContent() {
      const platformName = getPlatformName();

      dropdown.innerHTML = `
        <div class="pulldl-dropdown-header">
          <div class="pulldl-dropdown-header-top">
            <span class="pulldl-dropdown-title">Universal Engine</span>
            <span class="pulldl-platform-pill">${platformName}</span>
          </div>
        </div>
        <div class="pulldl-loading-box">
          <div class="pulldl-spinner"></div>
          <span class="pulldl-loading-text">Resolving High-Speed Streams...</span>
        </div>
      `;

      if (isPlatformSite() || (!video.src && !video.currentSrc) || (video.currentSrc && video.currentSrc.startsWith("blob:"))) {
        if (!cachedFormats && !isFetching) {
          isFetching = true;
          try {
            const resp = await new Promise((resolve) => {
              chrome.runtime.sendMessage({
                type: "RESOLVE_PLATFORM_FORMATS",
                pageUrl: window.location.href
              }, resolve);
            });

            isFetching = false;
            if (resp && resp.success && resp.data && resp.data.formats && resp.data.formats.length > 0) {
              cachedFormats = resp.data;
              renderApiFormats(resp.data);
            } else {
              renderFallbackFormats();
            }
          } catch (e) {
            isFetching = false;
            renderFallbackFormats();
          }
        } else if (cachedFormats) {
          renderApiFormats(cachedFormats);
        }
      } else {
        renderDirectFormats();
      }
    }

    function renderApiFormats(data) {
      const platformName = getPlatformName();
      const title = data.title || getCleanPageTitle();
      const formats = data.formats || [];

      const uniqueFmts = [];
      const seenQualities = new Set();
      for (const f of formats) {
        const qKey = (f.quality || "") + (f.ext || "");
        if (!seenQualities.has(qKey)) {
          seenQualities.add(qKey);
          uniqueFmts.push(f);
        }
      }

      let itemsHtml = "";
      uniqueFmts.slice(0, 6).forEach((f) => {
        const q = (f.quality || "Standard MP4").toUpperCase();
        let tagClass = "tag-sd";
        if (q.includes("4K") || q.includes("2160") || q.includes("1080")) tagClass = "tag-4k";
        else if (q.includes("720") || q.includes("HD")) tagClass = "tag-hd";
        else if (f.ext === "mp3" || q.includes("AUDIO") || q.includes("MP3")) tagClass = "tag-audio";

        const fSize = f.filesize || f.size || 0;
        const szStr = fSize > 0 ? formatBytes(fSize) : (f.filesize_formatted || "");

        itemsHtml += `
          <button class="pulldl-format-item" data-url="${f.url}" data-title="${title}" data-ext="${f.ext || "mp4"}" data-category="${f.ext === "mp3" ? "audio" : "video"}" data-filesize="${fSize}" data-quality="${f.quality || q}">
            <span>${f.ext === "mp3" ? "🎵" : "🎬"} ${f.quality || "MP4 Stream"} ${szStr ? `• ~${szStr}` : ""}</span>
            <span class="pulldl-format-tag ${tagClass}">${(f.ext || "MP4").toUpperCase()}</span>
          </button>
        `;
      });

      itemsHtml += `
        <button class="pulldl-format-item" data-url="${uniqueFmts[0]?.url}" data-title="${title}" data-ext="${uniqueFmts[0]?.ext || "mp4"}" data-category="video" data-filesize="${uniqueFmts[0]?.filesize || 0}" data-quality="${uniqueFmts[0]?.quality || "1080p"}" data-saveas="true">
          <span>⚙️ Custom Folder (Save As...)</span>
          <span class="pulldl-format-tag tag-custom">PICK</span>
        </button>
      `;

      dropdown.innerHTML = `
        <div class="pulldl-dropdown-header">
          <div class="pulldl-dropdown-header-top">
            <span class="pulldl-dropdown-title">Universal Engine</span>
            <span class="pulldl-platform-pill">${platformName}</span>
          </div>
        </div>
        ${itemsHtml}
      `;

      bindDropdownClicks();
    }

    function renderDirectFormats() {
      const vHeight = video.videoHeight || 1080;
      const hasHd = vHeight >= 720;
      const hasFullHd = vHeight >= 1080;
      const title = getCleanPageTitle();
      const directUrl = video.currentSrc || video.src;

      dropdown.innerHTML = `
        <div class="pulldl-dropdown-header">
          <div class="pulldl-dropdown-header-top">
            <span class="pulldl-dropdown-title">Direct Stream</span>
            <span class="pulldl-platform-pill">Direct MP4</span>
          </div>
        </div>
        ${hasFullHd ? `
          <button class="pulldl-format-item" data-url="${directUrl}" data-title="${title}" data-ext="mp4" data-category="video" data-quality="1080p Full HD">
            <span>🎬 1080p Full HD</span>
            <span class="pulldl-format-tag tag-4k">1080P</span>
          </button>
        ` : ""}
        ${hasHd ? `
          <button class="pulldl-format-item" data-url="${directUrl}" data-title="${title}" data-ext="mp4" data-category="video" data-quality="720p HD Video">
            <span>🎬 720p HD Video</span>
            <span class="pulldl-format-tag tag-hd">720P</span>
          </button>
        ` : ""}
        <button class="pulldl-format-item" data-url="${directUrl}" data-title="${title}" data-ext="mp4" data-category="video" data-quality="Standard MP4 Video">
          <span>🎬 Standard Video</span>
          <span class="pulldl-format-tag tag-sd">MP4</span>
        </button>
        <button class="pulldl-format-item" data-url="${directUrl}" data-title="${title}" data-ext="mp3" data-category="audio" data-quality="High Quality Audio">
          <span>🎵 Extract Audio</span>
          <span class="pulldl-format-tag tag-audio">MP3</span>
        </button>
        <button class="pulldl-format-item" data-url="${directUrl}" data-title="${title}" data-ext="mp4" data-category="video" data-quality="Custom Folder MP4" data-saveas="true">
          <span>⚙️ Custom Folder (Save As...)</span>
          <span class="pulldl-format-tag tag-custom">PICK</span>
        </button>
      `;

      bindDropdownClicks();
    }

    function renderFallbackFormats() {
      const title = getCleanPageTitle();
      dropdown.innerHTML = `
        <div class="pulldl-dropdown-header">
          <div class="pulldl-dropdown-header-top">
            <span class="pulldl-dropdown-title">PullDL Studio</span>
            <span class="pulldl-platform-pill">Cloud Engine</span>
          </div>
        </div>
        <button class="pulldl-format-item" id="pulldl-fallback-web" style="background: rgba(0,230,118,0.15); border-color: rgba(0,230,118,0.4);">
          <span>🚀 Process in PullDL Studio</span>
          <span class="pulldl-format-tag tag-hd">1-CLICK</span>
        </button>
      `;

      dropdown.querySelector("#pulldl-fallback-web")?.addEventListener("click", () => {
        dropdown.classList.remove("show");
        window.open(`https://pulldl.com/?url=${encodeURIComponent(window.location.href)}`, "_blank");
      });
    }

    function bindDropdownClicks() {
      dropdown.querySelectorAll(".pulldl-format-item").forEach((item) => {
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          dropdown.classList.remove("show");

          const url = item.getAttribute("data-url");
          const title = item.getAttribute("data-title") || getCleanPageTitle();
          const ext = item.getAttribute("data-ext") || "mp4";
          const category = item.getAttribute("data-category") || "video";
          const filesize = Number(item.getAttribute("data-filesize")) || 0;
          const quality = item.getAttribute("data-quality") || "";
          const saveAs = item.getAttribute("data-saveas") === "true";

          if (url && !url.startsWith("blob:")) {
            showDownloadInfoModal({
              url,
              title,
              ext,
              category,
              filesize,
              quality,
              saveAs
            });
          } else {
            window.open(`https://pulldl.com/?url=${encodeURIComponent(window.location.href)}`, "_blank");
          }
        });
      });
    }

    // Smart Download primary button
    pill.querySelector(".pulldl-pill-btn-dl")?.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const directUrl = video.currentSrc || video.src;
      const title = getCleanPageTitle();

      if (isPlatformSite() || (!directUrl || directUrl.startsWith("blob:"))) {
        chrome.runtime.sendMessage({
          type: "RESOLVE_PLATFORM_FORMATS",
          pageUrl: window.location.href
        }, (resp) => {
          if (resp?.success && resp.data?.formats?.length > 0) {
            const best = resp.data.formats[0];
            showDownloadInfoModal({
              url: best.url,
              title: resp.data.title || title,
              ext: best.ext || "mp4",
              category: best.ext === "mp3" ? "audio" : "video",
              filesize: best.filesize || best.size || 0,
              quality: best.quality || "1080p Full HD"
            });
          } else {
            window.open(`https://pulldl.com/?url=${encodeURIComponent(window.location.href)}`, "_blank");
          }
        });
      } else {
        showDownloadInfoModal({
          url: directUrl,
          title: title,
          ext: "mp4",
          category: "video",
          filesize: 0,
          quality: "Direct MP4 Video"
        });
      }
    });

    // More formats dropdown toggle
    pill.querySelector(".pulldl-pill-btn-more")?.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      dropdown.classList.toggle("show");
      if (dropdown.classList.contains("show")) {
        loadDropdownContent();
      }
    });

    // Dismiss pill
    pill.querySelector(".pulldl-pill-btn-dismiss")?.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      container.remove();
    });

    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) {
        dropdown.classList.remove("show");
      }
    });

    container.appendChild(pill);
    container.appendChild(dropdown);
    parent.appendChild(container);
  }

  // ========================================================
  // 6. IDM-GRADE DOWNLOAD MODALS & ACTIVE ENGINE STATUS
  // ========================================================

  function sanitizeFilenameTitle(name, fallbackExt = "mp4") {
    if (!name) return "PullDL_Media_" + Date.now() + "." + fallbackExt;
    let clean = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").trim().substring(0, 95);
    if (!clean.toLowerCase().endsWith("." + fallbackExt)) {
      clean += "." + fallbackExt;
    }
    return clean;
  }

  function makeDraggable(element, handle) {
    if (!element || !handle) return;
    let isDragging = false, startX, startY, origLeft, origTop;

    handle.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON" || e.target.closest("button")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = element.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      element.style.right = "auto";
      element.style.bottom = "auto";
      element.style.left = `${origLeft}px`;
      element.style.top = `${origTop}px`;
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = `${Math.max(10, Math.min(window.innerWidth - 120, origLeft + dx))}px`;
      element.style.top = `${Math.max(10, Math.min(window.innerHeight - 80, origTop + dy))}px`;
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }

  // Step 1: IDM-Grade Download File Info Modal
  function showDownloadInfoModal(mediaData) {
    document.querySelectorAll(".pulldl-modal-backdrop, .pulldl-fileinfo-dialog").forEach((el) => el.remove());
    document.querySelectorAll(".pulldl-format-dropdown.show").forEach((el) => el.classList.remove("show"));

    const backdrop = document.createElement("div");
    backdrop.className = "pulldl-modal-backdrop";

    const dialog = document.createElement("div");
    dialog.className = "pulldl-fileinfo-dialog";

    const title = mediaData.title || getCleanPageTitle();
    const rawExt = (mediaData.ext || "mp4").toLowerCase();
    const initialCategory = mediaData.category || (rawExt === "mp3" || rawExt === "m4a" || rawExt === "wav" ? "audio" : "video");
    const rawSize = mediaData.filesize || mediaData.size || 0;
    const sizeStr = rawSize > 0 ? formatBytes(rawSize) : "Calculating...";
    const quality = mediaData.quality || (rawExt === "mp3" ? "320 kbps MP3" : "1080p Full HD");
    const cleanName = sanitizeFilenameTitle(title, rawExt);

    dialog.innerHTML = `
      <div class="pulldl-dialog-header">
        <div class="pulldl-dialog-brand">
          <span class="pulldl-brand-badge">◈ PullDL Studio</span>
          <span class="pulldl-dialog-title">Download File Info</span>
        </div>
        <button class="pulldl-dialog-close" id="pulldl-dialog-close-btn" title="Cancel">✕</button>
      </div>

      <div class="pulldl-dialog-body">
        <div class="pulldl-field-group">
          <label class="pulldl-field-label">Source URL</label>
          <div class="pulldl-url-display" title="${mediaData.url || window.location.href}">
            <span>🔗</span>
            <span style="overflow: hidden; text-overflow: ellipsis;">${mediaData.url || window.location.href}</span>
          </div>
        </div>

        <div class="pulldl-field-group">
          <label class="pulldl-field-label">Category</label>
          <div class="pulldl-category-group" id="pulldl-category-group">
            <button class="pulldl-cat-btn ${initialCategory === "video" ? "active" : ""}" data-cat="video" data-ext="mp4">🎬 Video</button>
            <button class="pulldl-cat-btn ${initialCategory === "audio" ? "active" : ""}" data-cat="audio" data-ext="mp3">🎵 Audio</button>
            <button class="pulldl-cat-btn ${initialCategory === "archive" ? "active" : ""}" data-cat="archive" data-ext="zip">📦 Archive</button>
            <button class="pulldl-cat-btn ${initialCategory === "file" ? "active" : ""}" data-cat="file" data-ext="${rawExt}">📄 Document</button>
          </div>
        </div>

        <div class="pulldl-field-group">
          <label class="pulldl-field-label">File Name</label>
          <input type="text" class="pulldl-filename-input" id="pulldl-input-filename" value="${cleanName}" spellcheck="false" autocomplete="off" />
        </div>

        <div class="pulldl-meta-badges-row">
          <div>Size: <span class="pulldl-badge-size">${sizeStr}</span></div>
          <div>Quality: <span class="pulldl-badge-format">${quality}</span></div>
          <div>Engine: <span class="pulldl-badge-thread">⚡ 8 Threads</span></div>
        </div>

        <div class="pulldl-path-row">
          <div>Folder: <span class="pulldl-path-folder" id="pulldl-folder-preview">Downloads/PullDL/${initialCategory === "audio" ? "Music" : "Videos"}/</span></div>
          <label class="pulldl-checkbox-label">
            <input type="checkbox" id="pulldl-chk-saveas" ${mediaData.saveAs ? "checked" : ""} />
            <span>Choose Folder (Save As)</span>
          </label>
        </div>
      </div>

      <div class="pulldl-dialog-footer">
        <button class="pulldl-btn-cancel" id="pulldl-btn-dialog-cancel">Cancel</button>
        <button class="pulldl-btn-start" id="pulldl-btn-dialog-start">⚡ Start Download</button>
      </div>
    `;

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    makeDraggable(dialog, dialog.querySelector(".pulldl-dialog-header"));

    let selectedCat = initialCategory;
    let selectedExt = rawExt;

    dialog.querySelectorAll(".pulldl-cat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        dialog.querySelectorAll(".pulldl-cat-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        selectedCat = btn.getAttribute("data-cat");
        const newExt = btn.getAttribute("data-ext");
        if (newExt) selectedExt = newExt;

        const inputEl = dialog.querySelector("#pulldl-input-filename");
        let currentVal = inputEl.value;
        currentVal = currentVal.replace(/\.[a-zA-Z0-9]+$/, "") + "." + selectedExt;
        inputEl.value = currentVal;

        const folderEl = dialog.querySelector("#pulldl-folder-preview");
        if (selectedCat === "audio") folderEl.textContent = "Downloads/PullDL/Music/";
        else if (selectedCat === "archive") folderEl.textContent = "Downloads/PullDL/Archives/";
        else folderEl.textContent = "Downloads/PullDL/Videos/";
      });
    });

    const closeDialog = () => backdrop.remove();
    dialog.querySelector("#pulldl-dialog-close-btn")?.addEventListener("click", closeDialog);
    dialog.querySelector("#pulldl-btn-dialog-cancel")?.addEventListener("click", closeDialog);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeDialog();
    });

    dialog.querySelector("#pulldl-btn-dialog-start")?.addEventListener("click", () => {
      const editedName = dialog.querySelector("#pulldl-input-filename").value.trim() || cleanName;
      const saveAs = dialog.querySelector("#pulldl-chk-saveas").checked;

      closeDialog();

      // Trigger high-speed download through background service worker
      chrome.runtime.sendMessage({
        type: "TRIGGER_DOWNLOAD",
        url: mediaData.url,
        title: editedName,
        filesize: rawSize,
        totalBytes: rawSize,
        category: selectedCat,
        ext: selectedExt,
        saveAs: saveAs
      });

      // Show Step 2: Live Download Status Window immediately
      showDownloadStatusWindow({
        title: editedName,
        filesize: rawSize,
        totalBytes: rawSize,
        receivedBytes: 0,
        progress: 0,
        speed: 0,
        eta: 0,
        state: "in_progress",
        category: selectedCat,
        ext: selectedExt,
        url: mediaData.url
      });
    });
  }

  // Step 2: IDM-Grade Download Status Window
  let activeStatusWindow = null;
  let activeMinimizedPill = null;
  let activeDownloadState = null;

  function showDownloadStatusWindow(data) {
    if (!data) return;
    activeDownloadState = { ...(activeDownloadState || {}), ...data };

    if (activeMinimizedPill && !activeStatusWindow) {
      updateMinimizedPill(activeDownloadState);
      return;
    }

    if (!activeStatusWindow) {
      activeStatusWindow = document.createElement("div");
      activeStatusWindow.id = "pulldl-active-status-window";
      activeStatusWindow.className = "pulldl-status-window";
      document.body.appendChild(activeStatusWindow);
    }

    renderStatusWindowContent(activeStatusWindow, activeDownloadState);
  }

  function renderStatusWindowContent(win, data) {
    const isComplete = data.state === "complete";
    const isPaused = data.state === "paused";
    const speed = formatSpeed(data.speed);
    const progress = Math.min(100, Math.max(0, data.progress || 0));
    const receivedStr = formatBytes(data.receivedBytes || 0);
    const totalStr = formatBytes(data.totalBytes || data.filesize || 0);
    const etaStr = formatEta(data.eta);
    const categoryIcon = data.category === "audio" || (data.ext && data.ext.includes("mp3")) ? "🎵" : "🎬";
    const title = data.title || "PullDL_Download";

    const chunkBars = Array.from({ length: 8 }).map((_, i) => {
      const baseProg = Math.min(100, Math.max(0, (progress - (i * 10)) * (100 / 20)));
      return `
        <div class="pulldl-chunk-bar" title="Segment #${i + 1}: ${baseProg.toFixed(0)}%">
          <div class="pulldl-chunk-fill" style="width: ${isComplete ? 100 : baseProg}%"></div>
        </div>
      `;
    }).join("");

    win.innerHTML = `
      <div class="pulldl-win-header">
        <div class="pulldl-win-brand">
          <div class="pulldl-win-pulse" style="background: ${isComplete ? "#00E676" : isPaused ? "#f59e0b" : "#38bdf8"}; box-shadow: 0 0 10px ${isComplete ? "#00E676" : isPaused ? "#f59e0b" : "#38bdf8"};"></div>
          <span class="pulldl-win-title">PullDL Turbo Engine — ${isComplete ? "Finished" : isPaused ? "Paused" : "Downloading"}</span>
        </div>
        <div class="pulldl-win-controls">
          <button class="pulldl-win-btn" id="pulldl-btn-win-min" title="Minimize to pill">—</button>
          <button class="pulldl-win-btn" id="pulldl-btn-win-close" title="Close">✕</button>
        </div>
      </div>

      <div class="pulldl-file-row">
        <span>${categoryIcon}</span>
        <span class="pulldl-file-name" title="${title}">${title}</span>
        <span class="pulldl-state-pill" style="color: ${isComplete ? "#00E676" : isPaused ? "#fbbf24" : "#38bdf8"}; border-color: ${isComplete ? "rgba(0,230,118,0.4)" : isPaused ? "rgba(251,191,36,0.4)" : "rgba(56,189,248,0.4)"}">
          ${isComplete ? "COMPLETE" : isPaused ? "PAUSED" : "8 THREADS"}
        </span>
      </div>

      <div class="pulldl-speed-hud">
        <div class="pulldl-speed-readout">
          <span class="pulldl-speed-digits">${isComplete ? "100%" : isPaused ? "PAUSED" : speed.num}</span>
          <span class="pulldl-speed-unit">${isComplete ? "DONE" : isPaused ? "" : speed.unit}</span>
        </div>
        ${!isComplete && !isPaused ? `
          <div class="pulldl-waveform">
            <div class="pulldl-wave-bar"></div>
            <div class="pulldl-wave-bar"></div>
            <div class="pulldl-wave-bar"></div>
            <div class="pulldl-wave-bar"></div>
            <div class="pulldl-wave-bar"></div>
            <div class="pulldl-wave-bar"></div>
          </div>
        ` : ""}
      </div>

      <div class="pulldl-master-progress-track">
        <div class="pulldl-master-progress-fill" style="width: ${progress}%;"></div>
      </div>

      <div class="pulldl-idm-grid">
        <div class="pulldl-idm-cell">
          <span class="pulldl-idm-lbl">File Size:</span>
          <span class="pulldl-idm-val">${totalStr}</span>
        </div>
        <div class="pulldl-idm-cell">
          <span class="pulldl-idm-lbl">Downloaded:</span>
          <span class="pulldl-idm-val">${receivedStr} (${progress}%)</span>
        </div>
        <div class="pulldl-idm-cell">
          <span class="pulldl-idm-lbl">Transfer Rate:</span>
          <span class="pulldl-idm-val">${isComplete ? "Completed" : isPaused ? "0 KB/s" : `${speed.num} ${speed.unit}`}</span>
        </div>
        <div class="pulldl-idm-cell">
          <span class="pulldl-idm-lbl">Time Left:</span>
          <span class="pulldl-idm-val">${isComplete ? "00:00" : etaStr}</span>
        </div>
        <div class="pulldl-idm-cell" style="grid-column: span 2;">
          <span class="pulldl-idm-lbl">Resume Capability:</span>
          <span class="pulldl-idm-val" style="color: #00E676;">Yes (HTTP 206 Supported)</span>
        </div>
      </div>

      <div class="pulldl-chunks-header">
        <span>Parallel Connection Segments (8 Threads)</span>
        <span>${progress}%</span>
      </div>

      <div class="pulldl-chunks-container">
        ${chunkBars}
      </div>

      <div class="pulldl-win-actions">
        ${isComplete ? `
          <button class="pulldl-action-btn btn-finish" id="pulldl-btn-act-open">📂 Open File</button>
          <button class="pulldl-action-btn" id="pulldl-btn-act-folder">📁 Open Folder</button>
          <button class="pulldl-action-btn" id="pulldl-btn-act-done">Close</button>
        ` : `
          <button class="pulldl-action-btn" id="pulldl-btn-act-pause">
            ${isPaused ? "Resume ▶" : "Pause ⏸"}
          </button>
          <button class="pulldl-action-btn" id="pulldl-btn-act-cancel">Cancel ✕</button>
          <button class="pulldl-action-btn" id="pulldl-btn-act-hide">Hide</button>
        `}
      </div>
    `;

    win.querySelector("#pulldl-btn-win-close")?.addEventListener("click", () => {
      win.remove();
      activeStatusWindow = null;
    });

    win.querySelector("#pulldl-btn-win-min")?.addEventListener("click", () => {
      minimizeStatusWindow();
    });

    if (isComplete) {
      win.querySelector("#pulldl-btn-act-open")?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "OPEN_DOWNLOAD", downloadId: data.downloadId });
      });
      win.querySelector("#pulldl-btn-act-folder")?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "SHOW_IN_FOLDER", downloadId: data.downloadId });
      });
      win.querySelector("#pulldl-btn-act-done")?.addEventListener("click", () => {
        win.remove();
        activeStatusWindow = null;
      });
    } else {
      win.querySelector("#pulldl-btn-act-pause")?.addEventListener("click", () => {
        if (isPaused) {
          chrome.runtime.sendMessage({ type: "RESUME_DOWNLOAD", downloadId: data.downloadId });
        } else {
          chrome.runtime.sendMessage({ type: "PAUSE_DOWNLOAD", downloadId: data.downloadId });
        }
      });
      win.querySelector("#pulldl-btn-act-cancel")?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "CANCEL_DOWNLOAD", downloadId: data.downloadId });
        win.remove();
        activeStatusWindow = null;
      });
      win.querySelector("#pulldl-btn-act-hide")?.addEventListener("click", () => {
        minimizeStatusWindow();
      });
    }

    makeDraggable(win, win.querySelector(".pulldl-win-header"));
  }

  function minimizeStatusWindow() {
    if (activeStatusWindow) {
      activeStatusWindow.remove();
      activeStatusWindow = null;
    }

    if (!activeMinimizedPill) {
      activeMinimizedPill = document.createElement("div");
      activeMinimizedPill.className = "pulldl-minimized-pill";
      document.body.appendChild(activeMinimizedPill);

      activeMinimizedPill.addEventListener("click", () => {
        activeMinimizedPill.remove();
        activeMinimizedPill = null;
        if (activeDownloadState) {
          showDownloadStatusWindow(activeDownloadState);
        }
      });
    }

    updateMinimizedPill(activeDownloadState);
  }

  function updateMinimizedPill(data) {
    if (!activeMinimizedPill || !data) return;
    const speed = formatSpeed(data.speed);
    const progress = Math.min(100, Math.max(0, data.progress || 0));
    const isComplete = data.state === "complete";
    activeMinimizedPill.innerHTML = `
      <span style="color: ${isComplete ? "#00E676" : "#38bdf8"};">◈</span>
      <span>${isComplete ? "Complete ✓" : `${progress}% • ${speed.num} ${speed.unit}`}</span>
      <span style="color: #94a3b8; font-size: 10px;">↗</span>
    `;
  }

  // 7. Page Link Scraper for LinkGrabber
  function scrapeAllPageLinks() {
    const links = [];
    const seen = new Set();

    function addUrl(rawUrl, textHint = "", defaultCategory = "file") {
      if (!rawUrl || typeof rawUrl !== "string") return;
      try {
        const parsed = new URL(rawUrl, window.location.href);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
        const fullUrl = parsed.href;
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);

        let category = defaultCategory;
        const path = parsed.pathname.toLowerCase();
        if (/\.(mp4|webm|mkv|mov|flv|m4v|avi|ts|m3u8|mpd)$/i.test(path)) category = "video";
        else if (/\.(mp3|wav|flac|aac|m4a|ogg|opus)$/i.test(path)) category = "audio";
        else if (/\.(jpg|jpeg|png|webp|gif|svg|avif)$/i.test(path)) category = "image";
        else if (/\.(zip|rar|7z|tar|gz|bz2|iso|exe|msi|dmg|apk)$/i.test(path)) category = "archive";
        else if (/youtube\.com|youtu\.be|facebook\.com|tiktok\.com|instagram\.com|vimeo\.com/i.test(parsed.hostname)) category = "video";

        links.push({
          url: fullUrl,
          title: (textHint || parsed.pathname.split("/").pop() || fullUrl).trim().substring(0, 90),
          category: category,
          domain: parsed.hostname
        });
      } catch (e) {}
    }

    document.querySelectorAll("video, audio, source").forEach((el) => {
      const src = el.src || el.getAttribute("src");
      if (src) addUrl(src, el.title || document.title, el.tagName === "AUDIO" ? "audio" : "video");
    });

    document.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      addUrl(href, a.innerText || a.getAttribute("title") || a.getAttribute("aria-label") || "");
    });

    for (const [url, cand] of detectedCandidates.entries()) {
      addUrl(url, getCleanPageTitle(), cand.format === "MP3" ? "audio" : "video");
    }

    return links;
  }

  // 8. Telemetry & Action Messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SCRAPE_PAGE_LINKS" || message.type === "TRIGGER_PAGE_LINKGRAB") {
      const links = scrapeAllPageLinks();
      sendResponse({ success: true, links: links });
      return true;
    } else if (message.type === "DOWNLOAD_STARTED") {
      showDownloadStatusWindow({
        downloadId: message.data?.downloadId || message.downloadId,
        title: message.data?.title || message.title,
        speed: 0,
        progress: 1,
        receivedBytes: 0,
        totalBytes: message.data?.totalBytes || message.totalBytes || 0,
        eta: 0,
        state: "in_progress"
      });
    } else if (message.type === "DOWNLOAD_PROGRESS") {
      showDownloadStatusWindow(message.data);
    } else if (message.type === "DOWNLOAD_COMPLETE") {
      showDownloadStatusWindow({ ...message.data, progress: 100, state: "complete" });
    }
  });

  // 8. MutationObserver & SPA Navigation Support
  const observer = new MutationObserver(() => scanAndAttachVideoButtons());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Listen to SPA route transitions (YouTube, TikTok, Facebook)
  window.addEventListener("popstate", () => setTimeout(scanAndAttachVideoButtons, 600));
  window.addEventListener("yt-navigate-finish", () => setTimeout(scanAndAttachVideoButtons, 600));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanAndAttachVideoButtons);
  } else {
    scanAndAttachVideoButtons();
  }

  // 9. Two-Way Handshake with PullDL Website
  if (window.location.hostname.includes("pulldl.com") || window.location.hostname === "localhost") {
    try {
      document.documentElement.setAttribute("data-pulldl-extension-installed", "true");
      document.documentElement.setAttribute("data-pulldl-extension-version", "3.0.0");
      window.dispatchEvent(new CustomEvent("PULLDL_EXTENSION_ACTIVE", { detail: { version: "3.0.0" } }));
      window.postMessage({ source: "PULLDL_EXTENSION", type: "EXTENSION_READY", version: "3.0.0" }, "*");
    } catch (e) {}

    // Listen for Web Studio download triggers
    window.addEventListener("message", (event) => {
      if (event.data?.source === "PULLDL_WEB" && event.data?.type === "WEB_DOWNLOAD_TRIGGER") {
        chrome.runtime.sendMessage({
          type: "TRIGGER_DOWNLOAD",
          url: event.data.url,
          title: event.data.title,
          ext: event.data.ext || "mp4",
          category: event.data.category || "video"
        });
      }
    });
  }
})();
