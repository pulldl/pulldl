// PullDL Background Service Worker (Universal Studio Engine v3.0.0)
// Implements: 7-Layer Media Registry, Side Panel Controller, Queue Management, JDownloader Batch LinkGrabber, Telemetry Engine

const tabMediaMap = new Map(); // tabId -> Array of Media objects
const activeDownloadsMap = new Map(); // downloadId -> Telemetry state
const downloadHistory = []; // Recent completed downloads
const downloadQueue = []; // Queued download tasks
const speedSamples = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // 12-sample speed sparkline

const DEFAULT_SETTINGS = {
  askFolder: false,
  smartSorting: true,
  concurrencyMode: "8", // 4, 8, 16
  floatingButton: true,
  autoSniff: true,
  uiMode: "simple", // simple or advanced
  preferredQuality: "best",
  preferredFormat: "mp4"
};

// 1. Initialize settings, Side Panel & Context Menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
    chrome.storage.local.set(stored);
  });

  // Enable Side Panel API behavior
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  }

  // Organized Context Menus
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "pulldl-root",
      title: "Download with PullDL",
      contexts: ["page", "link", "video", "audio", "selection"]
    });

    chrome.contextMenus.create({
      id: "pulldl-download-action",
      parentId: "pulldl-root",
      title: "⚡ Download media / link",
      contexts: ["link", "video", "audio"]
    });

    chrome.contextMenus.create({
      id: "pulldl-grab-page-links",
      parentId: "pulldl-root",
      title: "📋 Grab all page links",
      contexts: ["page", "selection"]
    });

    chrome.contextMenus.create({
      id: "pulldl-open-center",
      parentId: "pulldl-root",
      title: "◈ Open Download Center (Side Panel)",
      contexts: ["page", "link", "video", "audio", "selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "pulldl-download-action") {
    const targetUrl = info.srcUrl || info.linkUrl || tab?.url;
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      initiateDownload({
        url: targetUrl,
        title: tab?.title || "Media_File",
        tabId: tab?.id,
        category: info.mediaType === "audio" ? "audio" : "video"
      });
    }
  } else if (info.menuItemId === "pulldl-grab-page-links") {
    chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_PAGE_LINKGRAB" }).catch(() => {});
  } else if (info.menuItemId === "pulldl-open-center") {
    if (chrome.sidePanel?.open && tab?.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }
  }
});

function sanitizeFilename(name, fallbackExt = "mp4") {
  if (!name) return "PullDL_Media_" + Date.now() + "." + fallbackExt;
  let clean = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 110);
  if (!clean.toLowerCase().endsWith("." + fallbackExt)) {
    clean += "." + fallbackExt;
  }
  return clean;
}

// 2. Layer 5: Cloud API Stream Resolver
async function resolveMediaFormatsViaApi(pageUrl) {
  try {
    const response = await fetch("https://pulldl.com/api/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PullDL-Universal-Extension/3.0.0"
      },
      body: JSON.stringify({ url: pageUrl })
    });

    if (!response.ok) {
      throw new Error(`Extraction service returned HTTP ${response.status}`);
    }

    const json = await response.json();
    if (json.success && json.data) {
      return json.data;
    }
    throw new Error(json.detail || "Unable to extract stream metadata.");
  } catch (err) {
    console.error("PullDL API Resolver Error:", err);
    throw err;
  }
}

// 3. Layer 4: WebRequest Stream Sniffer
const MEDIA_MIME_TYPES = [
  "video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-matroska",
  "application/vnd.apple.mpegurl", "application/x-mpegurl", "application/dash+xml",
  "audio/mpeg", "audio/mp3", "audio/ogg", "audio/wav", "audio/aac", "audio/flac"
];

const MEDIA_URL_REGEX = /\.(mp4|webm|mkv|m4v|mov|m3u8|mpd|mp3|aac|flac|wav|m4a)(\?.*)?$/i;

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const url = details.url;

    if (url.includes("google-analytics.com") || url.includes("doubleclick.net") || url.includes("/telemetry/")) return;

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
    const isManifest = url.includes(".m3u8") || url.includes(".mpd") || mimeType.includes("mpegurl");

    if (!isManifest && contentLength > 0 && contentLength < 120 * 1024) return;

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

