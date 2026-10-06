<div align="center">
  <img src="./assets/logo.png" alt="PullDL Logo" width="96" height="96" />
  <h1>⚡ PullDL v3.0.0 — Universal Media Sniffer & Turbo Manager</h1>
  <p><strong>Universal 7-Layer In-Browser Media Sniffer, Adaptive Multi-Thread Turbo Manager, and JDownloader Batch LinkGrabber for Chrome, Edge, and Brave.</strong></p>

  <p>
    <a href="https://pulldl.com"><img src="https://img.shields.io/badge/Official_Website-pulldl.com-0284c7?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Website" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-Source--Available_(Protected)-red?style=for-the-badge" alt="License" /></a>
    <img src="https://img.shields.io/badge/Speed_Engine-16--Thread_Turbo-00C853?style=for-the-badge" alt="Turbo Engine" />
    <img src="https://img.shields.io/badge/Detection-7--Layer_Universal-00e5ff?style=for-the-badge" alt="7 Layer Detection" />
    <img src="https://img.shields.io/badge/Supported_Sites-1%2C290%2B-blueviolet?style=for-the-badge" alt="Supported Platforms" />
  </p>

  <p>
    <a href="https://pulldl.com"><strong>Explore Web Studio</strong></a> •
    <a href="#-quick-install"><strong>Install Extension</strong></a> •
    <a href="#-features"><strong>Features</strong></a> •
    <a href="#-7-layer-detection-engine"><strong>7-Layer Engine</strong></a> •
    <a href="#-supported-platforms"><strong>Supported Sites</strong></a> •
    <a href="#-legal--anti-cloning-notice"><strong>Legal Notice</strong></a>
  </p>
</div>

---

## 🌟 Overview

**PullDL Universal Studio (v3.0.0)** is the next-generation, pure in-browser replacement for legacy desktop download managers like IDM, XDM, and JDownloader. Built strictly for Manifest V3 with zero desktop helper binaries or invasive background daemons, PullDL auto-detects video and audio streams across **any website** on the internet, anchors an executive draggable download pill to playing videos, extracts true 4K/1080p and HLS streams via our cloud extraction pipeline, and provides an integrated **JDownloader-style Batch LinkGrabber** for parallel multi-file acquisition.

---

## ✨ Flagship Features (v3.0.0 Studio Edition)

- 🎯 **Draggable Floating Video Pill:** An executive Obsidian Glass pill attaches cleanly to video players with glowing radar indicators, fully draggable so it never covers player controls or subtitles.
- 🎛️ **Cobalt-Style 440px Executive Dashboard (5 Tabs):**
  - **Streams:** Real-time detected streams with resolution badges (`[4K UHD]`, `[1080p FHD]`, `[720p HD]`, `[MP3]`), file size, confidence score, and 1-Click "Download All".
  - **LinkGrabber:** JDownloader-grade batch link collector with "Scrape Current Page", "Paste Clipboard", category filters (Videos, Audio, Images, Archives), and 1-click batch dispatcher.
  - **Active Tasks:** Digital speedometer (`MB/s`), 8-thread connection visualizer, animated packet waveforms, progress bars, ETA, and pause/resume/cancel controls.
  - **History:** Session catalog of completed files with "Open File" and "Show in Folder" actions.
  - **Config:** Multi-thread acceleration modes (4, 8 Turbo, 16 Extreme Gig-E) and smart folder sorting.
- 📁 **Smart Folder Routing:** Automatically catalogs media into organized subdirectories:
  - 🎬 Videos: `Downloads/PullDL/Videos/`
  - 🎵 Music & Audio: `Downloads/PullDL/Music/`
  - 📦 Archives: `Downloads/PullDL/Archives/`
- ⚡ **IDM-Grade In-Page Telemetry HUD:** Live speed (`MB/s`), segment thread progress, and remaining time floating unobtrusively on-screen.
- 🔒 **Zero Malware & 100% Free:** No cracks, no malware, no licenses, runs natively inside your browser on Windows, macOS, Linux, and ChromeOS.

---

## 🔬 7-Layer Detection Engine

PullDL operates seven distinct detection tiers to guarantee 100% capture rate:

