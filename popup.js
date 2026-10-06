// PullDL Quick Launcher (Layer A)

document.addEventListener("DOMContentLoaded", async () => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentWindow = await chrome.windows.getCurrent();

  const domainLabel = document.getElementById("site-domain-label");
  const statusDot = document.getElementById("site-status-dot");
  const statusText = document.getElementById("site-status-text");
  const btnOpenSidepanel = document.getElementById("btn-open-sidepanel");
  const btnDownloadBest = document.getElementById("btn-download-best");
  const btnDetectMedia = document.getElementById("btn-detect-media");
  const quickUrlInput = document.getElementById("quick-url-input");
  const btnAnalyze = document.getElementById("btn-analyze-url");
  const recentList = document.getElementById("recent-list");
  const linkHistory = document.getElementById("link-open-history");
  const linkSettings = document.getElementById("link-open-settings");
  const btnPopupSettings = document.getElementById("btn-popup-settings");

  let detectedMediaItems = [];

  // 1. Inspect Active Tab
  if (activeTab && activeTab.url) {
    try {
      const parsedUrl = new URL(activeTab.url);
      domainLabel.textContent = parsedUrl.hostname.replace(/^www\./, "");
    } catch (e) {
      domainLabel.textContent = "Web Page";
    }

    checkMediaStatus();
  }

  function checkMediaStatus() {
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
      statusDot.className = "status-dot active";
      statusText.textContent = "Media ready";

      chrome.runtime.sendMessage({
        type: "RESOLVE_PLATFORM_FORMATS",
        pageUrl: activeTab.url
      }, (resp) => {
        if (resp?.success && resp.data?.formats?.length > 0) {
          detectedMediaItems = resp.data.formats;
          const best = detectedMediaItems[0];
          document.getElementById("label-download-best").textContent = `Download (${best.quality || "Best"})`;
        }
      });
    } else {
      chrome.runtime.sendMessage({ type: "GET_TAB_MEDIA", tabId: activeTab.id }, (response) => {
        const media = response?.media || [];
        detectedMediaItems = media;
        if (media.length > 0) {
          statusDot.className = "status-dot active";
          statusText.textContent = `${media.length} Media detected`;
        } else {
          statusDot.className = "status-dot";
          statusText.textContent = "No media detected";
        }
      });
    }
  }

  // 2. Open Side Panel Function
  async function openDownloadCenter(targetTab = "detected") {
    if (chrome.sidePanel?.open && currentWindow?.id) {
      try {
        await chrome.sidePanel.open({ windowId: currentWindow.id });
        if (targetTab !== "detected") {
          chrome.storage.local.set({ activeSidePanelTab: targetTab });
        }
        window.close();
        return;
      } catch (err) {
        console.error("Side Panel Open Error:", err);
      }
    }

    // Fallback: send message to background
    chrome.runtime.sendMessage({
      type: "OPEN_SIDE_PANEL",
      windowId: currentWindow?.id
    }, () => {
      window.close();
    });
  }

  btnOpenSidepanel.addEventListener("click", () => openDownloadCenter("detected"));
  btnPopupSettings?.addEventListener("click", () => openDownloadCenter("settings"));
  linkSettings?.addEventListener("click", () => openDownloadCenter("settings"));
  linkHistory?.addEventListener("click", () => openDownloadCenter("history"));

  // 3. Download Best Action
  btnDownloadBest.addEventListener("click", () => {
    if (detectedMediaItems.length > 0) {
      const best = detectedMediaItems[0];
      chrome.runtime.sendMessage({
        type: "TRIGGER_DOWNLOAD",
        url: best.url,
        title: activeTab.title,
        tabId: activeTab.id,
        category: "video",
        ext: best.ext || "mp4"
      });
      openDownloadCenter("downloads");
    } else {
      openDownloadCenter("detected");
    }
  });

  // 4. Detect Media
  btnDetectMedia.addEventListener("click", () => {
    statusText.textContent = "Scanning...";
    chrome.tabs.sendMessage(activeTab.id, { type: "TRIGGER_PAGE_LINKGRAB" }).catch(() => {});
    setTimeout(checkMediaStatus, 600);
  });

  // 5. Analyze URL
  btnAnalyze.addEventListener("click", () => {
    const url = quickUrlInput.value.trim();
    if (url) {
      chrome.storage.local.set({ pendingAnalyzeUrl: url });
      openDownloadCenter("analyzer");
    }
  });

  quickUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      btnAnalyze.click();
    }
  });

  // 6. Recent Activity Loader
  chrome.runtime.sendMessage({ type: "GET_ACTIVE_DOWNLOADS" }, (res) => {
    if (!res) return;
    const items = [...(res.activeDownloads || []), ...(res.history || [])].slice(0, 2);

    if (items.length > 0) {
      recentList.innerHTML = "";
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "recent-item";
        const isDone = item.completedAt || item.progress === 100;
        row.innerHTML = `
          <span class="recent-item-title" title="${item.title}">${item.title}</span>
          <span style="font-size: 10px; color: ${isDone ? "var(--status-active)" : "var(--accent-primary)"};">
            ${isDone ? "✓ Done" : `${item.progress || 0}%`}
          </span>
        `;
        row.addEventListener("click", () => openDownloadCenter("downloads"));
        recentList.appendChild(row);
      });
    }
  });
});
