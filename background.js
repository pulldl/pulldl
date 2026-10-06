// PullDL Background Engine — Service Worker (Manifest V3)
// Features: Universal Media Sniffer, Tab Media Registry, Telemetry Engine, Smart Folder Routing

const tabMediaMap = new Map(); // tabId -> Array of Media objects
const activeDownloadsMap = new Map(); // downloadId -> Telemetry state
const downloadHistory = []; // Recent completed downloads

// Default Settings
const DEFAULT_SETTINGS = {
  askFolder: false,
  smartSorting: true,
  parallelChunks: 8,
  floatingButton: true,
  autoSniff: true
};

// Initialize settings
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
    chrome.storage.local.set(stored);
  });

  // Context Menu
  chrome.contextMenus.create({
    id: "pulldl-download-target",
    title: "Download with PullDL (Turbo)",
    contexts: ["link", "video", "audio"]
  });
});

// Context Menu Action
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const targetUrl = info.srcUrl || info.linkUrl;
  if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
    initiateDownload({
      url: targetUrl,
      title: tab?.title || "Media_File",
      tabId: tab?.id,
      category: info.mediaType === "audio" ? "audio" : "video"
    });
  }
});

// Media MIME types and file extensions regex
const MEDIA_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-matroska",
  "video/x-flv",
  "video/3gpp",
  "video/mp2t",
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/dash+xml",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/wav",
  "audio/aac",
  "audio/flac",
  "audio/m4a"
];

const MEDIA_URL_REGEX = /\.(mp4|webm|mkv|flv|m4v|mov|3gp|m3u8|mpd|mp3|aac|flac|wav|m4a)(\?.*)?$/i;

// Clean filename helper
function sanitizeFilename(name) {
  if (!name) return "PullDL_Media_" + Date.now();
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 120);
}

// 1. Universal Network Media Sniffer
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return; // Ignore background/extension requests

    const url = details.url;
    if (url.includes("google-analytics.com") || url.includes("doubleclick.net")) return;

    let mimeType = "";
    let contentLength = 0;

    if (details.responseHeaders) {
      for (const header of details.responseHeaders) {
        const name = header.name.toLowerCase();
        if (name === "content-type") {
          mimeType = header.value.toLowerCase().split(";")[0].trim();
        } else if (name === "content-length") {
          contentLength = parseInt(header.value, 10) || 0;
        }
      }
    }

    const isMediaMime = MEDIA_MIME_TYPES.some((type) => mimeType.includes(type));
    const isMediaUrl = MEDIA_URL_REGEX.test(url);

    // Filter out very small chunks (< 80KB) unless it's an HLS/DASH manifest
    const isManifest = url.includes(".m3u8") || url.includes(".mpd") || mimeType.includes("mpegurl");
    if (!isManifest && contentLength > 0 && contentLength < 80 * 1024) {
      return;
    }

    if (isMediaMime || isMediaUrl) {
      registerDetectedMedia(details.tabId, {
        url: url,
        mimeType: mimeType || "video/mp4",
        size: contentLength,
        isStream: isManifest,
        detectedAt: Date.now()
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// Register detected media for a tab
function registerDetectedMedia(tabId, mediaItem) {
  if (!tabMediaMap.has(tabId)) {
    tabMediaMap.set(tabId, []);
  }

  const list = tabMediaMap.get(tabId);
  // Avoid duplicate URLs on the same tab
  if (list.some((item) => item.url === mediaItem.url)) {
    return;
  }

  // Derive format from URL or MIME
  let format = "MP4";
  if (mediaItem.url.includes(".m3u8") || mediaItem.mimeType.includes("mpegurl")) format = "HLS (m3u8)";
  else if (mediaItem.url.includes(".mpd")) format = "DASH";
  else if (mediaItem.mimeType.includes("audio") || mediaItem.url.includes(".mp3")) format = "MP3";
  else if (mediaItem.url.includes(".webm")) format = "WEBM";

  mediaItem.id = "media_" + Math.random().toString(36).substring(2, 9);
  mediaItem.format = format;

  list.push(mediaItem);

  // Update extension badge count
  chrome.action.setBadgeText({ text: list.length.toString(), tabId });
  chrome.action.setBadgeBackgroundColor({ color: "#00C853", tabId });

  // Notify content script on the tab
  chrome.tabs.sendMessage(tabId, {
    type: "MEDIA_DETECTED",
    media: mediaItem,
    totalCount: list.length
  }).catch(() => {
    // Content script might not be injected or ready yet; safe to ignore
  });
}

// Clean up tab data when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabMediaMap.delete(tabId);
});

// 2. Download Initiation with Smart Folder Routing
async function initiateDownload({ url, title, tabId, category = "video", format = "mp4", saveAs = false }) {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const cleanTitle = sanitizeFilename(title);

  let ext = format.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!ext || ext.includes("hls") || ext.includes("m3u8")) ext = "mp4";

  // Smart folder routing
  let targetPath = "";
  if (settings.smartSorting) {
    if (category === "audio" || ext === "mp3" || ext === "wav" || ext === "aac") {
      targetPath = `PullDL/Music/${cleanTitle}.${ext}`;
    } else {
      targetPath = `PullDL/Videos/${cleanTitle}.${ext}`;
    }
  } else {
    targetPath = `PullDL/${cleanTitle}.${ext}`;
  }

  const shouldAsk = saveAs || settings.askFolder;

  try {
    const downloadId = await chrome.downloads.download({
      url: url,
      filename: targetPath,
      saveAs: shouldAsk,
      conflictAction: "uniquify"
    });

    activeDownloadsMap.set(downloadId, {
      downloadId,
      url,
      title: cleanTitle,
      filename: targetPath,
      startTime: Date.now(),
      lastTime: Date.now(),
      lastBytes: 0,
      speed: 0,
      progress: 0,
      totalBytes: 0,
      receivedBytes: 0,
      state: "in_progress",
      tabId
    });

    // Notify tab HUD that download has started
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: "DOWNLOAD_STARTED",
        downloadId,
        title: cleanTitle,
        filename: targetPath
      }).catch(() => {});
    }

    return downloadId;
  } catch (err) {
    console.error("PullDL Download failed:", err);
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: "DOWNLOAD_ERROR",
        error: err.message
      }).catch(() => {});
    }
  }
}

