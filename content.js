/* Content script – injects a sidebar iframe into every page via Shadow DOM */

(function () {
  "use strict";

  if (window.__bgSidebarInjected) return;
  window.__bgSidebarInjected = true;

  const IFRAME_SRC = "https://www.remove.bg/upload";
  const SIDEBAR_WIDTH = 420;

  /* ── Host element + Shadow DOM ─────────────────────────────── */
  const host = document.createElement("div");
  host.id = "bg-sidebar-host";
  host.style.cssText = "all:initial;position:fixed;top:0;right:0;z-index:2147483647;height:100vh;width:0;pointer-events:none;";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  /* ── Styles inside Shadow DOM ──────────────────────────────── */
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .sidebar {
      position: fixed;
      top: 0;
      right: 0;
      width: ${SIDEBAR_WIDTH}px;
      height: 100vh;
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    .sidebar.open {
      transform: translateX(0);
    }

    /* ── Header bar ── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      cursor: grab;
      user-select: none;
      min-height: 40px;
    }
    .header:active { cursor: grabbing; }

    .header-title {
      font-weight: 600;
      font-size: 14px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn {
      border: none;
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 12px;
      cursor: pointer;
      line-height: 1.4;
    }

    /* ── Themes ── */
    .sidebar.theme-light .header {
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
      color: #333;
    }
    .sidebar.theme-light .btn {
      background: #e0e0e0;
      color: #333;
    }
    .sidebar.theme-light .btn:hover { background: #d0d0d0; }

    .sidebar.theme-dark .header {
      background: #1e1e1e;
      border-bottom: 1px solid #444;
      color: #eee;
    }
    .sidebar.theme-dark .btn {
      background: #444;
      color: #eee;
    }
    .sidebar.theme-dark .btn:hover { background: #555; }

    /* ── Iframe ── */
    .sidebar iframe {
      flex: 1;
      width: 100%;
      border: none;
    }

    /* ── Drop overlay ── */
    .drop-overlay {
      display: none;
      position: absolute;
      top: 40px;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,120,255,0.15);
      border: 3px dashed rgba(0,120,255,0.6);
      z-index: 10;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: 600;
      color: rgba(0,120,255,0.8);
      pointer-events: none;
    }
    .drop-overlay.active {
      display: flex;
    }
  `;
  shadow.appendChild(style);

  /* ── Build sidebar DOM ─────────────────────────────────────── */
  const sidebar = document.createElement("div");
  sidebar.className = "sidebar theme-light";

  const header = document.createElement("div");
  header.className = "header";

  const title = document.createElement("span");
  title.className = "header-title";
  title.textContent = "BG Remove";

  const actions = document.createElement("div");
  actions.className = "header-actions";

  const themeBtn = document.createElement("button");
  themeBtn.className = "btn";
  themeBtn.textContent = "🌙 Dark";

  const closeBtn = document.createElement("button");
  closeBtn.className = "btn";
  closeBtn.textContent = "✕ Close";

  actions.appendChild(themeBtn);
  actions.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(actions);

  const iframe = document.createElement("iframe");
  iframe.src = IFRAME_SRC;
  iframe.setAttribute("allow", "clipboard-write");
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-modals");

  const dropOverlay = document.createElement("div");
  dropOverlay.className = "drop-overlay";
  dropOverlay.textContent = "Drop image here";

  sidebar.appendChild(header);
  sidebar.appendChild(dropOverlay);
  sidebar.appendChild(iframe);
  shadow.appendChild(sidebar);

  /* ── State helpers ─────────────────────────────────────────── */
  function saveState(key, value) {
    try { chrome.storage.local.set({ [key]: value }); } catch (_) { /* noop */ }
  }

  function loadState(callback) {
    try {
      chrome.storage.local.get(["sidebarOpen", "theme"], callback);
    } catch (_) {
      callback({ sidebarOpen: false, theme: "light" });
    }
  }

  /* ── Open / Close ──────────────────────────────────────────── */
  function openSidebar() {
    host.style.width = SIDEBAR_WIDTH + "px";
    host.style.pointerEvents = "auto";
    sidebar.classList.add("open");
    saveState("sidebarOpen", true);
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    setTimeout(() => {
      host.style.width = "0";
      host.style.pointerEvents = "none";
    }, 350);
    saveState("sidebarOpen", false);
  }

  function toggleSidebar() {
    if (sidebar.classList.contains("open")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  closeBtn.addEventListener("click", closeSidebar);

  /* ── Theme toggle ──────────────────────────────────────────── */
  function applyTheme(theme) {
    sidebar.classList.remove("theme-light", "theme-dark");
    sidebar.classList.add("theme-" + theme);
    themeBtn.textContent = theme === "light" ? "🌙 Dark" : "☀️ Light";
    saveState("theme", theme);
  }

  themeBtn.addEventListener("click", () => {
    const next = sidebar.classList.contains("theme-light") ? "dark" : "light";
    applyTheme(next);
  });

  /* ── Dragging the sidebar (repositioning vertically) ───────── */
  let isDragging = false;
  let dragStartY = 0;
  let sidebarStartTop = 0;

  header.addEventListener("mousedown", (e) => {
    if (e.target === closeBtn || e.target === themeBtn) return;
    isDragging = true;
    dragStartY = e.clientY;
    sidebarStartTop = parseInt(sidebar.style.top || "0", 10);
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dy = e.clientY - dragStartY;
    const newTop = Math.max(0, Math.min(window.innerHeight - 100, sidebarStartTop + dy));
    sidebar.style.top = newTop + "px";
    sidebar.style.height = (window.innerHeight - newTop) + "px";
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

  /* ── Drag-and-drop from host page into sidebar iframe ──────── */
  let dragCounter = 0;

  host.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    dropOverlay.classList.add("active");
    /* Lift the iframe pointer-events so the overlay catches the drop */
    iframe.style.pointerEvents = "none";
  });

  host.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropOverlay.classList.remove("active");
      iframe.style.pointerEvents = "";
    }
  });

  host.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  host.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.classList.remove("active");
    iframe.style.pointerEvents = "";

    /* Collect files from the drop event */
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      forwardFileToIframe(files[0]);
      return;
    }

    /* If a URL was dropped instead of a file, fetch as blob then forward */
    const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (url && /^https?:\/\/.+/i.test(url)) {
      fetch(url)
        .then((r) => r.blob())
        .then((blob) => {
          const file = new File([blob], "image.png", { type: blob.type || "image/png" });
          forwardFileToIframe(file);
        })
        .catch(() => { /* silently ignore fetch errors */ });
    }
  });

  /**
   * Forward a File object into the remove.bg iframe by posting a message.
   * Because cross-origin iframes can't share File objects via postMessage
   * reliably, we convert to an ArrayBuffer first.
   */
  function forwardFileToIframe(file) {
    const reader = new FileReader();
    reader.onload = () => {
      iframe.contentWindow.postMessage(
        {
          type: "bg-sidebar-drop",
          fileName: file.name,
          fileType: file.type,
          buffer: reader.result
        },
        "*"
      );
    };
    reader.readAsArrayBuffer(file);
  }

  /* ── Listen for toggle message from background ─────────────── */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === "toggle_sidebar") {
      toggleSidebar();
    }
  });

  /* ── Restore saved state ───────────────────────────────────── */
  loadState((data) => {
    const theme = data.theme || "light";
    applyTheme(theme);

    if (data.sidebarOpen) {
      /* Small delay so the slide-in animation is visible */
      requestAnimationFrame(() => openSidebar());
    }
  });
})();
