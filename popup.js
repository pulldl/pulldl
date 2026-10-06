// PullDL Popup Dashboard Logic

document.addEventListener("DOMContentLoaded", async () => {
  // Navigation Tabs
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

  // Format Helper
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "Unknown Size";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec === 0) return "0 KB/s";
    if (bytesPerSec > 1024 * 1024) {
      return (bytesPerSec / (1024 * 1024)).toFixed(1) + " MB/s";
    }
    return Math.round(bytesPerSec / 1024) + " KB/s";
  }

  // 1. Load Detected Media for Current Active Tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) {
    chrome.runtime.sendMessage({ type: "GET_TAB_MEDIA", tabId: activeTab.id }, (response) => {
      const mediaList = response?.media || [];
      const countBadge = document.getElementById("badge-detected-count");
      const listContainer = document.getElementById("detected-list");
      const emptyContainer = document.getElementById("detected-empty");

      countBadge.textContent = mediaList.length;

      if (mediaList.length > 0) {
        listContainer.style.display = "flex";
        emptyContainer.style.display = "none";
        listContainer.innerHTML = "";

        mediaList.forEach((item) => {
          const card = document.createElement("div");
          card.className = "media-card";

          const isAudio = item.format === "MP3" || item.mimeType.includes("audio");

          card.innerHTML = `
            <div class="media-header">
              <span class="media-badge ${isAudio ? "audio" : ""}">${item.format}</span>
              <span class="media-size">${formatBytes(item.size)}</span>
            </div>
            <div class="media-title" title="${activeTab.title || item.url}">
              ${activeTab.title || "Video Stream"}
            </div>
            <div class="media-actions">
              <button class="btn-download-primary" data-url="${item.url}" data-format="${item.format}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Download Turbo
              </button>
              <button class="btn-download-sec" data-url="${item.url}" data-saveas="true">
                Save As...
              </button>
            </div>
          `;

          // Bind download actions
          card.querySelector(".btn-download-primary").addEventListener("click", () => {
            chrome.runtime.sendMessage({
              type: "TRIGGER_DOWNLOAD",
              url: item.url,
              title: activeTab.title,
              tabId: activeTab.id,
              format: item.format,
              category: isAudio ? "audio" : "video"
            });
            // Switch to Active Downloads Tab
            document.querySelector('[data-tab="tab-active"]').click();
          });

          card.querySelector(".btn-download-sec").addEventListener("click", () => {
            chrome.runtime.sendMessage({
              type: "TRIGGER_DOWNLOAD",
              url: item.url,
              title: activeTab.title,
              tabId: activeTab.id,
              format: item.format,
              category: isAudio ? "audio" : "video",
              saveAs: true
            });
            document.querySelector('[data-tab="tab-active"]').click();
          });

          listContainer.appendChild(card);
        });
      } else {
        listContainer.style.display = "none";
        emptyContainer.style.display = "flex";
      }
    });
  }

  // 2. Poll & Render Active Downloads and History
  function updateDownloadsAndHistory() {
    chrome.runtime.sendMessage({ type: "GET_ACTIVE_DOWNLOADS" }, (response) => {
      if (!response) return;

      const activeList = response.activeDownloads?.filter((d) => d.state === "in_progress" || d.state === "paused") || [];
      const historyList = response.history || [];

      // Update badge
      const activeBadge = document.getElementById("badge-active-count");
      if (activeList.length > 0) {
        activeBadge.style.display = "inline-block";
        activeBadge.textContent = activeList.length;
      } else {
        activeBadge.style.display = "none";
      }

      // Render Active
      const activeContainer = document.getElementById("active-list");
      const activeEmpty = document.getElementById("active-empty");

      if (activeList.length > 0) {
        activeContainer.style.display = "flex";
        activeEmpty.style.display = "none";
        activeContainer.innerHTML = "";

        activeList.forEach((item) => {
          const card = document.createElement("div");
          card.className = "active-download-card";

          card.innerHTML = `
            <div class="media-title" title="${item.title}">${item.title}</div>
            <div class="download-stat-row">
              <span class="stat-speed">⚡ ${formatSpeed(item.speed)}</span>
              <span class="stat-progress-val">${formatBytes(item.receivedBytes)} / ${formatBytes(item.totalBytes)} (${item.progress}%)</span>
            </div>
            <div class="card-progress-track">
              <div class="card-progress-fill" style="width: ${item.progress}%"></div>
            </div>
          `;
          activeContainer.appendChild(card);
        });
      } else {
        activeContainer.style.display = "none";
        activeEmpty.style.display = "flex";
      }

      // Render History
      const historyContainer = document.getElementById("history-list");
      const historyEmpty = document.getElementById("history-empty");

      if (historyList.length > 0) {
        historyContainer.style.display = "flex";
        historyEmpty.style.display = "none";
        historyContainer.innerHTML = "";

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
              <button class="btn-download-sec btn-open-file" style="flex: 1;">Open File</button>
              <button class="btn-download-sec btn-show-folder">Folder</button>
            </div>
          `;

          card.querySelector(".btn-open-file").addEventListener("click", () => {
            chrome.runtime.sendMessage({ type: "OPEN_DOWNLOAD", downloadId: item.id });
          });
          card.querySelector(".btn-show-folder").addEventListener("click", () => {
            chrome.runtime.sendMessage({ type: "SHOW_IN_FOLDER", downloadId: item.id });
          });

          historyContainer.appendChild(card);
        });
      } else {
        historyContainer.style.display = "none";
        historyEmpty.style.display = "flex";
      }
    });
  }

  // Initial update + interval
  updateDownloadsAndHistory();
  const pollInterval = setInterval(updateDownloadsAndHistory, 1000);
  window.addEventListener("unload", () => clearInterval(pollInterval));

  // 3. Settings Synchronization
  const settingThreads = document.getElementById("setting-threads");
  const settingSorting = document.getElementById("setting-sorting");
  const settingAskFolder = document.getElementById("setting-ask-folder");
  const settingFloatingBtn = document.getElementById("setting-floating-btn");

  // Load saved settings
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
  });

  // Save changes
  settingThreads.addEventListener("change", () => {
    chrome.storage.local.set({ parallelChunks: parseInt(settingThreads.value, 10) });
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
