// PullDL Layer 2: Safe Page-Context Runtime Bridge
// Runs in Main Page execution context to observe MSE buffers, dynamic media fetches, and active stream initialization.

(function () {
  if (window.__pulldl_page_bridge_installed) return;
  window.__pulldl_page_bridge_installed = true;

  const MEDIA_EXT_REGEX = /\.(m3u8|mpd|mp4|webm|m4s|ts|aac|mp3|ogg)(\?.*)?$/i;

  function notifyExtension(type, payload) {
    try {
      window.postMessage({
        source: "PULLDL_PAGE_BRIDGE",
        type: type,
        data: payload,
        timestamp: Date.now()
      }, "*");
    } catch (e) {
      // Ignore postMessage serialization issues
    }
  }

  // 1. Observe HTMLMediaElement Playback
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    try {
      const src = this.currentSrc || this.src;
      if (src) {
        notifyExtension("MEDIA_PLAYING", {
          src: src,
          width: this.videoWidth || 0,
          height: this.videoHeight || 0,
          duration: this.duration || 0,
          tagName: this.tagName.toLowerCase()
        });
      }
    } catch (e) {}
    return originalPlay.apply(this, arguments);
  };

  // 2. Observe MediaSource Buffer Attachments (YouTube, Facebook, Twitter MSE Streams)
  if (window.MediaSource && MediaSource.prototype.addSourceBuffer) {
    const origAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function (mimeCodec) {
      notifyExtension("MSE_ATTACHED", {
        mimeCodec: mimeCodec,
        pageUrl: window.location.href
      });
      return origAddSourceBuffer.apply(this, arguments);
    };
  }

  // 3. Observe Dynamic fetch() Calls for Stream Manifests and Chunks
  if (window.fetch) {
    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        let url = typeof input === "string" ? input : input?.url;
        if (url && (MEDIA_EXT_REGEX.test(url) || url.includes("manifest") || url.includes("videoplayback"))) {
          notifyExtension("NETWORK_FETCH", {
            url: url,
            method: init?.method || "GET"
          });
        }
      } catch (e) {}
      return origFetch.apply(this, arguments);
    };
  }

  // 4. Observe XMLHttpRequest Calls for Video Streams
  if (window.XMLHttpRequest) {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try {
        if (typeof url === "string" && (MEDIA_EXT_REGEX.test(url) || url.includes("manifest") || url.includes("videoplayback"))) {
          notifyExtension("NETWORK_XHR", {
            url: url,
            method: method
          });
        }
      } catch (e) {}
      return origOpen.apply(this, arguments);
    };
  }
})();
