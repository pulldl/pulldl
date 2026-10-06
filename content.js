// PullDL In-Page Content Script — Universal Media Sniffer & Floating HUD Manager
(function () {
  if (window.__pulldl_engine_injected) return;
  window.__pulldl_engine_injected = true;

  // Active Downloads HUD state
  let currentActiveHud = null;
  const processedVideos = new WeakSet();

  // Helper: Format bytes to human readable (MB / GB)
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 MB";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  // Helper: Format speed to MB/s or KB/s
  function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec === 0) return "0 KB/s";
    if (bytesPerSec > 1024 * 1024) {
      return (bytesPerSec / (1024 * 1024)).toFixed(1) + " MB/s";
    }
    return Math.round(bytesPerSec / 1024) + " KB/s";
  }

  // Helper: Format seconds to MM:SS
  function formatEta(seconds) {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  // Get clean page title
  function getMediaTitle() {
    return document.title.replace(/[-|•].*$/, "").trim() || "Web_Video_" + Date.now();
  }

  // 1. Scan and Attach Corner Floating Button to Video Elements
  function scanAndAttachVideoButtons() {
    const videos = document.querySelectorAll("video");
    videos.forEach((video) => {
      if (processedVideos.has(video)) return;
      if (video.offsetWidth < 140 || video.offsetHeight < 100) return; // skip tiny previews/avatars

      processedVideos.add(video);
      attachCornerButton(video);
    });
  }

  // Attach button to a specific video player
  function attachCornerButton(video) {
    const parent = video.parentElement;
    if (!parent) return;

    // Ensure parent has relative positioning
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.position === "static") {
      parent.classList.add("pulldl-video-anchor");
    }

    const container = document.createElement("div");
    container.className = "pulldl-corner-btn-container";

    // Floating Button
    const btn = document.createElement("button");
    btn.className = "pulldl-corner-btn";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>PullDL</span>
    `;

    // Quality & Format Dropdown Menu
    const dropdown = document.createElement("div");
    dropdown.className = "pulldl-format-dropdown";

    function updateDropdownItems() {
      const vWidth = video.videoWidth || 1920;
      const vHeight = video.videoHeight || 1080;
      const hasHd = vHeight >= 720;
      const hasFullHd = vHeight >= 1080;

      dropdown.innerHTML = `
        <div class="pulldl-dropdown-header">Download Quality & Format</div>
        ${hasFullHd ? `
          <button class="pulldl-format-item" data-format="mp4" data-quality="1080p">
            <span>🎬 1080p Full HD</span>
            <span class="pulldl-format-tag hd">MP4</span>
          </button>
        ` : ""}
        ${hasHd ? `
          <button class="pulldl-format-item" data-format="mp4" data-quality="720p">
            <span>🎬 720p HD</span>
            <span class="pulldl-format-tag hd">MP4</span>
          </button>
        ` : ""}
        <button class="pulldl-format-item" data-format="mp4" data-quality="480p">
          <span>🎬 480p Standard</span>
          <span class="pulldl-format-tag">MP4</span>
        </button>
        <button class="pulldl-format-item" data-format="mp3" data-category="audio" data-quality="320kbps">
          <span>🎵 Extract Audio</span>
          <span class="pulldl-format-tag audio">MP3</span>
        </button>
        <button class="pulldl-format-item" data-format="mp4" data-saveas="true">
          <span>⚙️ Save As... (Pick Folder)</span>
          <span class="pulldl-format-tag">Custom</span>
        </button>
      `;

      // Attach click events
      dropdown.querySelectorAll(".pulldl-format-item").forEach((item) => {
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          dropdown.classList.remove("show");

          const format = item.getAttribute("data-format") || "mp4";
          const category = item.getAttribute("data-category") || "video";
          const saveAs = item.getAttribute("data-saveas") === "true";

          const targetUrl = video.currentSrc || video.src || window.location.href;

          chrome.runtime.sendMessage({
            type: "TRIGGER_DOWNLOAD",
            url: targetUrl,
            title: getMediaTitle(),
            format: format,
            category: category,
            saveAs: saveAs
          });
        });
      });
    }

    // Toggle dropdown
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      updateDropdownItems();
      dropdown.classList.toggle("show");
    });

    // Close dropdown on outside click
    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) {
        dropdown.classList.remove("show");
      }
    });

    container.appendChild(btn);
    container.appendChild(dropdown);
    parent.appendChild(container);
  }

  // 2. In-Page Glassmorphic IDM-Style Download HUD Modal
  function createOrUpdateDownloadHud(data) {
    let hud = document.getElementById("pulldl-active-hud");

    if (!hud) {
      hud = document.createElement("div");
      hud.id = "pulldl-active-hud";
      hud.className = "pulldl-hud-panel";
      document.body.appendChild(hud);
    }

    const speedStr = formatSpeed(data.speed);
    const progress = data.progress || 0;
    const receivedStr = formatBytes(data.receivedBytes);
    const totalStr = formatBytes(data.totalBytes);
    const etaStr = formatEta(data.eta);
    const isComplete = data.state === "complete";
    const isPaused = data.state === "paused";

    // 8-chunk IDM thread visual calculation
    const chunkBars = Array.from({ length: 8 }).map((_, i) => {
      const chunkProgress = Math.min(100, Math.max(0, (progress - (i * 12)) * (100 / 12)));
      return `
        <div class="pulldl-chunk-bar">
          <div class="pulldl-chunk-fill" style="width: ${chunkProgress}%"></div>
        </div>
      `;
    }).join("");

    hud.innerHTML = `
      <div class="pulldl-hud-header">
        <div class="pulldl-hud-title-wrap">
          <div style="width: 10px; height: 10px; border-radius: 50%; background: ${isComplete ? "#00c853" : "#38bdf8"}; box-shadow: 0 0 8px ${isComplete ? "#00c853" : "#38bdf8"};"></div>
          <div class="pulldl-hud-title" title="${data.title}">${data.title}</div>
        </div>
        <button class="pulldl-hud-close" id="pulldl-hud-close-btn" title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="pulldl-telemetry-row">
        <div class="pulldl-speed-badge">
          ${isComplete ? "✅ Finished" : isPaused ? "⏸️ Paused" : `⚡ ${speedStr}`}
        </div>
        <div class="pulldl-eta-badge">
          ${isComplete ? "Saved in PullDL" : `ETA: ${etaStr}`}
        </div>
      </div>

      <div class="pulldl-progress-track">
        <div class="pulldl-progress-fill" style="width: ${progress}%"></div>
      </div>

      <!-- 8 Parallel Chunk Threads (IDM Style) -->
      <div class="pulldl-chunks-container">
        ${chunkBars}
      </div>

      <div class="pulldl-hud-footer">
        <div>${receivedStr} / ${totalStr} (${progress}%)</div>
        <div class="pulldl-hud-actions">
          ${isComplete ? `
            <button class="pulldl-action-btn success" id="pulldl-btn-open">Open File</button>
            <button class="pulldl-action-btn" id="pulldl-btn-folder">Show Folder</button>
          ` : `
            <button class="pulldl-action-btn" id="pulldl-btn-toggle-pause">
              ${isPaused ? "Resume ▶️" : "Pause ⏸️"}
            </button>
            <button class="pulldl-action-btn" id="pulldl-btn-cancel">Cancel ✖️</button>
          `}
        </div>
      </div>
    `;

    // Close HUD
    hud.querySelector("#pulldl-hud-close-btn").addEventListener("click", () => {
      hud.remove();
    });

    // Control actions
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

  // 3. Listen for Messages from Background
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

  // 4. MutationObserver to catch dynamically rendered videos
  const observer = new MutationObserver(() => {
    scanAndAttachVideoButtons();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Initial scan
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanAndAttachVideoButtons);
  } else {
    scanAndAttachVideoButtons();
  }
})();