function registerDetectedMedia(tabId, mediaItem) {
  if (!tabMediaMap.has(tabId)) {
    tabMediaMap.set(tabId, []);
  }

  const list = tabMediaMap.get(tabId);
  if (list.some((item) => item.url === mediaItem.url)) return;

  let format = "MP4";
  if (mediaItem.url.includes(".m3u8") || mediaItem.mimeType.includes("mpegurl")) format = "HLS Stream";
  else if (mediaItem.url.includes(".mpd")) format = "DASH Stream";
  else if (mediaItem.mimeType.includes("audio") || mediaItem.url.includes(".mp3")) format = "MP3";
  else if (mediaItem.url.includes(".webm")) format = "WEBM";

  mediaItem.id = "media_" + Math.random().toString(36).substring(2, 9);
  mediaItem.format = format;
  list.push(mediaItem);

  chrome.action.setBadgeText({ text: list.length.toString(), tabId });
  chrome.action.setBadgeBackgroundColor({ color: "#2563eb", tabId });

  chrome.tabs.sendMessage(tabId, {
    type: "MEDIA_SNIFFED",
    media: mediaItem,
    totalCount: list.length
  }).catch(() => {});
}

chrome.tabs.onRemoved.addListener((tabId) => tabMediaMap.delete(tabId));

// 4. Initiate High-Speed Download (IDM-Grade Multi-Surface Engine)
let telemetryInterval = null;

function broadcastTelemetry(type, data) {
  // 1. Send to extension views (side panel, popup)
  chrome.runtime.sendMessage({ type, data }).catch(() => {});

  // 2. Broadcast to all active tabs (for the in-page IDM status window)
  chrome.tabs.query({}, (tabs) => {
    if (tabs && tabs.length > 0) {
      tabs.forEach((t) => {
        if (t.id) {
          chrome.tabs.sendMessage(t.id, { type, data }).catch(() => {});
        }
      });
    }
  });
}

function startTelemetryLoop() {
  if (telemetryInterval) return;
  telemetryInterval = setInterval(pollActiveDownloads, 350);
}

function stopTelemetryLoopIfEmpty() {
  let hasActive = false;
  for (const d of activeDownloadsMap.values()) {
    if (d.state === "in_progress") {
      hasActive = true;
      break;
    }
  }
  if (!hasActive && telemetryInterval) {
    clearInterval(telemetryInterval);
    telemetryInterval = null;
  }
}

async function pollActiveDownloads() {
  if (activeDownloadsMap.size === 0) {
    stopTelemetryLoopIfEmpty();
    return;
  }

  const now = Date.now();
  let currentTotalSpeed = 0;

  for (const [id, item] of activeDownloadsMap.entries()) {
    if (item.state !== "in_progress") continue;

    try {
      const items = await chrome.downloads.search({ id });
      if (!items || items.length === 0) continue;
      const dl = items[0];

      const received = dl.bytesReceived || 0;
      const timeDiff = Math.max(0.1, (now - item.lastTime) / 1000);

      if (timeDiff >= 0.25) {
        const bytesDiff = Math.max(0, received - item.lastBytes);
        const instantSpeed = Math.round(bytesDiff / timeDiff);
        // Exponential moving average for smooth, realistic transfer rate
        item.speed = item.speed > 0 ? Math.round(0.75 * instantSpeed + 0.25 * item.speed) : instantSpeed;
        item.lastBytes = received;
        item.lastTime = now;
      }

      item.receivedBytes = received;
      if (dl.totalBytes && dl.totalBytes > 0) {
        item.totalBytes = dl.totalBytes;
      }

      if (item.totalBytes > 0) {
        item.progress = Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100));
        const remaining = Math.max(0, item.totalBytes - item.receivedBytes);
        item.eta = item.speed > 0 ? Math.ceil(remaining / item.speed) : 0;
      } else if (item.receivedBytes > 0) {
        // Fallback estimate for chunked streams without Content-Length
        item.progress = Math.min(95, Math.round((item.receivedBytes / (item.receivedBytes + 4 * 1024 * 1024)) * 100));
      }

      if (dl.state) {
        item.state = dl.state;
      }
      if (dl.paused) {
        item.state = "paused";
      }

      if (item.state === "complete") {
        item.progress = 100;
        item.speed = 0;
        item.eta = 0;
        finalizeDownload(item);
      } else {
        broadcastTelemetry("DOWNLOAD_PROGRESS", {
          downloadId: item.downloadId,
          title: item.title,
          filename: item.filename,
          url: item.url,
          category: item.category,
          ext: item.ext,
          receivedBytes: item.receivedBytes,
          totalBytes: item.totalBytes,
          progress: item.progress,
          speed: item.speed,
          eta: item.eta,
          state: item.state
        });
      }

      currentTotalSpeed += item.speed;
    } catch (e) {}
  }

  speedSamples.shift();
  speedSamples.push(currentTotalSpeed);
}

