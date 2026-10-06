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
    if (!bytes || bytes === 0) return "Direct Stream";
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

        itemsHtml += `
          <button class="pulldl-format-item" data-url="${f.url}" data-title="${title}" data-ext="${f.ext || "mp4"}" data-category="${f.ext === "mp3" ? "audio" : "video"}">
            <span>${f.ext === "mp3" ? "🎵" : "🎬"} ${f.quality || "MP4 Stream"}</span>
            <span class="pulldl-format-tag ${tagClass}">${(f.ext || "MP4").toUpperCase()}</span>
          </button>
        `;
      });

      itemsHtml += `
        <button class="pulldl-format-item" data-url="${uniqueFmts[0]?.url}" data-title="${title}" data-ext="${uniqueFmts[0]?.ext || "mp4"}" data-saveas="true">
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
          <button class="pulldl-format-item" data-url="${directUrl}" data-title="${title}" data-ext="mp4">
            <span>🎬 1080p Full HD</span>
            <span class="pulldl-format-tag tag-4k">1080P</span>
          </button>
        ` : ""}
        ${hasHd ? `
          <button class="pulldl-format-item" data-url="${directUrl}" data-title="${title}" data-ext="mp4">
            <span>🎬 720p HD Video</span>
            <span class="pulldl-format-tag tag-hd">720P</span>
          </button>
        ` : ""}
        <button class="pulldl-format-item" data-url="${directUrl}" data-title="${title}" data-ext="mp4">
          <span>🎬 Standard Video</span>
          <span class="pulldl-format-tag tag-sd">MP4</span>
        </button>
        <button class="pulldl-format-item" data-url="${directUrl}" data-title="${title}" data-ext="mp3" data-category="audio">
          <span>🎵 Extract Audio</span>
          <span class="pulldl-format-tag tag-audio">MP3</span>
        </button>
        <button class="pulldl-format-item" data-url="${directUrl}" data-title="${title}" data-ext="mp4" data-saveas="true">
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
          const saveAs = item.getAttribute("data-saveas") === "true";

          if (url && !url.startsWith("blob:")) {
            chrome.runtime.sendMessage({
              type: "TRIGGER_DOWNLOAD",
              url,
              title,
              ext,
              category,
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
            chrome.runtime.sendMessage({
              type: "TRIGGER_DOWNLOAD",
              url: best.url,
              title: resp.data.title || title,
              ext: best.ext || "mp4",
              category: "video"
            });
          }
        });
      } else {
        chrome.runtime.sendMessage({
          type: "TRIGGER_DOWNLOAD",
          url: directUrl,
          title: title,
          ext: "mp4",
          category: "video"
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

  // 6. Executive Telemetry HUD Modal
  function createOrUpdateDownloadHud(data) {
    let hud = document.getElementById("pulldl-active-hud");

    if (!hud) {
      hud = document.createElement("div");
      hud.id = "pulldl-active-hud";
      hud.className = "pulldl-hud-panel";
      document.body.appendChild(hud);
    }

    const speed = formatSpeed(data.speed);
    const progress = data.progress || 0;
    const receivedStr = formatBytes(data.receivedBytes);
    const totalStr = formatBytes(data.totalBytes);
    const etaStr = formatEta(data.eta);
    const isComplete = data.state === "complete";
    const isPaused = data.state === "paused";

    const chunkBars = Array.from({ length: 8 }).map((_, i) => {
      const chunkProg = Math.min(100, Math.max(0, (progress - (i * 12)) * (100 / 12)));
      return `
        <div class="pulldl-chunk-bar">
          <div class="pulldl-chunk-fill" style="width: ${chunkProg}%"></div>
        </div>
      `;
    }).join("");

    hud.innerHTML = `
      <div class="pulldl-hud-header">
        <div class="pulldl-hud-title-wrap">
          <div class="pulldl-hud-pulse" style="background: ${isComplete ? "#00E676" : "#38bdf8"}; box-shadow: 0 0 10px ${isComplete ? "#00E676" : "#38bdf8"};"></div>
          <div class="pulldl-hud-title" title="${data.title}">${data.title}</div>
        </div>
        <button class="pulldl-hud-close" id="pulldl-hud-close-btn" title="Dismiss">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="pulldl-telemetry-row">
        <div class="pulldl-speed-badge">
          <span class="pulldl-speed-num">${isComplete ? "100%" : isPaused ? "PAUSED" : speed.num}</span>
          <span class="pulldl-speed-unit">${isComplete ? "DONE" : isPaused ? "" : speed.unit}</span>
        </div>
        ${!isComplete && !isPaused ? `
          <div class="pulldl-waveform">
            <div class="pulldl-waveform-bar"></div>
            <div class="pulldl-waveform-bar"></div>
            <div class="pulldl-waveform-bar"></div>
            <div class="pulldl-waveform-bar"></div>
            <div class="pulldl-waveform-bar"></div>
          </div>
        ` : ""}
      </div>

      <div class="pulldl-progress-track">
        <div class="pulldl-progress-fill" style="width: ${progress}%"></div>
      </div>

      <div class="pulldl-chunks-container">
        ${chunkBars}
      </div>

      <div class="pulldl-hud-footer">
        <div>${receivedStr} / ${totalStr} • ETA: ${etaStr}</div>
        <div class="pulldl-hud-actions">
          ${isComplete ? `
            <button class="pulldl-action-btn btn-finish" id="pulldl-btn-open">Open File</button>
            <button class="pulldl-action-btn" id="pulldl-btn-folder">Folder</button>
          ` : `
            <button class="pulldl-action-btn" id="pulldl-btn-toggle-pause">
              ${isPaused ? "Resume ▶️" : "Pause ⏸️"}
            </button>
            <button class="pulldl-action-btn" id="pulldl-btn-cancel">Cancel</button>
          `}
        </div>
      </div>
    `;

    hud.querySelector("#pulldl-hud-close-btn")?.addEventListener("click", () => hud.remove());

    if (isComplete) {
      hud.querySelector("#pulldl-btn-open")?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "OPEN_DOWNLOAD", downloadId: data.downloadId });
      });
      hud.querySelector("#pulldl-btn-folder")?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "SHOW_IN_FOLDER", downloadId: data.downloadId });
      });
    } else {
      hud.querySelector("#pulldl-btn-toggle-pause")?.addEventListener("click", () => {
        if (isPaused) {
          chrome.runtime.sendMessage({ type: "RESUME_DOWNLOAD", downloadId: data.downloadId });
        } else {
          chrome.runtime.sendMessage({ type: "PAUSE_DOWNLOAD", downloadId: data.downloadId });
        }
      });
      hud.querySelector("#pulldl-btn-cancel")?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "CANCEL_DOWNLOAD", downloadId: data.downloadId });
        hud.remove();
      });
    }
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

    // Sniff DOM video/audio/sources
    document.querySelectorAll("video, audio, source").forEach((el) => {
      const src = el.src || el.getAttribute("src");
      if (src) addUrl(src, el.title || document.title, el.tagName === "AUDIO" ? "audio" : "video");
    });

    // Sniff <a> tags
    document.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      addUrl(href, a.innerText || a.getAttribute("title") || a.getAttribute("aria-label") || "");
    });

    // Sniff detected candidate streams
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
      createOrUpdateDownloadHud({
        downloadId: message.downloadId,
        title: message.title,
        speed: 0,
        progress: 1,
        receivedBytes: 0,
        totalBytes: 0,
        eta: 0,
        state: "in_progress"
      });
    } else if (message.type === "DOWNLOAD_PROGRESS") {
      createOrUpdateDownloadHud(message.data);
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
