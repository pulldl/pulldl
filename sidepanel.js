// PullDL Control Center Logic (Layer B / Side Panel Experience v3.0.0)

document.addEventListener("DOMContentLoaded", async () => {
  // Global State
  let activeTab = null;
  let isAdvancedMode = false;
  let currentDetectedMedia = [];
  let currentPlatformData = null;
  let activeDownloadsList = [];
  let downloadHistoryList = [];
  let speedHistorySamples = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let currentGrabbedLinks = [];
  let grabberActiveCategory = "all";

  // Elements
  const headerSourceName = document.getElementById("header-source-name");
  const headerSourceDot = document.getElementById("header-source-dot");
  const btnToggleAdvMode = document.getElementById("btn-toggle-adv-mode");
  const labelModeIndicator = document.getElementById("label-mode-indicator");
  const btnTriggerCmd = document.getElementById("btn-trigger-cmd");
  const btnHeaderSettings = document.getElementById("btn-header-settings");

  // Navigation Items & Panes
  const navItems = document.querySelectorAll(".nav-item");
  const viewPanes = document.querySelectorAll(".view-panel");

  function switchView(viewId) {
    navItems.forEach((btn) => btn.classList.toggle("active", btn.getAttribute("data-view") === viewId));
    viewPanes.forEach((pane) => pane.classList.toggle("active", pane.id === viewId));
  }

  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetView = btn.getAttribute("data-view");
      switchView(targetView);
    });
  });

  btnHeaderSettings?.addEventListener("click", () => switchView("view-settings"));

  // Check stored active tab if opened with preference
  chrome.storage.local.get({ activeSidePanelTab: null, uiMode: "simple" }, (data) => {
    if (data.activeSidePanelTab) {
      if (data.activeSidePanelTab === "downloads") switchView("view-downloads");
      else if (data.activeSidePanelTab === "history") switchView("view-history");
      else if (data.activeSidePanelTab === "settings") switchView("view-settings");
      else if (data.activeSidePanelTab === "analyzer") switchView("view-analyzer");
      chrome.storage.local.remove("activeSidePanelTab");
    }
    if (data.uiMode === "advanced") {
      setAdvancedMode(true);
    }
  });

  function setAdvancedMode(enabled) {
    isAdvancedMode = enabled;
    labelModeIndicator.textContent = enabled ? "Advanced" : "Simple";
    btnToggleAdvMode.classList.toggle("active", enabled);
    chrome.storage.local.set({ uiMode: enabled ? "advanced" : "simple" });
    renderDetectedCards();
  }

  btnToggleAdvMode?.addEventListener("click", () => {
    setAdvancedMode(!isAdvancedMode);
  });

  function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    if (!bytes || !isFinite(bytes) || bytes < 0) return "Calculating...";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec === 0) return { val: "0.0", unit: "KB/s" };
    if (bytesPerSec > 1024 * 1024) {
      return { val: (bytesPerSec / (1024 * 1024)).toFixed(1), unit: "MB/s" };
    }
    return { val: Math.round(bytesPerSec / 1024).toString(), unit: "KB/s" };
  }

  function formatSeconds(secs) {
    if (!secs || secs <= 0 || !isFinite(secs)) return "--:--";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  // ================= 1. INSPECT ACTIVE TAB =================
  async function refreshActiveTabContext() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0];

    if (activeTab && activeTab.url) {
      try {
        const u = new URL(activeTab.url);
        headerSourceName.textContent = u.hostname.replace(/^www\./, "");
      } catch (e) {
        headerSourceName.textContent = "Web Media";
      }

      loadActiveTabMedia();
    }
  }

  async function loadActiveTabMedia() {
    if (!activeTab?.id) return;

    const isPlatform =
      activeTab.url.includes("youtube.com") ||
      activeTab.url.includes("youtu.be") ||
      activeTab.url.includes("facebook.com") ||
      activeTab.url.includes("fb.watch") ||
      activeTab.url.includes("instagram.com") ||
      activeTab.url.includes("tiktok.com") ||
      activeTab.url.includes("twitter.com") ||
      activeTab.url.includes("x.com") ||
      activeTab.url.includes("reddit.com");

    if (isPlatform) {
      headerSourceDot.className = "source-dot";
      chrome.runtime.sendMessage({
        type: "RESOLVE_PLATFORM_FORMATS",
        pageUrl: activeTab.url
      }, (resp) => {
        if (chrome.runtime.lastError) {
          loadSniffedTabMedia();
          return;
        }
        if (resp?.success && resp.data && resp.data.formats?.length > 0) {
          headerSourceDot.className = "source-dot active";
          currentPlatformData = resp.data;
          currentDetectedMedia = resp.data.formats.map((f) => ({
            url: f.url,
            title: resp.data.title || activeTab.title,
            format: (f.quality || f.ext || "MP4").toUpperCase(),
            quality: f.quality || "1080p",
            ext: f.ext || "mp4",
            size: f.filesize || 0,
            codec: f.vcodec || "H.264",
            fps: f.fps || 30,
            thumbnail: resp.data.thumbnail,
            duration: resp.data.duration,
            isPlatform: true
          }));
          renderDetectedCards();
        } else {
          loadSniffedTabMedia();
        }
      });
    } else {
      loadSniffedTabMedia();
    }
  }

  function loadSniffedTabMedia() {
    chrome.runtime.sendMessage({ type: "GET_TAB_MEDIA", tabId: activeTab.id }, (response) => {
      if (chrome.runtime.lastError) return;
      const media = response?.media || [];
      currentDetectedMedia = media;
      if (media.length > 0) {
        headerSourceDot.className = "source-dot active";
      } else {
        headerSourceDot.className = "source-dot";
      }
      renderDetectedCards();
    });
  }

  document.getElementById("btn-rescan-page")?.addEventListener("click", () => {
    chrome.tabs.sendMessage(activeTab.id, { type: "TRIGGER_PAGE_LINKGRAB" }).catch(() => {});
    setTimeout(refreshActiveTabContext, 500);
  });

  // ================= 2. DETECTED MEDIA VIEW =================
  const detectedContainer = document.getElementById("detected-cards-container");
  const detectedEmptyState = document.getElementById("detected-empty-state");
  const detectedBar = document.getElementById("detected-bar");
  const detectedCountTitle = document.getElementById("detected-count-title");
  const badgeDetected = document.getElementById("badge-detected");
  const btnSmartDownloadAll = document.getElementById("btn-smart-download-all");

  function renderDetectedCards() {
    badgeDetected.textContent = currentDetectedMedia.length;

    if (currentDetectedMedia.length === 0) {
      detectedContainer.innerHTML = "";
      detectedEmptyState.style.display = "flex";
      detectedBar.style.display = "none";
      return;
    }

    detectedEmptyState.style.display = "none";
    detectedBar.style.display = "flex";
    detectedCountTitle.textContent = `${currentDetectedMedia.length} Media stream${currentDetectedMedia.length > 1 ? "s" : ""} found`;
    detectedContainer.innerHTML = "";

    // Group or show items
    const primaryItem = currentDetectedMedia[0];
    const card = document.createElement("div");
    card.className = "media-card";

    const title = primaryItem.title || activeTab.title || "Detected Web Stream";
    const durationStr = primaryItem.duration ? formatSeconds(primaryItem.duration) : "Stream";
    const bestQuality = primaryItem.quality || primaryItem.format || "1080p";
    const bestSize = formatBytes(primaryItem.size);

    card.innerHTML = `
      <div class="media-card-top">
        <div class="media-thumbnail-box">
          ${primaryItem.thumbnail ? `<img src="${primaryItem.thumbnail}" class="media-thumbnail-img" alt="">` : `<span class="media-type-placeholder">VIDEO</span>`}
          <span class="media-duration-tag">${durationStr}</span>
        </div>
        <div class="media-meta-main">
          <div class="media-headline" title="${title}">${title}</div>
          <div class="media-sub-meta">
            <span class="best-format-pill">${bestQuality} • ${primaryItem.ext?.toUpperCase() || "MP4"}</span>
            <span>~${bestSize}</span>
          </div>
        </div>
      </div>

      ${isAdvancedMode ? `
        <div class="media-adv-metadata">
          <div class="adv-meta-row"><span>PROTOCOL:</span><strong>${primaryItem.isPlatform ? "Cloud Stream Extractor" : "HTTP/1.1 Segmented"}</strong></div>
          <div class="adv-meta-row"><span>CODEC:</span><strong>${primaryItem.codec || "avc1 / mp4a"}</strong></div>
          <div class="adv-meta-row"><span>ACCELERATION:</span><strong>8 Active Parallel Threads</strong></div>
        </div>
      ` : ""}

      <div class="media-card-actions">
        <button class="btn-card-download" id="btn-smart-dl-card">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          <span>Smart Download</span>
        </button>
        <button class="btn-card-formats" id="btn-open-format-sheet">
          <span>More formats ▾</span>
        </button>
      </div>
    `;

    card.querySelector("#btn-smart-dl-card").addEventListener("click", () => {
      chrome.runtime.sendMessage({
        type: "TRIGGER_DOWNLOAD",
        url: primaryItem.url,
        title: title,
        tabId: activeTab.id,
        category: "video",
        ext: primaryItem.ext || "mp4"
      });
      switchView("view-downloads");
    });

    card.querySelector("#btn-open-format-sheet").addEventListener("click", () => {
      openFormatPicker(title, currentDetectedMedia);
    });

    detectedContainer.appendChild(card);
  }

  btnSmartDownloadAll?.addEventListener("click", () => {
    if (currentDetectedMedia.length === 0) return;
    const batch = currentDetectedMedia.slice(0, 5).map((m, idx) => ({
      url: m.url,
      title: (m.title || activeTab.title) + `_${m.quality || idx}`,
      category: "video",
      ext: m.ext || "mp4"
    }));

    chrome.runtime.sendMessage({
      type: "TRIGGER_BATCH_DOWNLOAD",
      items: batch
    }, () => {
      switchView("view-downloads");
    });
  });

  // ================= 3. FORMAT PICKER BOTTOM SHEET =================
  const formatSheet = document.getElementById("format-picker-sheet");
  const sheetTitle = document.getElementById("sheet-media-title");
  const sheetFormatsList = document.getElementById("sheet-formats-list");
  const btnCloseSheet = document.getElementById("btn-close-sheet");
  const sheetBackdrop = document.getElementById("sheet-backdrop");

  function openFormatPicker(title, formats) {
    sheetTitle.textContent = title;
    sheetFormatsList.innerHTML = "";

    // 1. BEST QUALITY SECTION
    const bestSec = document.createElement("div");
    bestSec.innerHTML = `<div class="sheet-section-title">⭐ BEST QUALITY</div>`;
    const bestF = formats[0];
    const bestCard = createFormatRow(bestF, title, true);
    bestSec.appendChild(bestCard);
    sheetFormatsList.appendChild(bestSec);

    // 2. VIDEO TRACKS
    const videoSec = document.createElement("div");
    videoSec.innerHTML = `<div class="sheet-section-title">🎬 VIDEO RESOLUTIONS</div>`;
    formats.filter((f) => !f.ext?.includes("mp3") && !f.quality?.toLowerCase().includes("audio")).forEach((f) => {
      videoSec.appendChild(createFormatRow(f, title));
    });
    sheetFormatsList.appendChild(videoSec);

    // 3. AUDIO TRACKS
    const audioSec = document.createElement("div");
    audioSec.innerHTML = `<div class="sheet-section-title">🎵 EXTRACTED AUDIO</div>`;
    const audioFormats = [
      { quality: "320 kbps", ext: "mp3", filesize: Math.round((bestF.size || 50000000) * 0.12), isAudio: true },
      { quality: "160 kbps", ext: "m4a", filesize: Math.round((bestF.size || 50000000) * 0.06), isAudio: true }
    ];
    audioFormats.forEach((af) => {
      audioSec.appendChild(createFormatRow(af, title));
    });
    sheetFormatsList.appendChild(audioSec);

    formatSheet.style.display = "flex";
  }

  function createFormatRow(f, title, isBest = false) {
    const row = document.createElement("div");
    row.className = "format-choice-card";
    const q = f.quality || f.format || "1080p";
    const ext = (f.ext || "mp4").toUpperCase();
    const sz = formatBytes(f.filesize || f.size);

    row.innerHTML = `
      <div class="format-choice-meta">
        <span class="format-choice-main">${q} • ${ext}</span>
        <span class="format-choice-tech">${f.codec || "H.264/AAC"} • ${f.fps || 30}fps • ~${sz}</span>
      </div>
      <button class="btn-action-primary" style="padding: 4px 10px; font-size: 11px;">Download</button>
    `;

    row.querySelector("button").addEventListener("click", () => {
      chrome.runtime.sendMessage({
        type: "TRIGGER_DOWNLOAD",
        url: f.url || currentDetectedMedia[0].url,
        title: title,
        tabId: activeTab?.id,
        category: f.isAudio ? "audio" : "video",
        ext: f.ext || "mp4",
        filesize: f.filesize || f.size || 0,
        totalBytes: f.filesize || f.size || 0
      });
      closeFormatSheet();
      switchView("view-downloads");
    });

    return row;
  }

  function closeFormatSheet() {
    formatSheet.style.display = "none";
  }

  btnCloseSheet?.addEventListener("click", closeFormatSheet);
  sheetBackdrop?.addEventListener("click", closeFormatSheet);

  // ================= 4. DOWNLOADS HUD & SPEED SPARKLINE =================
  const downloadsContainer = document.getElementById("downloads-list-container");
  const downloadsEmpty = document.getElementById("downloads-empty-state");
  const badgeDownloads = document.getElementById("badge-downloads");
  const sparkSpeedNum = document.getElementById("spark-speed-num");
  const sparkSpeedUnit = document.getElementById("spark-speed-unit");
  const activeTasksLabel = document.getElementById("active-tasks-label");
  const sparklinePath = document.getElementById("sparkline-path");

  function renderSparkline(samples) {
    if (!samples || samples.length < 2) return;
    const max = Math.max(...samples, 1024 * 1024); // at least 1MB
    const points = samples.map((val, idx) => {
      const x = (idx / (samples.length - 1)) * 120;
      const y = 28 - (val / max) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    sparklinePath.setAttribute("d", `M${points.join(" L")}`);
  }

  function updateDownloadsView() {
    chrome.runtime.sendMessage({ type: "GET_ACTIVE_DOWNLOADS" }, (response) => {
      if (!response) return;

      activeDownloadsList = response.activeDownloads?.filter(
        (d) => d.state === "in_progress" || d.state === "paused"
      ) || [];
      downloadHistoryList = response.history || [];
      if (response.speedSamples) {
        speedHistorySamples = response.speedSamples;
        renderSparkline(speedHistorySamples);
      }

      // Update badge
      if (activeDownloadsList.length > 0) {
        badgeDownloads.style.display = "inline-block";
        badgeDownloads.textContent = activeDownloadsList.length;
      } else {
        badgeDownloads.style.display = "none";
      }

      // Total Speed
      let totalSpeed = 0;
      activeDownloadsList.forEach((d) => totalSpeed += (d.speed || 0));
      const sp = formatSpeed(totalSpeed);
      sparkSpeedNum.textContent = sp.val;
      sparkSpeedUnit.textContent = sp.unit;
      activeTasksLabel.textContent = `${activeDownloadsList.length} active task${activeDownloadsList.length === 1 ? "" : "s"}`;

      if (activeDownloadsList.length === 0) {
        downloadsContainer.innerHTML = "";
        downloadsEmpty.style.display = "flex";
      } else {
        downloadsEmpty.style.display = "none";
        downloadsContainer.innerHTML = "";

        activeDownloadsList.forEach((item) => {
          const card = document.createElement("div");
          card.className = "download-task-card";

          const itemSp = formatSpeed(item.speed);
          const etaStr = formatSeconds(item.eta);
          const isPaused = item.state === "paused";

          card.innerHTML = `
            <div class="task-title-row">
              <span class="task-title" title="${item.title}">${item.title}</span>
              <span class="task-status-pill">${isPaused ? "PAUSED" : "ACTIVE"}</span>
            </div>
            <div class="task-progress-track">
              <div class="task-progress-fill" style="width: ${item.progress}%"></div>
            </div>
            <div class="task-stat-line">
              <span class="task-speed-val">↓ ${itemSp.val} ${itemSp.unit}</span>
              <span>${formatBytes(item.receivedBytes)} / ${formatBytes(item.totalBytes)} (${item.progress}%) • ETA ${etaStr}</span>
            </div>
            <div class="task-controls-row">
              <button class="btn-ctrl btn-pause-task">${isPaused ? "Resume ▶" : "Pause ⏸"}</button>
              <button class="btn-ctrl btn-cancel-task">Cancel ✕</button>
            </div>
          `;

          card.querySelector(".btn-pause-task").addEventListener("click", () => {
            if (isPaused) {
              chrome.runtime.sendMessage({ type: "RESUME_DOWNLOAD", downloadId: item.downloadId });
            } else {
              chrome.runtime.sendMessage({ type: "PAUSE_DOWNLOAD", downloadId: item.downloadId });
            }
          });

          card.querySelector(".btn-cancel-task").addEventListener("click", () => {
            chrome.runtime.sendMessage({ type: "CANCEL_DOWNLOAD", downloadId: item.downloadId });
          });

          downloadsContainer.appendChild(card);
        });
      }

      // Render History
      renderHistoryView();
    });
  }

  // ================= 5. HISTORY VIEW =================
  const historyContainer = document.getElementById("history-list-container");
  const historyEmpty = document.getElementById("history-empty-state");
  const historySearch = document.getElementById("history-search-input");
  const btnClearHistory = document.getElementById("btn-clear-history-all");

  function renderHistoryView() {
    if (!historyContainer) return;

    const query = historySearch?.value.toLowerCase().trim() || "";
    const filtered = downloadHistoryList.filter((item) =>
      !query || item.title?.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      historyContainer.innerHTML = "";
      historyEmpty.style.display = "flex";
      return;
    }

    historyEmpty.style.display = "none";
    historyContainer.innerHTML = "";

    filtered.forEach((item) => {
      const card = document.createElement("div");
      card.className = "media-card";

      card.innerHTML = `
        <div class="media-headline" title="${item.title}">${item.title}</div>
        <div class="media-sub-meta">
          <span class="best-format-pill">COMPLETED</span>
          <span>${formatBytes(item.totalBytes)}</span>
        </div>
        <div class="media-card-actions">
          <button class="btn-card-download btn-hist-open" style="flex: 2;">Open File</button>
          <button class="btn-card-formats btn-hist-folder" style="flex: 1;">Folder</button>
        </div>
      `;

      card.querySelector(".btn-hist-open").addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "OPEN_DOWNLOAD", downloadId: item.id });
      });
      card.querySelector(".btn-hist-folder").addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "SHOW_IN_FOLDER", downloadId: item.id });
      });

      historyContainer.appendChild(card);
    });
  }

  historySearch?.addEventListener("input", renderHistoryView);
  btnClearHistory?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" }, () => {
      downloadHistoryList = [];
      renderHistoryView();
    });
  });

  // ================= 6. QUEUE VIEW =================
  const queueContainer = document.getElementById("queue-list-container");
  const queueEmpty = document.getElementById("queue-empty-state");
  const queueStatusLabel = document.getElementById("queue-status-label");
  const badgeQueue = document.getElementById("badge-queue");

  function updateQueueView() {
    chrome.runtime.sendMessage({ type: "GET_QUEUE" }, (res) => {
      const queue = res?.queue || [];
      badgeQueue.textContent = queue.length;
      queueStatusLabel.textContent = `Download Queue (${queue.length} item${queue.length === 1 ? "" : "s"})`;

      if (queue.length === 0) {
        queueContainer.innerHTML = "";
        queueEmpty.style.display = "flex";
      } else {
        queueEmpty.style.display = "none";
        queueContainer.innerHTML = "";

        queue.forEach((item) => {
          const card = document.createElement("div");
          card.className = "queue-item-card";
          card.innerHTML = `
            <div class="queue-item-meta">
              <span class="queue-item-title" title="${item.title}">${item.title}</span>
              <span style="font-size: 10px; color: var(--text-dim);">${item.category || "media"}</span>
            </div>
            <span class="queue-priority-pill priority-${item.priority?.toLowerCase() || "normal"}">${item.priority || "NORMAL"}</span>
          `;
          queueContainer.appendChild(card);
        });
      }
    });
  }

  document.getElementById("btn-pause-all-queue")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "PAUSE_ALL_DOWNLOADS" });
  });
  document.getElementById("btn-resume-all-queue")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "RESUME_ALL_DOWNLOADS" });
  });

  // ================= 7. LINKGRABBER VIEW =================
  const btnGrabberScrape = document.getElementById("btn-grabber-scrape-page");
  const btnGrabberPaste = document.getElementById("btn-grabber-paste-clip");
  const grabberTextarea = document.getElementById("grabber-raw-textarea");
  const btnGrabberParse = document.getElementById("btn-grabber-parse");
  const grabberCategoryBar = document.getElementById("grabber-category-bar");
  const grabberMetaRow = document.getElementById("grabber-meta-row");
  const grabberItemsList = document.getElementById("grabber-items-list");
  const grabberEmptyState = document.getElementById("grabber-empty-state");
  const grabberStickyBottom = document.getElementById("grabber-sticky-bottom");
  const grabberCheckAll = document.getElementById("grabber-check-all");
  const grabberStatusLabel = document.getElementById("grabber-status-label");
  const btnGrabberBatchDownload = document.getElementById("btn-grabber-download-selected");

  function populateGrabberItems(links) {
    currentGrabbedLinks = links.map((l, idx) => ({
      ...l,
      id: "l_" + idx,
      selected: true
    }));
    updateGrabberDOM();
  }

  function updateGrabberDOM() {
    if (currentGrabbedLinks.length === 0) {
      grabberEmptyState.style.display = "flex";
      grabberCategoryBar.style.display = "none";
      grabberMetaRow.style.display = "none";
      grabberItemsList.style.display = "none";
      grabberStickyBottom.style.display = "none";
      return;
    }

    grabberEmptyState.style.display = "none";
    grabberCategoryBar.style.display = "flex";
    grabberMetaRow.style.display = "flex";
    grabberItemsList.style.display = "flex";
    grabberStickyBottom.style.display = "block";

    // Category counts
    document.getElementById("cat-num-all").textContent = currentGrabbedLinks.length;
    document.getElementById("cat-num-video").textContent = currentGrabbedLinks.filter((i) => i.category === "video").length;
    document.getElementById("cat-num-audio").textContent = currentGrabbedLinks.filter((i) => i.category === "audio").length;
    document.getElementById("cat-num-image").textContent = currentGrabbedLinks.filter((i) => i.category === "image").length;
    document.getElementById("cat-num-archive").textContent = currentGrabbedLinks.filter((i) => i.category === "archive").length;

    renderFilteredGrabber();
  }

  function renderFilteredGrabber() {
    grabberItemsList.innerHTML = "";
    const visible = grabberActiveCategory === "all"
      ? currentGrabbedLinks
      : currentGrabbedLinks.filter((i) => i.category === grabberActiveCategory);

    visible.forEach((item) => {
      const row = document.createElement("div");
      row.className = "grabber-item-row";
      row.innerHTML = `
        <input type="checkbox" ${item.selected ? "checked" : ""} data-id="${item.id}">
        <div class="grabber-item-info">
          <span class="grabber-item-title" title="${item.url}">${item.title || item.url}</span>
          <div class="grabber-item-tags">
            <span class="badge-tag">${item.category}</span>
            <span>${item.domain || "web"}</span>
          </div>
        </div>
      `;

      row.querySelector('input[type="checkbox"]').addEventListener("change", (e) => {
        item.selected = e.target.checked;
        updateGrabberSelectionLabel();
      });

      grabberItemsList.appendChild(row);
    });

    updateGrabberSelectionLabel();
  }

  function updateGrabberSelectionLabel() {
    const selected = currentGrabbedLinks.filter((i) => i.selected).length;
    grabberStatusLabel.textContent = `${selected} of ${currentGrabbedLinks.length} selected`;
    document.getElementById("label-grabber-batch-btn").textContent = `⚡ Download Selected (${selected})`;
    btnGrabberBatchDownload.disabled = selected === 0;
    grabberCheckAll.checked = selected === currentGrabbedLinks.length && currentGrabbedLinks.length > 0;
  }

  document.querySelectorAll(".cat-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".cat-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      grabberActiveCategory = chip.getAttribute("data-cat");
      renderFilteredGrabber();
    });
  });

  grabberCheckAll?.addEventListener("change", (e) => {
    const checked = e.target.checked;
    currentGrabbedLinks.forEach((i) => (i.selected = checked));
    renderFilteredGrabber();
  });

  btnGrabberScrape?.addEventListener("click", () => {
    btnGrabberScrape.textContent = "Scraping...";
    chrome.tabs.sendMessage(activeTab.id, { type: "SCRAPE_PAGE_LINKS" }, (res) => {
      btnGrabberScrape.textContent = "Scrape Current Page";
      if (res?.links && res.links.length > 0) {
        populateGrabberItems(res.links);
      } else {
        chrome.runtime.sendMessage({ type: "PARSE_BATCH_TEXT", rawText: activeTab.url }, (r) => {
          if (r?.items) populateGrabberItems(r.items);
        });
      }
    });
  });

  btnGrabberPaste?.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        grabberTextarea.value = text;
        chrome.runtime.sendMessage({ type: "PARSE_BATCH_TEXT", rawText: text }, (r) => {
          if (r?.items) populateGrabberItems(r.items);
        });
      }
    } catch (e) {
      grabberTextarea.focus();
    }
  });

  btnGrabberParse?.addEventListener("click", () => {
    const text = grabberTextarea.value.trim();
    if (text) {
      chrome.runtime.sendMessage({ type: "PARSE_BATCH_TEXT", rawText: text }, (r) => {
        if (r?.items) populateGrabberItems(r.items);
      });
    }
  });

  btnGrabberBatchDownload?.addEventListener("click", () => {
    const selected = currentGrabbedLinks.filter((i) => i.selected);
    if (selected.length === 0) return;

    chrome.runtime.sendMessage({
      type: "TRIGGER_BATCH_DOWNLOAD",
      items: selected
    }, () => {
      switchView("view-downloads");
    });
  });

  // ================= 8. URL ANALYZER (Progressive Real Task States) =================
  const analyzerUrlField = document.getElementById("analyzer-url-field");
  const btnStartAnalyze = document.getElementById("btn-start-analyze");
  const progressiveStepsBox = document.getElementById("progressive-steps");
  const analyzerResultCard = document.getElementById("analyzer-result-card");

  async function runUrlAnalysis(targetUrl) {
    if (!targetUrl) return;
    analyzerUrlField.value = targetUrl;
    progressiveStepsBox.style.display = "flex";
    analyzerResultCard.innerHTML = "";

    const s1 = document.getElementById("step-1");
    const s2 = document.getElementById("step-2");
    const s3 = document.getElementById("step-3");
    const s4 = document.getElementById("step-4");

    s1.className = "step-row active";
    s2.className = "step-row";
    s3.className = "step-row";
    s4.className = "step-row";

    await new Promise((r) => setTimeout(r, 200));
    s1.className = "step-row completed";
    s2.className = "step-row active";

    chrome.runtime.sendMessage({
      type: "RESOLVE_PLATFORM_FORMATS",
      pageUrl: targetUrl
    }, async (resp) => {
      s2.className = "step-row completed";
      s3.className = "step-row active";
      await new Promise((r) => setTimeout(r, 200));

      if (resp?.success && resp.data) {
        s3.className = "step-row completed";
        s4.className = "step-row completed";

        const title = resp.data.title || "Resolved Video Payload";
        const best = resp.data.formats?.[0] || { quality: "1080p", ext: "mp4" };

        analyzerResultCard.innerHTML = `
          <div class="media-card">
            <div class="media-headline">${title}</div>
            <div class="media-sub-meta">
              <span class="best-format-pill">${best.quality || "1080p"} • ${best.ext?.toUpperCase() || "MP4"}</span>
              <span>~${formatBytes(best.filesize)}</span>
            </div>
            <div class="media-card-actions">
              <button class="btn-card-download" id="btn-analyzer-download">Download Payload</button>
            </div>
          </div>
        `;

        analyzerResultCard.querySelector("#btn-analyzer-download").addEventListener("click", () => {
          chrome.runtime.sendMessage({
            type: "TRIGGER_DOWNLOAD",
            url: best.url,
            title: title,
            ext: best.ext || "mp4"
          });
          switchView("view-downloads");
        });
      } else {
        s3.className = "step-row completed";
        s4.className = "step-row active";
        analyzerResultCard.innerHTML = `
          <div class="empty-box" style="padding: 16px;">
            <h3>Source temporarily unavailable</h3>
            <p>The extractor could not resolve direct stream tokens. You can try again or check URL permissions.</p>
          </div>
        `;
      }
    });
  }

  btnStartAnalyze?.addEventListener("click", () => {
    runUrlAnalysis(analyzerUrlField.value.trim());
  });

  // Check pending analyze URL from quick popup
  chrome.storage.local.get({ pendingAnalyzeUrl: null }, (d) => {
    if (d.pendingAnalyzeUrl) {
      runUrlAnalysis(d.pendingAnalyzeUrl);
      chrome.storage.local.remove("pendingAnalyzeUrl");
    }
  });

  // ================= 9. COMMAND PALETTE (CMD + K) =================
  const cmdModal = document.getElementById("command-palette-modal");
  const cmdInput = document.getElementById("cmd-input");
  const cmdItems = document.querySelectorAll(".cmd-item");
  const cmdBackdrop = document.getElementById("cmd-backdrop");

  function openCommandPalette() {
    cmdModal.style.display = "flex";
    cmdInput.value = "";
    cmdInput.focus();
  }

  function closeCommandPalette() {
    cmdModal.style.display = "none";
  }

  btnTriggerCmd?.addEventListener("click", openCommandPalette);
  cmdBackdrop?.addEventListener("click", closeCommandPalette);

  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (cmdModal.style.display === "flex") closeCommandPalette();
      else openCommandPalette();
    } else if (e.key === "Escape" && cmdModal.style.display === "flex") {
      closeCommandPalette();
    }
  });

  cmdItems.forEach((item) => {
    item.addEventListener("click", () => {
      const action = item.getAttribute("data-action");
      closeCommandPalette();
      executeCommand(action);
    });
  });

  function executeCommand(action) {
    switch (action) {
      case "download-best":
        if (currentDetectedMedia.length > 0) {
          const m = currentDetectedMedia[0];
          chrome.runtime.sendMessage({
            type: "TRIGGER_DOWNLOAD",
            url: m.url,
            title: m.title || activeTab.title,
            tabId: activeTab.id,
            category: "video",
            ext: m.ext || "mp4"
          });
          switchView("view-downloads");
        }
        break;
      case "pause-all":
        chrome.runtime.sendMessage({ type: "PAUSE_ALL_DOWNLOADS" });
        break;
      case "resume-all":
        chrome.runtime.sendMessage({ type: "RESUME_ALL_DOWNLOADS" });
        break;
      case "rescan":
        document.getElementById("btn-rescan-page")?.click();
        break;
      case "grab-links":
        switchView("view-linkgrabber");
        btnGrabberScrape?.click();
        break;
      case "toggle-advanced":
        setAdvancedMode(!isAdvancedMode);
        break;
      case "open-settings":
        switchView("view-settings");
        break;
      default:
        break;
    }
  }

  // ================= 10. SETTINGS SYNCHRONIZATION =================
  const configThreads = document.getElementById("config-parallel-threads");
  const configSorting = document.getElementById("config-smart-sorting");
  const configAskFolder = document.getElementById("config-ask-folder");
  const configFloatingPill = document.getElementById("config-floating-pill");
  const btnSettingsClearData = document.getElementById("btn-settings-clear-data");

  chrome.storage.local.get({
    concurrencyMode: "8",
    smartSorting: true,
    askFolder: false,
    floatingButton: true
  }, (cfg) => {
    configThreads.value = cfg.concurrencyMode;
    configSorting.checked = cfg.smartSorting;
    configAskFolder.checked = cfg.askFolder;
    configFloatingPill.checked = cfg.floatingButton;
  });

  configThreads?.addEventListener("change", () => {
    chrome.storage.local.set({ concurrencyMode: configThreads.value });
  });
  configSorting?.addEventListener("change", () => {
    chrome.storage.local.set({ smartSorting: configSorting.checked });
  });
  configAskFolder?.addEventListener("change", () => {
    chrome.storage.local.set({ askFolder: configAskFolder.checked });
  });
  configFloatingPill?.addEventListener("change", () => {
    chrome.storage.local.set({ floatingButton: configFloatingPill.checked });
  });
  btnSettingsClearData?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" });
  });

  // Live Telemetry Event Listener
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "DOWNLOAD_PROGRESS" || msg.type === "DOWNLOAD_STARTED" || msg.type === "DOWNLOAD_COMPLETE") {
      updateDownloadsView();
    }
  });

  // Init Active Context & Realtime Poller
  await refreshActiveTabContext();
  updateDownloadsView();
  updateQueueView();
  const pollInterval = setInterval(() => {
    updateDownloadsView();
    updateQueueView();
  }, 600);
  window.addEventListener("unload", () => clearInterval(pollInterval));
});
