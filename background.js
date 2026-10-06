// PullDL Background Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  // Create Context Menu for links and media
  chrome.contextMenus.create({
    id: "pulldl-download-media",
    title: "Download with PullDL",
    contexts: ["page", "link", "video", "audio"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "pulldl-download-media") {
    const targetUrl = info.srcUrl || info.linkUrl || info.pageUrl || tab?.url;
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      const url = `https://pulldl.com/?url=${encodeURIComponent(targetUrl)}`;
      chrome.tabs.create({ url });
    }
  }
});