// 3. Real-time Download Telemetry & Speed Calculations
chrome.downloads.onChanged.addListener((delta) => {
  const item = activeDownloadsMap.get(delta.id);
  if (!item) return;

  const now = Date.now();

  if (delta.bytesReceived) {
    const received = delta.bytesReceived.current;
    const timeDiff = (now - item.lastTime) / 1000;

    if (timeDiff >= 0.5) { // update speed every 500ms
      const bytesDiff = received - item.lastBytes;
      item.speed = Math.max(0, Math.round(bytesDiff / timeDiff)); // bytes/sec
      item.lastBytes = received;
      item.lastTime = now;
    }

    item.receivedBytes = received;
  }

  if (delta.totalBytes && delta.totalBytes.current > 0) {
    item.totalBytes = delta.totalBytes.current;
  }

  if (item.totalBytes > 0) {
    item.progress = Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100));
    const remainingBytes = Math.max(0, item.totalBytes - item.receivedBytes);
    item.eta = item.speed > 0 ? Math.ceil(remainingBytes / item.speed) : 0;
  }

  if (delta.state) {
    item.state = delta.state.current;
    if (delta.state.current === "complete") {
      item.progress = 100;
      item.speed = 0;
      downloadHistory.unshift({
        id: item.downloadId,
        title: item.title,
        filename: item.filename,
        totalBytes: item.receivedBytes,
        completedAt: Date.now()
      });
      if (downloadHistory.length > 50) downloadHistory.pop();
    }
  }

  if (delta.paused) {
    item.state = delta.paused.current ? "paused" : "in_progress";
  }

  // Broadcast to current tab and runtime listeners
  if (item.tabId) {
    chrome.tabs.sendMessage(item.tabId, {
      type: "DOWNLOAD_PROGRESS",
      data: {
        downloadId: item.downloadId,
        title: item.title,
        receivedBytes: item.receivedBytes,
        totalBytes: item.totalBytes,
        progress: item.progress,
        speed: item.speed,
        eta: item.eta,
        state: item.state
      }
    }).catch(() => {});
  }
});

// 4. Message Router (Content script & Popup communication)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender?.tab?.id || message.tabId;

  switch (message.type) {
    case "GET_TAB_MEDIA": {
      const mediaList = tabMediaMap.get(tabId) || [];
      sendResponse({ media: mediaList });
      break;
    }

    case "DOM_MEDIA_FOUND": {
      // Received from content script scanning <video> tags
      if (message.media && tabId) {
        registerDetectedMedia(tabId, message.media);
      }
      sendResponse({ success: true });
      break;
    }

    case "TRIGGER_DOWNLOAD": {
      initiateDownload({
        url: message.url,
        title: message.title || sender?.tab?.title,
        tabId: tabId,
        category: message.category || "video",
        format: message.format || "mp4",
        saveAs: message.saveAs || false
      }).then((downloadId) => {
        sendResponse({ downloadId });
      });
      return true; // async response
    }

    case "PAUSE_DOWNLOAD": {
      chrome.downloads.pause(message.downloadId, () => sendResponse({ success: true }));
      return true;
    }

    case "RESUME_DOWNLOAD": {
      chrome.downloads.resume(message.downloadId, () => sendResponse({ success: true }));
      return true;
    }

    case "CANCEL_DOWNLOAD": {
      chrome.downloads.cancel(message.downloadId, () => sendResponse({ success: true }));
      return true;
    }

    case "OPEN_DOWNLOAD": {
      chrome.downloads.open(message.downloadId);
      sendResponse({ success: true });
      break;
    }

    case "SHOW_IN_FOLDER": {
      chrome.downloads.show(message.downloadId);
      sendResponse({ success: true });
      break;
    }

    case "GET_ACTIVE_DOWNLOADS": {
      const activeList = Array.from(activeDownloadsMap.values());
      sendResponse({ activeDownloads: activeList, history: downloadHistory });
      break;
    }

    default:
      break;
  }
});
