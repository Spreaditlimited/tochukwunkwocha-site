(function () {
  var INTERNAL_NAV_ORDER = [
    { path: "/internal/", label: "Dashboard" },
    { path: "/internal/manual-payments/", label: "Enrollments" },
    { path: "/internal/installments/", label: "Installments" },
    { path: "/internal/domain-management/", label: "Domain Management" },
    { path: "/internal/video-library/", label: "Video Library" },
    { path: "/internal/learning-progress/", label: "Learning Progress" },
    { path: "/internal/learning-support/", label: "Learning Support" },
    { path: "/internal/schools/", label: "Schools" },
    { path: "/internal/school-calls/", label: "School Calls" },
    { path: "/internal/school-scorecards/", label: "School Scorecards" },
    { path: "/internal/affiliates/", label: "Affiliates" },
    { path: "/internal/settings/", label: "Settings" }
  ];

  var ICONS = {
    "/internal/": '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>',
    "/internal/manual-payments/": '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>',
    "/internal/installments/": '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
    "/internal/domain-management/": '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 7.5V6a2 2 0 00-2-2h-2.5M3 7.5V6a2 2 0 012-2h2.5M21 16.5V18a2 2 0 01-2 2h-2.5M3 16.5V18a2 2 0 002 2h2.5M8 12h8M8 9h8M8 15h5" /></svg>',
    "/internal/video-library/": '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-9 5h7a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>',
    "/internal/learning-progress/": '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-6m3 6V7m3 10v-3m3 3V4M4 20h16" /></svg>',
    "/internal/learning-support/": '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h8m-8 4h6M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1h-5l-3 3-3-3H4a1 1 0 01-1-1V7a1 1 0 011-1z" /></svg>',
    "/internal/schools/": '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5V4H2v16h5m10 0v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4m10 0H7m2-10h6m-6 4h6" /></svg>',
    "/internal/school-calls/": '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z" /></svg>',
    "/internal/school-scorecards/": '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" /></svg>',
    "/internal/affiliates/": '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-2.21 0-4 1.343-4 3s1.79 3 4 3 4 1.343 4 3-1.79 3-4 3m0-12c1.48 0 2.78.536 3.465 1.333M12 8V6m0 2v12m0 0v-2m0 2c-1.48 0-2.78-.536-3.465-1.333" /></svg>',
    "/internal/settings/": '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.591 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.59c1.756.427 1.756 2.925 0 3.352a1.724 1.724 0 00-1.066 2.59c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.59 1.066c-.427 1.756-2.925 1.756-3.352 0a1.724 1.724 0 00-2.59-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.59c-1.756-.427-1.756-2.925 0-3.352a1.724 1.724 0 001.066-2.59c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.59-1.066z" /></svg>'
  };

  var SIDEBAR_COLLAPSE_KEY = "tochukwu_internal_sidebar_collapsed";
  var SIGNOUT_MARKER_KEY = "tn_auth_just_signed_out";
  var railToggleButtons = [];

  function normalizePath(pathname) {
    var path = String(pathname || "/").trim();
    if (!path) return "/";
    return path.endsWith("/") ? path : path + "/";
  }

  function getPathFromHref(rawHref) {
    try {
      return normalizePath(new URL(String(rawHref || ""), window.location.origin).pathname);
    } catch (_error) {
      return "";
    }
  }

  function isDesktop() {
    return window.matchMedia("(min-width: 768px)").matches;
  }

  function readCollapsedPref() {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1";
    } catch (_error) {
      return false;
    }
  }

  function writeCollapsedPref(value) {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, value ? "1" : "0");
    } catch (_error) {}
  }

  function chevronSvg(collapsed) {
    if (collapsed) {
      return '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>';
    }
    return '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>';
  }

  async function logoutAdmin() {
    await fetch("/.netlify/functions/admin-logout", {
      method: "POST",
      credentials: "include"
    }).catch(function () { return null; });
    try { sessionStorage.setItem(SIGNOUT_MARKER_KEY, "1"); } catch (_error) {}
    window.location.href = "/internal/";
  }

  function setActiveStyles(link, active) {
    if (!link) return;
    link.classList.remove("bg-brand-600/40", "text-white");
    if (active) {
      link.classList.add("bg-brand-600/40", "text-white");
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }

  function buildMenuInAside(aside) {
    if (!aside) return [];
    var existingLinks = Array.prototype.slice.call(aside.querySelectorAll('a[href^="/internal/"]'));
    if (!existingLinks.length) return [];
    var navContainer = existingLinks[0].parentNode;
    if (!navContainer) return [];

    var linkClassName = existingLinks[0].className || "flex items-center gap-3 px-3 py-2.5 text-brand-100 hover:bg-white/5 hover:text-white rounded-lg font-medium transition-colors group";
    existingLinks.forEach(function (link) {
      if (link && link.parentNode === navContainer) navContainer.removeChild(link);
    });

    var currentPath = normalizePath(window.location.pathname);
    var links = [];
    INTERNAL_NAV_ORDER.forEach(function (item) {
      var a = document.createElement("a");
      a.href = item.path;
      a.className = linkClassName;
      a.classList.add("group");
      var icon = ICONS[item.path] || "";
      a.innerHTML = icon + '<span data-nav-label="1">' + item.label + "</span>";
      a.setAttribute("title", item.label);
      setActiveStyles(a, item.path === currentPath);
      navContainer.appendChild(a);
      links.push(a);
    });
    return links;
  }

  function styleSidebarCollapsed(aside, collapsed) {
    var labels = Array.prototype.slice.call(aside.querySelectorAll("[data-nav-label]"));
    var brandLabel = aside.querySelector("div > span.font-heading.font-bold.text-lg, div > span.font-heading.font-bold.text-lg.tracking-tight");
    var menuLabel = aside.querySelector("p");
    var signout = aside.querySelector("[data-admin-signout]");
    if (signout && !signout.getAttribute("data-signout-label")) {
      signout.setAttribute("data-signout-label", String(signout.textContent || "").replace(/\s+/g, " ").trim() || "Sign out");
    }

    if (!collapsed || !isDesktop()) {
      aside.style.width = "";
      Array.prototype.slice.call(aside.querySelectorAll('a[href^="/internal/"]')).forEach(function (link) {
        link.classList.remove("justify-center");
        link.style.paddingLeft = "";
        link.style.paddingRight = "";
      });
      labels.forEach(function (el) { el.style.display = ""; });
      if (brandLabel) brandLabel.style.display = "";
      if (menuLabel) menuLabel.style.display = "";
      if (signout) {
        signout.classList.remove("justify-center");
        signout.style.paddingLeft = "";
        signout.style.paddingRight = "";
        signout.innerHTML = '<span class="w-full text-center">' + (signout.getAttribute("data-signout-label") || "Sign out") + "</span>";
      }
      aside.setAttribute("data-collapsed", "0");
      return;
    }

    aside.style.width = "5.5rem";
    Array.prototype.slice.call(aside.querySelectorAll('a[href^="/internal/"]')).forEach(function (link) {
      link.classList.add("justify-center");
      link.style.paddingLeft = "0.5rem";
      link.style.paddingRight = "0.5rem";
    });
    labels.forEach(function (el) { el.style.display = "none"; });
    if (brandLabel) brandLabel.style.display = "none";
    if (menuLabel) menuLabel.style.display = "none";
    if (signout) {
      signout.classList.add("justify-center");
      signout.style.paddingLeft = "0.5rem";
      signout.style.paddingRight = "0.5rem";
      signout.innerHTML = '<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h5a2 2 0 012 2v1" /></svg>';
      signout.setAttribute("title", signout.getAttribute("data-signout-label") || "Sign out");
      signout.setAttribute("aria-label", signout.getAttribute("data-signout-label") || "Sign out");
    }
    aside.setAttribute("data-collapsed", "1");
  }

  function updateRailButtons(collapsed) {
    railToggleButtons.forEach(function (btn) {
      btn.innerHTML = chevronSvg(collapsed);
      btn.setAttribute("aria-pressed", collapsed ? "true" : "false");
      btn.setAttribute("aria-label", collapsed ? "Expand side menu" : "Collapse side menu");
      btn.setAttribute("title", collapsed ? "Expand menu" : "Collapse menu");
    });
  }

  function applySidebarCollapsed(collapsed, sidebars) {
    sidebars.forEach(function (aside) {
      styleSidebarCollapsed(aside, collapsed);
    });
    updateRailButtons(collapsed);
  }

  function toggleSidebarCollapsed(sidebars) {
    var next = !readCollapsedPref();
    writeCollapsedPref(next);
    applySidebarCollapsed(next, sidebars);
  }

  function ensureRailToggleButtons(sidebars) {
    sidebars.forEach(function (aside) {
      if (!aside || aside.querySelector("[data-sidebar-rail-toggle]")) return;
      aside.style.position = aside.style.position || "relative";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-sidebar-rail-toggle", "1");
      btn.className = "hidden md:inline-flex absolute top-20 -right-3 z-20 h-7 w-7 items-center justify-center rounded-full border border-brand-200 bg-white text-brand-700 shadow-sm hover:bg-brand-50 transition-colors";
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggleSidebarCollapsed(sidebars);
      });
      aside.appendChild(btn);
      railToggleButtons.push(btn);
    });
  }

  function fetchSessionAccess() {
    return fetch("/.netlify/functions/admin-session", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include"
    }).then(function (res) {
      if (!res.ok) return null;
      return res.json().catch(function () { return null; });
    }).then(function (data) {
      var account = data && data.account ? data.account : null;
      if (!account) return null;
      if (account.isOwner === true) return [];
      var pages = Array.isArray(account.allowedPages) ? account.allowedPages : [];
      return pages.map(function (x) { return normalizePath(x); }).filter(Boolean);
    }).catch(function () { return null; });
  }

  var sidebars = Array.prototype.slice.call(document.querySelectorAll("aside")).filter(function (aside) {
    return !!aside.querySelector('a[href^="/internal/"]');
  });
  if (!sidebars.length) return;

  var allMenuLinks = [];
  sidebars.forEach(function (aside) {
    var built = buildMenuInAside(aside);
    allMenuLinks = allMenuLinks.concat(built);
  });

  ensureRailToggleButtons(sidebars);
  var collapsed = readCollapsedPref();
  applySidebarCollapsed(collapsed, sidebars);

  window.addEventListener("resize", function () {
    var next = readCollapsedPref();
    applySidebarCollapsed(next, sidebars);
  });

  allMenuLinks.forEach(function (link) {
    link.addEventListener("click", function (event) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var targetPath = getPathFromHref(link.getAttribute("href"));
      if (targetPath && targetPath === normalizePath(window.location.pathname)) {
        event.preventDefault();
        return;
      }
      var mobileMenuToggle = document.getElementById("mobile-menu-toggle");
      if (mobileMenuToggle && mobileMenuToggle.checked) mobileMenuToggle.checked = false;
    });
  });

  function applyPermissions(allowedPages) {
    allMenuLinks.forEach(function (link) {
      var targetPath = getPathFromHref(link.getAttribute("href"));
      var show = true;
      if (Array.isArray(allowedPages) && allowedPages.length && targetPath !== "/internal/") {
        show = allowedPages.indexOf(targetPath) !== -1;
      }
      link.classList.toggle("hidden", !show);
    });
  }

  fetchSessionAccess().then(function (pages) {
    if (!Array.isArray(pages)) return;
    applyPermissions(pages);
    var currentPath = normalizePath(window.location.pathname);
    if (pages.length && currentPath !== "/internal/" && pages.indexOf(currentPath) === -1) {
      var denied = encodeURIComponent(currentPath.replace(/^\/internal\/|\/$/g, "") || "requested page");
      window.location.replace("/internal/?denied=" + denied);
    }
  });

  Array.prototype.slice.call(document.querySelectorAll("[data-admin-signout]")).forEach(function (button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      if (button.disabled) return;
      button.disabled = true;
      button.style.opacity = "0.7";
      logoutAdmin().catch(function () {
        button.disabled = false;
        button.style.opacity = "1";
      });
    });
  });
})();
