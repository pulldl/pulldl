document.addEventListener("DOMContentLoaded", () => {
  const currentUrlEl = document.getElementById("currentUrl");
  const btnDownloadCurrent = document.getElementById("btnDownloadCurrent");
  const customUrlInput = document.getElementById("customUrl");
  const btnDownloadCustom = document.getElementById("btnDownloadCustom");

  let activeTabUrl = "";

  if (chrome && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url) {
        activeTabUrl = tabs[0].url;
        currentUrlEl.textContent = activeTabUrl;
      } else {
        currentUrlEl.textContent = "No active page detected";
        btnDownloadCurrent.disabled = true;
      }
    });
  }

  btnDownloadCurrent.addEventListener("click", () => {
    if (activeTabUrl && (activeTabUrl.startsWith("http://") || activeTabUrl.startsWith("https://"))) {
      const target = `https://pulldl.com/?url=${encodeURIComponent(activeTabUrl)}`;
      chrome.tabs.create({ url: target });
    }
  });

  btnDownloadCustom.addEventListener("click", () => {
    const val = customUrlInput.value.trim();
    if (val && (val.startsWith("http://") || val.startsWith("https://"))) {
      const target = `https://pulldl.com/?url=${encodeURIComponent(val)}`;
      chrome.tabs.create({ url: target });
    } else {
      customUrlInput.focus();
    }
  });

  customUrlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      btnDownloadCustom.click();
    }
  });
});
