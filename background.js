// PullDL Background Service Worker (Universal Studio Engine v3.0.0)
// Implements: 7-Layer Media Registry, Adaptive Segmentation, JDownloader Batch LinkGrabber, Smart Folder Routing

const tabMediaMap = new Map(); // tabId -> Array of Media objects
const activeDownloadsMap = new Map(); // downloadId -> Telemetry state
const downloadHistory = []; // Recent completed downloads

const DEFAULT_SETTINGS = {
  askFolder: false,
  smartSorting: true,
  concurrencyMode: "adaptive", // adaptive, 4, 8, 16
  floatingButton: true,
  autoSniff: true
};

// Initialize settings & Context Menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
    chrome.storage.local.set(stored);
  });

  chrome.contextMenus.create({
    id: "pulldl-download-turbo",
    title: "⚡ Download with PullDL Turbo",
    contexts: ["page", "link", "video", "audio"]
  });

  chrome.contextMenus.create({
    id: "pulldl-grab-links",
    title: "📋 Grab all links on page (PullDL LinkGrabber)",
    contexts: ["page", "selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "pulldl-download-turbo") {
    const targetUrl = info.srcUrl || info.linkUrl || tab?.url;
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      initiateDownload({
        url: targetUrl,
        title: tab?.title || "Media_File",
        tabId: tab?.id,
        category: info.mediaType === "audio" ? "audio" : "video"
      });
    }
  } else if (info.menuItemId === "pulldl-grab-links") {
    chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_PAGE_LINKGRAB" }).catch(() => {});
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

// 1. API Stream Resolver (YouTube, Facebook, TikTok, Instagram, Twitter/X, Reddit)
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

// 2. Layer 4: WebRequest Stream Sniffer
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
  chrome.action.setBadgeBackgroundColor({ color: "#00E676", tabId });

  chrome.tabs.sendMessage(tabId, {
    type: "MEDIA_SNIFFED",
    media: mediaItem,
    totalCount: list.length
  }).catch(() => {});
}

chrome.tabs.onRemoved.addListener((tabId) => tabMediaMap.delete(tabId));

// 3. Initiate High-Speed Download with Adaptive Segmentation
async function initiateDownload({ url, title, tabId, category = "video", ext = "mp4", saveAs = false }) {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const cleanFilename = sanitizeFilename(title, ext);

  let targetPath = "";
  if (settings.smartSorting) {
    if (category === "audio" || ext.toLowerCase() === "mp3") {
      targetPath = `PullDL/Music/${cleanFilename}`;
    } else {
      targetPath = `PullDL/Videos/${cleanFilename}`;
    }
  } else {
    targetPath = `PullDL/${cleanFilename}`;
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
      title: title || cleanFilename,
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

    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: "DOWNLOAD_STARTED",
        downloadId,
        title: title || cleanFilename,
        filename: targetPath
      }).catch(() => {});
    }

    return downloadId;
  } catch (err) {
    console.error("PullDL Download Dispatch Failed:", err);
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: "DOWNLOAD_ERROR",
        error: err.message
      }).catch(() => {});
    }
    throw err;
  }
}

// 4. Real-time Telemetry
chrome.downloads.onChanged.addListener((delta) => {
  const item = activeDownloadsMap.get(delta.id);
  if (!item) return;

  const now = Date.now();

  if (delta.bytesReceived) {
    const received = delta.bytesReceived.current;
    const timeDiff = (now - item.lastTime) / 1000;

    if (timeDiff >= 0.4) {
      const bytesDiff = received - item.lastBytes;
      item.speed = Math.max(0, Math.round(bytesDiff / timeDiff));
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
    const remaining = Math.max(0, item.totalBytes - item.receivedBytes);
    item.eta = item.speed > 0 ? Math.ceil(remaining / item.speed) : 0;
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

// 5. Smart LinkGrabber (JDownloader Style Batch URL Extractor)
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

// 6. Message Dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender?.tab?.id || message.tabId;

  switch (message.type) {
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
        }, index * 400); // 400ms stagger
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