function finalizeDownload(item) {
  downloadHistory.unshift({
    id: item.downloadId,
    title: item.title,
    filename: item.filename,
    url: item.url,
    category: item.category,
    ext: item.ext,
    totalBytes: item.receivedBytes || item.totalBytes,
    completedAt: Date.now()
  });
  if (downloadHistory.length > 50) downloadHistory.pop();

  broadcastTelemetry("DOWNLOAD_COMPLETE", {
    downloadId: item.downloadId,
    title: item.title,
    filename: item.filename,
    receivedBytes: item.receivedBytes,
    totalBytes: item.receivedBytes,
    progress: 100,
    speed: 0,
    eta: 0,
    state: "complete"
  });

  stopTelemetryLoopIfEmpty();
}

async function initiateDownload({ url, title, tabId, category = "video", ext = "mp4", filesize = 0, totalBytes = 0, saveAs = false }) {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const cleanFilename = sanitizeFilename(title, ext);

  let targetPath = "";
  if (settings.smartSorting) {
    if (category === "audio" || ext.toLowerCase() === "mp3") {
      targetPath = `PullDL/Music/${cleanFilename}`;
    } else if (category === "archive") {
      targetPath = `PullDL/Archives/${cleanFilename}`;
    } else {
      targetPath = `PullDL/Videos/${cleanFilename}`;
    }
  } else {
    targetPath = `PullDL/${cleanFilename}`;
  }

  const shouldAsk = saveAs || settings.askFolder;
  const initialSize = Number(filesize || totalBytes || 0);

  try {
    const downloadId = await chrome.downloads.download({
      url: url,
      filename: targetPath,
      saveAs: shouldAsk,
      conflictAction: "uniquify"
    });

    const newItem = {
      downloadId,
      url,
      title: title || cleanFilename,
      filename: targetPath,
      category,
      ext,
      startTime: Date.now(),
      lastTime: Date.now(),
      lastBytes: 0,
      speed: 0,
      progress: 0,
      totalBytes: initialSize,
      receivedBytes: 0,
      state: "in_progress",
      tabId
    };

    activeDownloadsMap.set(downloadId, newItem);
    startTelemetryLoop();

    broadcastTelemetry("DOWNLOAD_STARTED", {
      downloadId,
      title: title || cleanFilename,
      filename: targetPath,
      totalBytes: initialSize,
      progress: 0,
      speed: 0,
      state: "in_progress"
    });

    return downloadId;
  } catch (err) {
    console.error("PullDL Download Dispatch Failed:", err);
    broadcastTelemetry("DOWNLOAD_ERROR", {
      error: err.message,
      title: title || cleanFilename
    });
    throw err;
  }
}

// 5. Real-time Telemetry & State Changes
chrome.downloads.onChanged.addListener((delta) => {
  const item = activeDownloadsMap.get(delta.id);
  if (!item) return;

  if (delta.totalBytes && delta.totalBytes.current > 0) {
    item.totalBytes = delta.totalBytes.current;
  }

  if (delta.bytesReceived) {
    item.receivedBytes = delta.bytesReceived.current;
  }

  if (delta.state) {
    item.state = delta.state.current;
    if (delta.state.current === "complete") {
      item.progress = 100;
      item.speed = 0;
      finalizeDownload(item);
      return;
    } else if (delta.state.current === "interrupted") {
      broadcastTelemetry("DOWNLOAD_ERROR", {
        downloadId: item.downloadId,
        error: "Download interrupted by network or server.",
        title: item.title
      });
      stopTelemetryLoopIfEmpty();
    }
  }

  if (delta.paused) {
    item.state = delta.paused.current ? "paused" : "in_progress";
  }
});

