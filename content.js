// PullDL In-Page Content Engine (v2.1 Turbo Edition)
// Features: Platform Resolver (YouTube, Facebook, TikTok, Insta), Luxury Glassmorphic Pill, IDM HUD

(function () {
  if (window.__pulldl_engine_v2_injected) return;
  window.__pulldl_engine_v2_injected = true;

  const processedVideos = new WeakSet();

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "Unknown";
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

  // 1. Scan and Attach Luxury Corner Button
  function scanAndAttachVideoButtons() {
    const videos = document.querySelectorAll("video");
    videos.forEach((video) => {
      if (processedVideos.has(video)) return;
      if (video.offsetWidth < 160 || video.offsetHeight < 100) return;

      processedVideos.add(video);
      attachLuxuryCornerButton(video);
    });
  }

  function attachLuxuryCornerButton(video) {
    let parent = video.parentElement;
    if (!parent) return;

    // For YouTube player specifically: attach to movie_player or html5-video-player
    const ytContainer = document.querySelector("#movie_player, .html5-video-player");
    if (ytContainer && ytContainer.contains(video)) {
      parent = ytContainer;
    }

    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === "static") {
      parent.classList.add("pulldl-video-anchor");
    }

    // Avoid duplicate containers
    if (parent.querySelector(".pulldl-corner-btn-container")) return;

    const container = document.createElement("div");
    container.className = "pulldl-corner-btn-container";

    const btn = document.createElement("button");
    btn.className = "pulldl-corner-btn";
    btn.innerHTML = `
      <span class="pulldl-radar-dot"></span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>PullDL</span>
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
            <span class="pulldl-dropdown-title">Stream Engine</span>
            <span class="pulldl-platform-pill">${platformName}</span>
          </div>
        </div>
        <div class="pulldl-loading-box">
          <div class="pulldl-spinner"></div>
          <span class="pulldl-loading-text">Resolving High-Speed Streams...</span>
        </div>
      `;

      if (isPlatformSite() || (!video.src && !video.currentSrc) || (video.currentSrc && video.currentSrc.startsWith("blob:"))) {
        // Query PullDL API for YouTube, Facebook, TikTok, etc.
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

      // Deduplicate and sort highest quality first
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
        <button class="pulldl-format-item" id="pulldl-opt-saveas" data-url="${uniqueFmts[0]?.url}" data-title="${title}" data-ext="${uniqueFmts[0]?.ext || "mp4"}" data-saveas="true">
          <span>⚙️ Custom Folder (Save As...)</span>
          <span class="pulldl-format-tag tag-custom">PICK</span>
        </button>
      `;

      dropdown.innerHTML = `
        <div class="pulldl-dropdown-header">
          <div class="pulldl-dropdown-header-top">
            <span class="pulldl-dropdown-title">Stream Engine</span>
            <span class="pulldl-platform-pill">${platformName}</span>
          </div>
        </div>
        ${itemsHtml}
      `;

      bindDropdownClicks();
    }

    function renderDirectFormats() {
      const vWidth = video.videoWidth || 1920;
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
            // Fallback for blob
            window.open(`https://pulldl.com/?url=${encodeURIComponent(window.location.href)}`, "_blank");
          }
        });
      });
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      dropdown.classList.toggle("show");
      if (dropdown.classList.contains("show")) {
        loadDropdownContent();
      }
    });

    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) {
        dropdown.classList.remove("show");
      }
    });

    container.appendChild(btn);
    container.appendChild(dropdown);
    parent.appendChild(container);
  }

  // 2. Executive Glassmorphic IDM-Style Telemetry HUD
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

  // 3. Listen for Messages
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "DOWNLOAD_STARTED") {
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

  // 4. Observer for dynamic videos
  const observer = new MutationObserver(() => scanAndAttachVideoButtons());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanAndAttachVideoButtons);
  } else {
    scanAndAttachVideoButtons();
  }
})();
