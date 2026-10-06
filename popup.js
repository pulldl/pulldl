// PullDL Universal Studio Popup Logic (v3.0.0 Obsidian Glass Edition)
// Implements: 7-Layer Media View, JDownloader Batch LinkGrabber, Real-Time Speedometer HUD, Telemetry Controls

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Navigation Tab Switching
  const tabs = document.querySelectorAll(".nav-tab");
  const panes = document.querySelectorAll(".tab-pane");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      panes.forEach((p) => p.classList.remove("active"));

      tab.classList.add("active");
      const targetPane = document.getElementById(tab.getAttribute("data-tab"));
      if (targetPane) targetPane.classList.add("active");
    });
  });

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "Direct Stream";
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

  // Active Tab Metadata
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTabTitleEl = document.getElementById("active-tab-title");
  if (activeTab && activeTabTitleEl) {
    activeTabTitleEl.textContent = activeTab.title || activeTab.url;
    activeTabTitleEl.title = activeTab.url;
  }

  // ================= TAB 1: DETECTED STREAMS =================
  const listContainer = document.getElementById("detected-list");
  const emptyContainer = document.getElementById("detected-empty");
  const countBadge = document.getElementById("badge-detected-count");
  const searchInput = document.getElementById("detected-search");
  const actionBar = document.getElementById("detected-action-bar");
  const batchBtn = document.getElementById("btn-download-all-detected");
  const refreshBtn = document.getElementById("btn-refresh-streams");

  let currentDetectedItems = [];

  async function loadDetectedStreams() {
    if (!activeTab) return;

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
      emptyContainer.style.display = "flex";
      listContainer.style.display = "none";
      actionBar.style.display = "none";

      document.getElementById("empty-state-title").textContent = "Resolving Cloud Streams...";
      document.getElementById("empty-state-desc").textContent = "Accessing PullDL Multi-Gigabit extraction pipeline for highest bitrate media...";

      chrome.runtime.sendMessage(
        { type: "RESOLVE_PLATFORM_FORMATS", pageUrl: activeTab.url },
        (resp) => {
          if (resp && resp.success && resp.data && resp.data.formats && resp.data.formats.length > 0) {
            renderPlatformFormats(resp.data);
          } else {
            checkSniffedMedia();
          }
        }
      );
    } else {
      checkSniffedMedia();
    }
  }

  function checkSniffedMedia() {
    chrome.runtime.sendMessage({ type: "GET_TAB_MEDIA", tabId: activeTab.id }, (response) => {
      const mediaList = response?.media || [];
      currentDetectedItems = mediaList;
      countBadge.textContent = mediaList.length;

      if (mediaList.length > 0) {
        actionBar.style.display = "flex";
        renderMediaList(mediaList);
      } else {
        listContainer.style.display = "none";
        actionBar.style.display = "none";
        emptyContainer.style.display = "flex";
        document.getElementById("empty-state-title").textContent = "Sniffing Media Streams...";
        document.getElementById("empty-state-desc").textContent = "Play any video or audio on the page. The 7-layer engine will capture 4K/1080p and HLS streams automatically.";
      }
    });
  }

  function renderPlatformFormats(data) {
    const title = data.title || activeTab.title;
    const formats = data.formats || [];

    // Deduplicate
    const unique = [];
    const seen = new Set();
    for (const f of formats) {
      const key = (f.quality || "") + (f.ext || "");
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(f);
      }
    }

    currentDetectedItems = unique.map((f) => ({
      url: f.url,
      title: title,
      format: (f.quality || f.ext || "MP4").toUpperCase(),
      ext: f.ext || "mp4",
      size: f.filesize || 0,
      isAudio: f.ext === "mp3" || (f.quality && f.quality.toLowerCase().includes("audio"))
    }));

    countBadge.textContent = currentDetectedItems.length;
    actionBar.style.display = "flex";
    renderMediaList(currentDetectedItems);
  }

  function renderMediaList(items) {
    listContainer.innerHTML = "";
    listContainer.style.display = "flex";
    emptyContainer.style.display = "none";

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "media-card";

      const isAudio = item.isAudio || item.format === "MP3" || (item.mimeType && item.mimeType.includes("audio"));
      const isStream = item.format && (item.format.includes("HLS") || item.format.includes("DASH"));

      let badgeClass = "media-badge";
      if (isAudio) badgeClass += " audio";
      else if (isStream) badgeClass += " stream";

      card.innerHTML = `
        <div class="media-header">
          <div class="badge-row">
            <span class="${badgeClass}">${item.format || "MP4"}</span>
            ${item.confidence ? `<span class="confidence-pill">${Math.round(item.confidence * 100)}% match</span>` : ""}
          </div>
          <span class="media-size">${formatBytes(item.size)}</span>
        </div>
        <div class="media-title" title="${item.title || activeTab.title || item.url}">
          ${item.title || activeTab.title || "Web Media Stream"}
        </div>
        <div class="media-actions">
          <button class="btn-download-primary btn-dl-now">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <span>Download Turbo</span>
          </button>
          <button class="btn-download-sec btn-saveas-now">
            Save As...
          </button>
        </div>
      `;

      card.querySelector(".btn-dl-now").addEventListener("click", () => {
        chrome.runtime.sendMessage({
          type: "TRIGGER_DOWNLOAD",
          url: item.url,
          title: item.title || activeTab.title,
          tabId: activeTab.id,
          ext: isAudio ? "mp3" : (item.ext || "mp4"),
          category: isAudio ? "audio" : "video"
        });
        document.querySelector('[data-tab="tab-active"]').click();
      });

      card.querySelector(".btn-saveas-now").addEventListener("click", () => {
        chrome.runtime.sendMessage({
          type: "TRIGGER_DOWNLOAD",
          url: item.url,
          title: item.title || activeTab.title,
          tabId: activeTab.id,
          ext: isAudio ? "mp3" : (item.ext || "mp4"),
          category: isAudio ? "audio" : "video",
          saveAs: true
        });
        document.querySelector('[data-tab="tab-active"]').click();
      });

      listContainer.appendChild(card);
    });
  }

  // Search filter
  searchInput?.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      renderMediaList(currentDetectedItems);
      return;
    }
    const filtered = currentDetectedItems.filter(
      (item) =>
        (item.format && item.format.toLowerCase().includes(query)) ||
        (item.title && item.title.toLowerCase().includes(query)) ||
        (item.ext && item.ext.toLowerCase().includes(query))
    );
    renderMediaList(filtered);
  });

  // Batch Download All Detected
  batchBtn?.addEventListener("click", () => {
    if (currentDetectedItems.length === 0) return;
    const batchItems = currentDetectedItems.map((item) => ({
      url: item.url,
      title: item.title || activeTab.title,
      category: item.isAudio ? "audio" : "video",
      ext: item.isAudio ? "mp3" : (item.ext || "mp4")
    }));

    chrome.runtime.sendMessage({
      type: "TRIGGER_BATCH_DOWNLOAD",
      items: batchItems
    }, () => {
      document.querySelector('[data-tab="tab-active"]').click();
    });
  });

  refreshBtn?.addEventListener("click", () => {
    loadDetectedStreams();
  });

  loadDetectedStreams();

  // ================= TAB 2: LINKGRABBER (JDownloader Style) =================
  const btnScrapePage = document.getElementById("btn-scrape-page");
  const btnPasteClipboard = document.getElementById("btn-paste-clipboard");
  const grabberInput = document.getElementById("grabber-input");
  const btnParse = document.getElementById("btn-parse-links");
  const grabberChipsBar = document.getElementById("grabber-chips-bar");
  const grabberSelectRow = document.getElementById("grabber-select-row");
  const grabberListEl = document.getElementById("grabber-list");
  const grabberEmpty = document.getElementById("grabber-empty");
  const grabberFooterAction = document.getElementById("grabber-footer-action");
  const grabberToggleAll = document.getElementById("grabber-toggle-all");
  const grabberSelectionCount = document.getElementById("grabber-selection-count");
  const btnDownloadSelected = document.getElementById("btn-download-selected-grab");
  const btnDownloadSelectedText = document.getElementById("btn-download-selected-text");
  const badgeGrabberCount = document.getElementById("badge-grabber-count");

  let allGrabbedItems = [];
  let currentFilterCategory = "all";

  function populateGrabber(items) {
    allGrabbedItems = items.map((item, idx) => ({
      ...item,
      id: "grab_" + idx,
      selected: true
    }));

    updateGrabberUI();
  }

  function updateGrabberUI() {
    if (allGrabbedItems.length === 0) {
      grabberEmpty.style.display = "flex";
      grabberChipsBar.style.display = "none";
      grabberSelectRow.style.display = "none";
      grabberListEl.style.display = "none";
      grabberFooterAction.style.display = "none";
      badgeGrabberCount.style.display = "none";
      return;
    }

    grabberEmpty.style.display = "none";
    grabberChipsBar.style.display = "flex";
    grabberSelectRow.style.display = "flex";
    grabberListEl.style.display = "flex";
    grabberFooterAction.style.display = "flex";

    badgeGrabberCount.style.display = "inline-block";
    badgeGrabberCount.textContent = allGrabbedItems.length;

    // Update Counts on Filter Chips
    const countAll = allGrabbedItems.length;
    const countVideo = allGrabbedItems.filter((i) => i.category === "video").length;
    const countAudio = allGrabbedItems.filter((i) => i.category === "audio").length;
    const countImage = allGrabbedItems.filter((i) => i.category === "image").length;
    const countArchive = allGrabbedItems.filter((i) => i.category === "archive").length;

    document.getElementById("chip-count-all").textContent = countAll;
    document.getElementById("chip-count-video").textContent = countVideo;
    document.getElementById("chip-count-audio").textContent = countAudio;
    document.getElementById("chip-count-image").textContent = countImage;
    document.getElementById("chip-count-archive").textContent = countArchive;

    renderFilteredGrabberList();
  }

  function renderFilteredGrabberList() {
    grabberListEl.innerHTML = "";

    const visibleItems = currentFilterCategory === "all"
      ? allGrabbedItems
      : allGrabbedItems.filter((i) => i.category === currentFilterCategory);

    visibleItems.forEach((item) => {
      const card = document.createElement("div");
      card.className = "grabber-item-card";

      card.innerHTML = `
        <input type="checkbox" ${item.selected ? "checked" : ""} data-id="${item.id}">
        <div class="grabber-item-info">
          <div class="grabber-item-title" title="${item.url}">${item.title || item.url}</div>
          <div class="grabber-item-meta">
            <span class="grabber-cat-badge">${item.category}</span>
            <span>${item.domain || "web"}</span>
          </div>
        </div>
      `;

      card.querySelector('input[type="checkbox"]').addEventListener("change", (e) => {
        item.selected = e.target.checked;
        updateSelectionStatus();
      });

      grabberListEl.appendChild(card);
    });

    updateSelectionStatus();
  }

  function updateSelectionStatus() {
    const selectedCount = allGrabbedItems.filter((i) => i.selected).length;
    grabberSelectionCount.textContent = `${selectedCount} of ${allGrabbedItems.length} selected`;
    btnDownloadSelectedText.textContent = `⚡ Start Batch Download (${selectedCount} items)`;
    btnDownloadSelected.disabled = selectedCount === 0;

    grabberToggleAll.checked = selectedCount === allGrabbedItems.length && allGrabbedItems.length > 0;
  }

  // Filter Chip Click
  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      currentFilterCategory = chip.getAttribute("data-category");
      renderFilteredGrabberList();
    });
  });

  // Select All Toggle
  grabberToggleAll?.addEventListener("change", (e) => {
    const checked = e.target.checked;
    const targetItems = currentFilterCategory === "all"
      ? allGrabbedItems
      : allGrabbedItems.filter((i) => i.category === currentFilterCategory);

    targetItems.forEach((i) => (i.selected = checked));
    renderFilteredGrabberList();
  });

  // Scrape Page Links
  btnScrapePage?.addEventListener("click", () => {
    btnScrapePage.textContent = "Scraping...";
    chrome.tabs.sendMessage(activeTab.id, { type: "SCRAPE_PAGE_LINKS" }, (response) => {
      btnScrapePage.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
        <span>Scrape Current Page</span>
      `;
      if (response && response.links && response.links.length > 0) {
        populateGrabber(response.links);
      } else {
        // Fallback: parse page HTML via text parser
        chrome.runtime.sendMessage({
          type: "PARSE_BATCH_TEXT",
          rawText: activeTab.url
        }, (res) => {
          if (res?.items) populateGrabber(res.items);
        });
      }
    });
  });

  // Paste Clipboard
  btnPasteClipboard?.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        grabberInput.value = text;
        chrome.runtime.sendMessage({ type: "PARSE_BATCH_TEXT", rawText: text }, (res) => {
          if (res?.items) populateGrabber(res.items);
        });
      }
    } catch (e) {
      grabberInput.focus();
    }
  });

  // Manual Parse Button
  btnParse?.addEventListener("click", () => {
    const text = grabberInput.value.trim();
    if (text) {
      chrome.runtime.sendMessage({ type: "PARSE_BATCH_TEXT", rawText: text }, (res) => {
        if (res?.items) populateGrabber(res.items);
      });
    }
  });

  // Execute Batch Download
  btnDownloadSelected?.addEventListener("click", () => {
    const selected = allGrabbedItems.filter((i) => i.selected);
    if (selected.length === 0) return;

    chrome.runtime.sendMessage({
      type: "TRIGGER_BATCH_DOWNLOAD",
      items: selected
    }, () => {
      document.querySelector('[data-tab="tab-active"]').click();
    });
  });

  // ================= TAB 3: ACTIVE DOWNLOADS & SPEEDOMETER =================
  const activeListContainer = document.getElementById("active-list");
  const activeEmptyContainer = document.getElementById("active-empty");
  const activeBadge = document.getElementById("badge-active-count");
  const speedoOverview = document.getElementById("speedo-overview");
  const hudTotalSpeed = document.getElementById("hud-total-speed");
  const hudTotalUnit = document.getElementById("hud-total-unit");
  const hudThreadsText = document.getElementById("hud-threads-text");

  function updateActiveAndHistory() {
    chrome.runtime.sendMessage({ type: "GET_ACTIVE_DOWNLOADS" }, (response) => {
      if (!response) return;

      const activeList = response.activeDownloads?.filter(
        (d) => d.state === "in_progress" || d.state === "paused"
      ) || [];
      const historyList = response.history || [];

      // Update badge
      if (activeList.length > 0) {
        activeBadge.style.display = "inline-block";
        activeBadge.textContent = activeList.length;
      } else {
        activeBadge.style.display = "none";
      }

      // Calculate aggregated speed
      let totalSpeedBytes = 0;
      activeList.forEach((d) => {
        if (d.speed) totalSpeedBytes += d.speed;
      });

      const sp = formatSpeed(totalSpeedBytes);
      hudTotalSpeed.textContent = sp.val;
      hudTotalUnit.textContent = sp.unit;

      if (activeList.length > 0) {
        speedoOverview.style.display = "flex";
        activeListContainer.style.display = "flex";
        activeEmptyContainer.style.display = "none";
        activeListContainer.innerHTML = "";

        activeList.forEach((item) => {
          const card = document.createElement("div");
          card.className = "active-download-card";

          const itemSpeed = formatSpeed(item.speed);
          const isPaused = item.state === "paused";

          card.innerHTML = `
            <div class="media-title" title="${item.title}">${item.title}</div>
            <div class="download-stat-row">
              <span class="stat-speed">⚡ ${itemSpeed.val} ${itemSpeed.unit}</span>
              <span class="stat-progress-val">${formatBytes(item.receivedBytes)} / ${formatBytes(item.totalBytes)} (${item.progress}%)</span>
            </div>
            <div class="card-progress-track">
              <div class="card-progress-fill" style="width: ${item.progress}%"></div>
            </div>
            <div class="active-card-actions">
              <button class="btn-ctrl btn-toggle-pause">${isPaused ? "Resume ▶" : "Pause ⏸"}</button>
              <button class="btn-ctrl btn-cancel-item">Cancel ✕</button>
            </div>
          `;

          card.querySelector(".btn-toggle-pause").addEventListener("click", () => {
            if (isPaused) {
              chrome.runtime.sendMessage({ type: "RESUME_DOWNLOAD", downloadId: item.downloadId });
            } else {
              chrome.runtime.sendMessage({ type: "PAUSE_DOWNLOAD", downloadId: item.downloadId });
            }
          });

          card.querySelector(".btn-cancel-item").addEventListener("click", () => {
            chrome.runtime.sendMessage({ type: "CANCEL_DOWNLOAD", downloadId: item.downloadId });
          });

          activeListContainer.appendChild(card);
        });
      } else {
        speedoOverview.style.display = "none";
        activeListContainer.style.display = "none";
        activeEmptyContainer.style.display = "flex";
      }

      // TAB 4: HISTORY
      const historyListContainer = document.getElementById("history-list");
      const historyEmptyContainer = document.getElementById("history-empty");
      const historyTopBar = document.getElementById("history-top-bar");

      if (historyList.length > 0) {
        historyTopBar.style.display = "flex";
        historyListContainer.style.display = "flex";
        historyEmptyContainer.style.display = "none";
        historyListContainer.innerHTML = "";

        historyList.forEach((item) => {
          const card = document.createElement("div");
          card.className = "media-card";

          card.innerHTML = `
            <div class="media-header">
              <span class="media-badge">COMPLETED</span>
              <span class="media-size">${formatBytes(item.totalBytes)}</span>
            </div>
            <div class="media-title" title="${item.title}">${item.title}</div>
            <div class="media-actions">
              <button class="btn-download-sec btn-open-file" style="flex: 2;">Open File</button>
              <button class="btn-download-sec btn-show-folder" style="flex: 1;">Folder</button>
            </div>
          `;

          card.querySelector(".btn-open-file").addEventListener("click", () => {
            chrome.runtime.sendMessage({ type: "OPEN_DOWNLOAD", downloadId: item.id });
          });
          card.querySelector(".btn-show-folder").addEventListener("click", () => {
            chrome.runtime.sendMessage({ type: "SHOW_IN_FOLDER", downloadId: item.id });
          });

          historyListContainer.appendChild(card);
        });
      } else {
        historyTopBar.style.display = "none";
        historyListContainer.style.display = "none";
        historyEmptyContainer.style.display = "flex";
      }
    });
  }

  updateActiveAndHistory();
  const pollTimer = setInterval(updateActiveAndHistory, 700);
  window.addEventListener("unload", () => clearInterval(pollTimer));

  // Clear History
  document.getElementById("btn-clear-history")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "GET_ACTIVE_DOWNLOADS" }, (res) => {
      if (res?.history) res.history.length = 0;
      updateActiveAndHistory();
    });
  });

  // ================= TAB 5: SETTINGS =================
  const settingThreads = document.getElementById("setting-threads");
  const settingSorting = document.getElementById("setting-sorting");
  const settingAskFolder = document.getElementById("setting-ask-folder");
  const settingFloatingBtn = document.getElementById("setting-floating-btn");

  chrome.storage.local.get({
    parallelChunks: 8,
    smartSorting: true,
    askFolder: false,
    floatingButton: true
  }, (data) => {
    settingThreads.value = data.parallelChunks;
    settingSorting.checked = data.smartSorting;
    settingAskFolder.checked = data.askFolder;
    settingFloatingBtn.checked = data.floatingButton;

    hudThreadsText.textContent = `${data.parallelChunks} Threads Segmented`;
  });

  settingThreads.addEventListener("change", () => {
    const val = parseInt(settingThreads.value, 10);
    chrome.storage.local.set({ parallelChunks: val });
    hudThreadsText.textContent = `${val} Threads Segmented`;
  });

  settingSorting.addEventListener("change", () => {
    chrome.storage.local.set({ smartSorting: settingSorting.checked });
  });

  settingAskFolder.addEventListener("change", () => {
    chrome.storage.local.set({ askFolder: settingAskFolder.checked });
  });

  settingFloatingBtn.addEventListener("change", () => {
    chrome.storage.local.set({ floatingButton: settingFloatingBtn.checked });
  });
});