// 6. LinkGrabber URL Parser
function parseLinksFromText(rawText) {
  const urlRegex = /https?:\/\/[^\s"'<>()[\]{}]+/gi;
  const matches = rawText.match(urlRegex) || [];
  const uniqueUrls = Array.from(new Set(matches));

  return uniqueUrls.map((u) => {
    const cleanUrl = u.replace(/[.,;!]+$/, "");
    let category = "file";
    if (/\.(mp4|webm|mkv|mov|flv|m4v)/i.test(cleanUrl)) category = "video";
    else if (/\.(mp3|wav|flac|aac|m4a|ogg)/i.test(cleanUrl)) category = "audio";
    else if (/\.(jpg|jpeg|png|webp|gif)/i.test(cleanUrl)) category = "image";
    else if (/\.(zip|rar|7z|tar|gz)/i.test(cleanUrl)) category = "archive";
    else if (/youtube\.com|youtu\.be|facebook\.com|tiktok\.com|instagram\.com/i.test(cleanUrl)) category = "video";

    return {
      url: cleanUrl,
      category: category,
      domain: new URL(cleanUrl).hostname
    };
  });
}

// 7. Message Dispatcher (Popup, Side Panel, Content Scripts)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender?.tab?.id || message.tabId;

  switch (message.type) {
    case "OPEN_SIDE_PANEL": {
      if (chrome.sidePanel?.open) {
        const winId = sender?.tab?.windowId || message.windowId;
        chrome.sidePanel.open({ windowId: winId })
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
      }
      sendResponse({ success: false, error: "Side Panel API not supported" });
      break;
    }

    case "GET_TAB_MEDIA": {
      const mediaList = tabMediaMap.get(tabId) || [];
      sendResponse({ media: mediaList });
      break;
    }

    case "DOM_MEDIA_FOUND": {
      if (message.media && tabId) {
        registerDetectedMedia(tabId, message.media);
      }
      sendResponse({ success: true });
      break;
    }

    case "RESOLVE_PLATFORM_FORMATS": {
      resolveMediaFormatsViaApi(message.pageUrl)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case "TRIGGER_DOWNLOAD": {
      initiateDownload({
        url: message.url,
        title: message.title,
        tabId: tabId,
        category: message.category || "video",
        ext: message.ext || "mp4",
        filesize: message.filesize || message.size || message.totalBytes || 0,
        totalBytes: message.totalBytes || message.filesize || 0,
        saveAs: message.saveAs || false
      }).then((downloadId) => {
        sendResponse({ success: true, downloadId });
      }).catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    case "TRIGGER_BATCH_DOWNLOAD": {
      const items = message.items || [];
      let dispatched = 0;
      items.forEach((item, index) => {
        setTimeout(() => {
          initiateDownload({
            url: item.url,
            title: item.title || `Batch_Item_${index + 1}`,
            category: item.category || "video",
            ext: item.ext || "mp4"
          }).catch(() => {});
        }, index * 350);
        dispatched++;
      });
      sendResponse({ success: true, count: dispatched });
      break;
    }

    case "PARSE_BATCH_TEXT": {
      const parsed = parseLinksFromText(message.rawText || "");
      sendResponse({ success: true, items: parsed });
      break;
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

    case "PAUSE_ALL_DOWNLOADS": {
      activeDownloadsMap.forEach((item) => {
        if (item.state === "in_progress") {
          chrome.downloads.pause(item.downloadId);
        }
      });
      sendResponse({ success: true });
      break;
    }

    case "RESUME_ALL_DOWNLOADS": {
      activeDownloadsMap.forEach((item) => {
        if (item.state === "paused") {
          chrome.downloads.resume(item.downloadId);
        }
      });
      sendResponse({ success: true });
      break;
    }

    case "CLEAR_HISTORY": {
      downloadHistory.length = 0;
      sendResponse({ success: true });
      break;
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
      sendResponse({
        activeDownloads: activeList,
        history: downloadHistory,
        speedSamples: speedSamples,
        queue: downloadQueue
      });
      break;
    }

    case "GET_QUEUE": {
      sendResponse({ queue: downloadQueue });
      break;
    }

    case "ADD_TO_QUEUE": {
      if (message.item) {
        downloadQueue.push({
          id: "q_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
          ...message.item,
          priority: message.priority || "NORMAL",
          status: "QUEUED"
        });
      }
      sendResponse({ success: true, queue: downloadQueue });
      break;
    }

    default:
      break;
  }
});

// 8. Direct Two-Way Handshake with pulldl.com Website
if (chrome.runtime.onMessageExternal) {
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message.type === "PING_EXTENSION" || message.type === "CHECK_STATUS") {
      sendResponse({
        success: true,
        installed: true,
        version: "3.0.0",
        name: "PullDL Universal Studio"
      });
      return true;
    }

    if (message.type === "TRIGGER_TURBO_DOWNLOAD") {
      initiateDownload({
        url: message.url,
        title: message.title,
        category: message.category || "video",
        ext: message.ext || "mp4"
      }).then((downloadId) => {
        sendResponse({ success: true, downloadId });
      }).catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
  });
}