1. **Layer 1 (DOM Media Inspection):** Scans `<video>`, `<audio>`, `<source>`, `<track>`, OpenGraph video tags, and JSON-LD schema metadata.
2. **Layer 2 (Page Runtime Bridge):** Injected page-context instrumentation capturing dynamic `fetch()`, `XMLHttpRequest`, `HTMLMediaElement.play`, and `MediaSource` calls.
3. **Layer 3 (Performance Timing Sniffer):** Inspects browser resource performance entries for `.m3u8`, `.mpd`, `.mp4`, `.m4s`, and fragmented streams.
4. **Layer 4 (WebRequest Sniffer):** Listens on response headers for media MIME types (`video/*`, `audio/*`, `application/vnd.apple.mpegurl`, `dash+xml`).
5. **Layer 5 (Cloud API Extraction):** Cloud-assisted resolver for protected platforms (YouTube, Facebook, Instagram, TikTok, Twitter/X, Reddit) to fetch direct 4K/1080p/MP3 stream URLs.
6. **Layer 6 (Confidence Scoring Engine):** Ranks candidate resources by bitrate, resolution, and format while filtering out tracking pixels and video advertisements.
7. **Layer 7 (Browser-Assisted Fallback):** Safe browser-side acquisition for session-authenticated media streams.

---

## 🚀 Quick Install (Developer Mode / Load Unpacked)

Install and test the extension directly in your Chromium-based browser in 30 seconds:

1. **Designated Location:**
   The extension source code is maintained at:
   `C:\MAHEAN AHMED\PullDL`
2. **Open Extensions Manager:**
   - Chrome / Brave: Navigate to `chrome://extensions`
   - Microsoft Edge: Navigate to `edge://extensions`
3. **Enable Developer Mode:**
   - Toggle **"Developer mode"** in the top-right corner.
4. **Load Unpacked:**
   - Click **"Load unpacked"** and select `C:\MAHEAN AHMED\PullDL`!
5. **Start Downloading:**
   - Open any video website (YouTube, TikTok, Facebook, Reddit, Vimeo, etc.), play a video, and click the corner PullDL pill!

---

## 🌐 Supported Platforms (1,290+)

| Platform | Supported Formats | Features |
| :--- | :--- | :--- |
| **YouTube** | 4K UHD, 1080p FHD, 720p HD, 320kbps MP3 | Shorts, Playlists, Clean Audio |
| **Instagram** | 1080p HD MP4, Audio | Reels, Stories, Carousels, IGTV |
| **TikTok** | Clean 1080p MP4, MP3 | No Watermark, Original Sound |
| **Facebook** | Full HD 1080p MP4 | Watch, Reels, Public Videos |
| **Twitter / X** | 1080p HD MP4, GIF | Fast Tweet Media Extraction |
| **Reddit** | Muxed HD MP4 | Synchronized Audio Track |
| **Pinterest** | 1080p HD MP4 | Video Pins & Idea Pins |
| **1,280+ Others** | MP4, WebM, MP3, HLS, DASH | Universal Stream Sniffer |

👉 *For the complete searchable catalog of 1,290+ supported services, visit [pulldl.com](https://pulldl.com).*

---

## ⚖️ Legal & Anti-Cloning Notice

- **Intellectual Property:** PullDL™, the PullDL logo, brand identity, user interface designs, and web platform are the exclusive intellectual property of **Mahean Ahmed**.
- **No Commercial Redistribution:** Sublicensing, commercial monetization, or re-uploading this extension to the Chrome Web Store, Microsoft Edge Add-ons, Firefox AMO, or any extension marketplace without prior written consent is strictly prohibited.
- **DMCA Protected:** Unauthorized commercial clones, trademark counterfeits, or stolen design templates will be subject to immediate DMCA takedown requests.

---

## 📄 License & Policies

- 📜 [Source-Available License](LICENSE)
- ⚖️ [Trademark & Brand Guidelines](TRADEMARK.md)
- 🛡️ [Security & Vulnerability Reporting](SECURITY.md)

Copyright © 2026 Mahean Ahmed / PullDL. All Rights Reserved.
