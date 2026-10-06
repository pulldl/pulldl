// PullDL In-Page Content Script
(function () {
  if (window.__pulldl_injected) return;
  window.__pulldl_injected = true;

  function createFloatingButton() {
    const btn = document.createElement("button");
    btn.id = "pulldl-floating-btn";
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>PullDL</span>
    `;

    btn.title = "Download this video with PullDL";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const currentUrl = window.location.href;
      window.open(`https://pulldl.com/?url=${encodeURIComponent(currentUrl)}`, "_blank");
    });

    document.body.appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createFloatingButton);
  } else {
    createFloatingButton();
  }
})();
