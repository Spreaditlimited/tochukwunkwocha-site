(function () {
  var SIGNOUT_MARKER_KEY = "tn_auth_just_signed_out";
  var SIDEBAR_COLLAPSE_KEY = "tochukwu_user_sidebar_collapsed";
  var navLock = false;

  var menuLinks = Array.prototype.slice.call(
    document.querySelectorAll('aside a[href^="/dashboard/"]')
  );
  var signoutButtons = Array.prototype.slice.call(
    document.querySelectorAll("[data-user-signout]")
  );
  var sidebars = [];
  var railToggleButtons = [];

  function injectHiddenScrollbarStyles() {
    if (!document || !document.head) return;
    if (document.getElementById("tochukwu-user-scrollbar-style")) return;

    var style = document.createElement("style");
    style.id = "tochukwu-user-scrollbar-style";
    style.textContent = [
      ".tochukwu-hide-scrollbars, .tochukwu-hide-scrollbars * {",
      "  scrollbar-width: none !important;",
      "  -ms-overflow-style: none !important;",
      "}",
      ".tochukwu-hide-scrollbars *::-webkit-scrollbar, .tochukwu-hide-scrollbars::-webkit-scrollbar {",
      "  width: 0 !important;",
      "  height: 0 !important;",
      "  display: none !important;",
      "}",
      "body.user-dashboard-page,",
      "body.user-dashboard-page .user-dashboard-main {",
      "  background-color: #060b14 !important;",
      "}",
      "body.user-dashboard-page .user-dashboard-topbar {",
      "  background-color: rgba(6, 11, 20, 0.92) !important;",
      "}",
      "body.user-dashboard-page aside {",
      "  background-color: rgba(6, 11, 20, 0.96) !important;",
      "}",
      "body.user-dashboard-page [data-sidebar-rail-toggle] {",
      "  background: rgba(255, 255, 255, 0.08) !important;",
      "  border-color: rgba(255, 255, 255, 0.16) !important;",
      "  color: #e2e8f0 !important;",
      "  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35) !important;",
      "}",
      "body.user-dashboard-page [data-sidebar-rail-toggle]:hover {",
      "  background: rgba(255, 255, 255, 0.14) !important;",
      "  color: #fff !important;",
      "}",
      "body.user-dashboard-page {",
      "  --student-dashboard-page-bg: #060b14;",
      "  --student-dashboard-card-bg: #0d1117;",
      "}",
      "body.user-dashboard-page,",
      "body.user-dashboard-page > section,",
      "body.user-dashboard-page .user-dashboard-main,",
      "body.user-dashboard-page main {",
      "  background-color: var(--student-dashboard-page-bg) !important;",
      "}",
      "body.user-dashboard-page .ambient-glow-1 {",
      "  background: rgba(37, 99, 235, 0.08) !important;",
      "}",
      "body.user-dashboard-page .ambient-glow-2 {",
      "  background: rgba(6, 182, 212, 0.05) !important;",
      "}",
      "body.user-dashboard-page .tech-grid {",
      "  opacity: 1 !important;",
      "}",
      "body.user-dashboard-page .premium-card,",
      "body.user-dashboard-page .premium-inner-card,",
      "body.user-dashboard-page .wallet-plan,",
      "body.user-dashboard-page .glass-panel,",
      "body.user-dashboard-page #walletPlanCard,",
      "body.user-dashboard-page #coursesList > article,",
      "body.user-dashboard-page #coursesList > div,",
      "body.user-dashboard-page #discoverCoursesList > article,",
      "body.user-dashboard-page #discoverCoursesList > div,",
      "body.user-dashboard-page #discoverCoursesList > a,",
      "body.user-dashboard-page #familySeatSummary > div,",
      "body.user-dashboard-page #familyEnrollPanel,",
      "body.user-dashboard-page #familyEmpty,",
      "body.user-dashboard-page #familyChildrenGrid > article,",
      "body.user-dashboard-page #familyChildrenGrid > div,",
      "body.user-dashboard-page #familyEnrollChildren > div,",
      "body.user-dashboard-page #domainSuggestions > div,",
      "body.user-dashboard-page #domainsList > article,",
      "body.user-dashboard-page #domainsList > div,",
      "body.user-dashboard-page #domainOrdersList > article,",
      "body.user-dashboard-page #domainOrdersList > div,",
      "body.user-dashboard-page #domainRegisterSection,",
      "body.user-dashboard-page #domainCheckoutCard,",
      "body.user-dashboard-page #domainQuoteCard,",
      "body.user-dashboard-page [data-dns-panel],",
      "body.user-dashboard-page [data-dns-section],",
      "body.user-dashboard-page [data-netlify-section],",
      "body.user-dashboard-page [data-dns-row],",
      "body.user-dashboard-page .student-dashboard-card {",
      "  background-color: var(--student-dashboard-card-bg) !important;",
      "  background-image: none !important;",
      "}",
    ].join("\n");

    document.head.appendChild(style);
    document.body.classList.add("tochukwu-hide-scrollbars");
  }

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

  function setPendingState(linkEl) {
    if (!linkEl) return;
    linkEl.style.opacity = "0.85";
    linkEl.setAttribute("aria-busy", "true");
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

  function ensureSidebarIcons() {
    var iconMap = {
      "/dashboard/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>',
      "/dashboard/courses/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5 5.014 5 3 6.119 3 7.5v9C3 17.881 5.014 19 7.5 19c1.746 0 3.332-.477 4.5-1.253m0-11.494C13.168 5.477 14.754 5 16.5 5 18.986 5 21 6.119 21 7.5v9c0 1.381-2.014 2.5-4.5 2.5-1.746 0-3.332-.477-4.5-1.253" /></svg>',
      "/dashboard/domains/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.6 9h16.8M3.6 15h16.8M12 3c2.5 2.4 4 5.6 4 9s-1.5 6.6-4 9m0-18c-2.5 2.4-4 5.6-4 9s1.5 6.6 4 9" /></svg>',
      "/dashboard/affiliate/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5V4H2v16h5m10 0v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4m10 0H7m2-10h6m-6 4h6" /></svg>',
    };

    menuLinks.forEach(function (link) {
      if (!link || link.querySelector("svg")) return;
      var href = getPathFromHref(link.getAttribute("href"));
      var icon = iconMap[href];
      if (!icon) return;
      link.classList.add("group");
      link.insertAdjacentHTML("afterbegin", icon);
    });
  }

  function ensureSidebarLabelWrappers() {
    sidebars.forEach(function (aside) {
      var links = Array.prototype.slice.call(aside.querySelectorAll('a[href^="/dashboard/"]'));
      links.forEach(function (link) {
        if (link.querySelector("[data-nav-label]")) return;

        var existingLabel = Array.prototype.slice.call(link.children).find(function (child) {
          return child && String(child.tagName || "").toLowerCase() === "span" && String(child.textContent || "").trim();
        });
        if (existingLabel) {
          var existingText = String(existingLabel.textContent || "").replace(/\s+/g, " ").trim();
          existingLabel.setAttribute("data-nav-label", "1");
          link.setAttribute("title", existingText);
          return;
        }

        var labelText = "";
        Array.prototype.slice.call(link.childNodes).forEach(function (node) {
          if (node.nodeType === Node.TEXT_NODE) labelText += String(node.textContent || "");
        });
        labelText = labelText.replace(/\s+/g, " ").trim();
        if (!labelText) return;

        Array.prototype.slice.call(link.childNodes).forEach(function (node) {
          if (node.nodeType === Node.TEXT_NODE) link.removeChild(node);
        });

        var span = document.createElement("span");
        span.setAttribute("data-nav-label", "1");
        span.textContent = labelText;
        link.appendChild(span);
        link.setAttribute("title", labelText);
      });

      var heading = aside.querySelector("div > span.font-heading.font-bold.text-lg");
      if (heading && !heading.hasAttribute("data-brand-label")) {
        heading.setAttribute("data-brand-label", "1");
      }

      var menuLabel = aside.querySelector("p");
      if (menuLabel && !menuLabel.hasAttribute("data-menu-label")) {
        menuLabel.setAttribute("data-menu-label", "1");
      }

      var signout = aside.querySelector("[data-user-signout]");
      if (signout && !signout.querySelector("[data-signout-label]")) {
        var txt = String(signout.textContent || "").replace(/\s+/g, " ").trim() || "Sign out";
        signout.textContent = "";
        signout.insertAdjacentHTML(
          "afterbegin",
          '<svg data-signout-icon="1" class="hidden h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3-3H9.75m9 0l-3-3m3 3l-3 3" /></svg>'
        );
        var s = document.createElement("span");
        s.setAttribute("data-signout-label", "1");
        s.className = "w-full text-center";
        s.textContent = txt;
        signout.appendChild(s);
      }
    });
  }

  function styleSidebarCollapsed(aside, collapsed) {
    var labels = Array.prototype.slice.call(aside.querySelectorAll("[data-nav-label]"));
    var brandLabel = aside.querySelector("[data-brand-label]");
    var menuLabel = aside.querySelector("[data-menu-label]");
    var signoutLabel = aside.querySelector("[data-signout-label]");
    var signoutIcon = aside.querySelector("[data-signout-icon]");
    var brandRow = brandLabel ? brandLabel.parentElement : null;
    var brandLogo = brandRow ? brandRow.querySelector("img") : null;
    var navLinksInAside = Array.prototype.slice.call(aside.querySelectorAll('a[href^="/dashboard/"]'));
    var signout = aside.querySelector("[data-user-signout]");

    if (!collapsed || !isDesktop()) {
      aside.style.width = "";
      aside.style.flexBasis = "";
      navLinksInAside.forEach(function (link) {
        link.classList.remove("justify-center");
        link.style.paddingLeft = "";
        link.style.paddingRight = "";
      });
      labels.forEach(function (el) { el.style.display = ""; });
      if (brandLabel) brandLabel.style.display = "";
      if (brandRow) brandRow.style.justifyContent = "";
      if (brandLogo) brandLogo.style.marginRight = "";
      if (menuLabel) menuLabel.style.display = "";
      if (signoutLabel) {
        signoutLabel.style.display = "";
        signoutLabel.style.fontSize = "";
        signoutLabel.style.whiteSpace = "";
      }
      if (signoutIcon) signoutIcon.classList.add("hidden");
      if (signout) {
        signout.classList.remove("justify-center");
        signout.style.paddingLeft = "";
        signout.style.paddingRight = "";
        signout.removeAttribute("title");
      }
      aside.setAttribute("data-collapsed", "0");
      return;
    }

    aside.style.width = "5.5rem";
    aside.style.flexBasis = "5.5rem";
    navLinksInAside.forEach(function (link) {
      link.classList.add("justify-center");
      link.style.paddingLeft = "0.5rem";
      link.style.paddingRight = "0.5rem";
    });
    labels.forEach(function (el) { el.style.display = "none"; });
    if (brandLabel) brandLabel.style.display = "none";
    if (brandRow) brandRow.style.justifyContent = "center";
    if (brandLogo) brandLogo.style.marginRight = "0";
    if (menuLabel) menuLabel.style.display = "none";
    if (signoutLabel) {
      signoutLabel.style.display = "none";
    }
    if (signoutIcon) signoutIcon.classList.remove("hidden");
    if (signout) {
      signout.classList.add("justify-center");
      signout.style.paddingLeft = "0.5rem";
      signout.style.paddingRight = "0.5rem";
      signout.setAttribute("title", "Sign out");
    }
    aside.setAttribute("data-collapsed", "1");
  }

  function chevronSvg(collapsed) {
    if (collapsed) {
      return '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>';
    }
    return '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>';
  }

  function updateRailButtons(collapsed) {
    railToggleButtons.forEach(function (btn) {
      btn.innerHTML = chevronSvg(collapsed);
      btn.setAttribute("aria-pressed", collapsed ? "true" : "false");
      btn.setAttribute("aria-label", collapsed ? "Expand side menu" : "Collapse side menu");
      btn.setAttribute("title", collapsed ? "Expand menu" : "Collapse menu");
    });
  }

  function applySidebarCollapsed(collapsed) {
    sidebars.forEach(function (aside) {
      styleSidebarCollapsed(aside, collapsed);
    });
    updateRailButtons(collapsed);
  }

  function toggleSidebarCollapsed() {
    var next = !readCollapsedPref();
    writeCollapsedPref(next);
    applySidebarCollapsed(next);
  }

  function syncResponsiveShellState() {
    var mobileMenuToggle = document.getElementById("mobile-menu-toggle");
    if (mobileMenuToggle && isDesktop() && mobileMenuToggle.checked) {
      mobileMenuToggle.checked = false;
    }
  }

  function ensureRailToggleButtons() {
    sidebars.forEach(function (aside) {
      if (!aside || aside.querySelector("[data-sidebar-rail-toggle]")) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-sidebar-rail-toggle", "1");
      btn.className = "hidden md:inline-flex absolute top-20 -right-3 z-20 h-7 w-7 items-center justify-center rounded-full border border-brand-200 bg-white text-brand-700 shadow-sm hover:bg-brand-50 transition-colors";
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggleSidebarCollapsed();
      });
      aside.appendChild(btn);
      railToggleButtons.push(btn);
    });
  }

  async function signOut() {
    signoutButtons.forEach(function (button) {
      button.disabled = true;
      button.textContent = "Signing out...";
    });

    await fetch("/.netlify/functions/user-auth-logout", {
      method: "POST",
      credentials: "include",
    }).catch(function () {
      return null;
    });

    try {
      sessionStorage.setItem(SIGNOUT_MARKER_KEY, "1");
    } catch (_error) {}

    window.location.href = "/dashboard/";
  }

  injectHiddenScrollbarStyles();

  sidebars = Array.prototype.slice.call(document.querySelectorAll("aside")).filter(function (aside) {
    return !!aside.querySelector('a[href^="/dashboard/"]');
  });
  if (sidebars.length && menuLinks.length) {
    ensureSidebarIcons();
    ensureSidebarLabelWrappers();
    ensureRailToggleButtons();
    syncResponsiveShellState();
    applySidebarCollapsed(readCollapsedPref());
    window.addEventListener("resize", function () {
      syncResponsiveShellState();
      applySidebarCollapsed(readCollapsedPref());
    });
  }

  var currentPath = normalizePath(window.location.pathname);
  menuLinks.forEach(function (link) {
    var targetPath = getPathFromHref(link.getAttribute("href"));
    var isCurrentLink = targetPath && targetPath === currentPath;

    if (isCurrentLink) {
      link.setAttribute("aria-current", "page");
    }

    link.addEventListener("click", function (event) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      if (isCurrentLink) {
        event.preventDefault();
        return;
      }

      if (navLock) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      navLock = true;
      setPendingState(link);

      var mobileMenuToggle = document.getElementById("mobile-menu-toggle");
      if (mobileMenuToggle && mobileMenuToggle.checked) {
        mobileMenuToggle.checked = false;
      }

      var href = link.getAttribute("href");
      if (!href) {
        navLock = false;
        return;
      }

      window.setTimeout(function () {
        window.location.href = href;
      }, 45);
    });
  });

  signoutButtons.forEach(function (button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      if (navLock) return;
      navLock = true;
      button.disabled = true;
      button.style.opacity = "0.7";
      signOut().catch(function () {
        navLock = false;
        button.disabled = false;
        button.style.opacity = "1";
        window.location.href = "/dashboard/";
      });
    });
  });
})();
