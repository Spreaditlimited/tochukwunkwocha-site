(function () {
  var menuLinks = Array.prototype.slice.call(
    document.querySelectorAll('aside a[href^="/internal/"]')
  );
  if (!menuLinks.length) return;

  var navLock = false;
  var SIDEBAR_COLLAPSE_KEY = "tochukwu_internal_sidebar_collapsed";
  var sidebars = [];
  var railToggleButtons = [];
  var sidebarSignoutButtons = Array.prototype.slice.call(
    document.querySelectorAll("[data-admin-signout]")
  );

  function normalizePath(pathname) {
    var path = String(pathname || "/").trim();
    if (!path) return "/";
    return path.endsWith("/") ? path : path + "/";
  }

  function titleForPath(pathname) {
    var path = normalizePath(pathname);
    if (path === "/internal/") return { page: "Dashboard Overview", doc: "Internal Dashboard | Tochukwu Nkwocha" };
    if (path === "/internal/manual-payments/") return { page: "Enrollments", doc: "Enrollments | Internal" };
    if (path === "/internal/installments/") return { page: "Installments", doc: "Installments | Internal" };
    if (path === "/internal/leadpage-jobs/") return { page: "Lead Capture Queue", doc: "Leadpage Jobs | Internal" };
    if (path === "/internal/business-plan-manager/") return { page: "Business Plan Manager", doc: "Business Plan Manager | Internal" };
    if (path === "/internal/domain-management/") return { page: "Domain Management", doc: "Domain Management | Internal" };
    if (path === "/internal/video-library/") return { page: "Video Library", doc: "Video Library | Internal" };
    if (path === "/internal/learning-progress/") return { page: "Learning Progress", doc: "Learning Progress | Internal" };
    if (path === "/internal/schools/") return { page: "Schools", doc: "Schools | Internal" };
    if (path === "/internal/settings/") return { page: "Settings", doc: "Settings | Internal" };
    if (path === "/internal/verifier/") return { page: "Business Plan Verification Queue", doc: "Business Plan Verifier | Internal" };
    return null;
  }

  function syncPageTitle() {
    var mapped = titleForPath(window.location.pathname);
    if (!mapped) return;

    var heading = document.querySelector("main h2") || document.querySelector("header h2");
    if (heading) heading.textContent = mapped.page;

    if (typeof document !== "undefined" && mapped.doc) {
      document.title = mapped.doc;
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

  async function logoutAdmin() {
    await fetch("/.netlify/functions/admin-logout", {
      method: "POST",
      credentials: "include",
    }).catch(function () {
      return null;
    });
    window.location.href = "/internal/";
  }

  var currentPath = normalizePath(window.location.pathname);
  var hiddenInternalPaths = ["/internal/leadpage-jobs/", "/internal/business-plan-manager/", "/internal/verifier/"];

  function ensureVideoLibraryNavLink() {
    var added = [];
    var asides = Array.prototype.slice.call(document.querySelectorAll("aside"));
    asides.forEach(function (aside) {
      if (!aside) return;
      var existing = aside.querySelector('a[href="/internal/video-library/"]');
      if (existing) return;

      var settingsLink = aside.querySelector('a[href="/internal/settings/"]');
      if (!settingsLink || !settingsLink.parentNode) return;

      var a = document.createElement("a");
      a.href = "/internal/video-library/";
      a.className = "flex items-center gap-3 px-3 py-2.5 text-brand-100 hover:bg-white/5 hover:text-white rounded-lg font-medium transition-colors group";
      a.textContent = "Video Library";
      settingsLink.parentNode.insertBefore(a, settingsLink);
      added.push(a);
    });

    if (added.length) {
      menuLinks = menuLinks.concat(added);
    }
  }

  function ensureLearningProgressNavLink() {
    var added = [];
    var asides = Array.prototype.slice.call(document.querySelectorAll("aside"));
    asides.forEach(function (aside) {
      if (!aside) return;
      var existing = aside.querySelector('a[href="/internal/learning-progress/"]');
      if (existing) return;

      var videoLink = aside.querySelector('a[href="/internal/video-library/"]');
      var settingsLink = aside.querySelector('a[href="/internal/settings/"]');
      var anchor = videoLink || settingsLink;
      if (!anchor || !anchor.parentNode) return;

      var a = document.createElement("a");
      a.href = "/internal/learning-progress/";
      a.className = "flex items-center gap-3 px-3 py-2.5 text-brand-100 hover:bg-white/5 hover:text-white rounded-lg font-medium transition-colors group";
      a.textContent = "Learning Progress";

      if (videoLink && videoLink.parentNode) {
        videoLink.parentNode.insertBefore(a, videoLink.nextSibling);
      } else {
        anchor.parentNode.insertBefore(a, anchor);
      }
      added.push(a);
    });

    if (added.length) {
      menuLinks = menuLinks.concat(added);
    }
  }

  function ensureSchoolsNavLink() {
    var added = [];
    var asides = Array.prototype.slice.call(document.querySelectorAll("aside"));
    asides.forEach(function (aside) {
      if (!aside) return;
      var existing = aside.querySelector('a[href="/internal/schools/"]');
      if (existing) return;

      var learningLink = aside.querySelector('a[href="/internal/learning-progress/"]');
      var settingsLink = aside.querySelector('a[href="/internal/settings/"]');
      var anchor = learningLink || settingsLink;
      if (!anchor || !anchor.parentNode) return;

      var a = document.createElement("a");
      a.href = "/internal/schools/";
      a.className = "flex items-center gap-3 px-3 py-2.5 text-brand-100 hover:bg-white/5 hover:text-white rounded-lg font-medium transition-colors group";
      a.textContent = "Schools";

      if (learningLink && learningLink.parentNode) {
        learningLink.parentNode.insertBefore(a, learningLink.nextSibling);
      } else {
        anchor.parentNode.insertBefore(a, anchor);
      }
      added.push(a);
    });

    if (added.length) {
      menuLinks = menuLinks.concat(added);
    }
  }

  function ensureSidebarIcons() {
    var iconMap = {
      "/internal/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>',
      "/internal/manual-payments/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>',
      "/internal/installments/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
      "/internal/leadpage-jobs/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z" /></svg>',
      "/internal/business-plan-manager/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
      "/internal/domain-management/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 7.5V6a2 2 0 00-2-2h-2.5M3 7.5V6a2 2 0 012-2h2.5M21 16.5V18a2 2 0 01-2 2h-2.5M3 16.5V18a2 2 0 002 2h2.5M8 12h8M8 9h8M8 15h5" /></svg>',
      "/internal/video-library/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-9 5h7a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>',
      "/internal/learning-progress/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-6m3 6V7m3 10v-3m3 3V4M4 20h16" /></svg>',
      "/internal/schools/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5V4H2v16h5m10 0v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4m10 0H7m2-10h6m-6 4h6" /></svg>',
      "/internal/settings/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.591 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.59c1.756.427 1.756 2.925 0 3.352a1.724 1.724 0 00-1.066 2.59c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.59 1.066c-.427 1.756-2.925 1.756-3.352 0a1.724 1.724 0 00-2.59-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.59c-1.756-.427-1.756-2.925 0-3.352a1.724 1.724 0 001.066-2.59c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.59-1.066z" /></svg>',
      "/internal/verifier/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
    };

    menuLinks.forEach(function (link) {
      if (!link) return;
      if (link.querySelector("svg")) return;
      var href = getPathFromHref(link.getAttribute("href"));
      var icon = iconMap[href];
      if (!icon) return;
      link.classList.add("group");
      link.insertAdjacentHTML("afterbegin", icon);
    });
  }

  function ensureSidebarLabelWrappers() {
    sidebars.forEach(function (aside) {
      var links = Array.prototype.slice.call(aside.querySelectorAll('a[href^="/internal/"]'));
      links.forEach(function (link) {
        if (link.querySelector("[data-nav-label]")) return;
        var labelText = "";
        Array.prototype.slice.call(link.childNodes).forEach(function (node) {
          if (node.nodeType === Node.TEXT_NODE) {
            labelText += String(node.textContent || "");
          }
        });
        labelText = labelText.replace(/\s+/g, " ").trim();
        if (!labelText) return;

        Array.prototype.slice.call(link.childNodes).forEach(function (node) {
          if (node.nodeType === Node.TEXT_NODE) {
            link.removeChild(node);
          }
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

      var signout = aside.querySelector("[data-admin-signout]");
      if (signout && !signout.querySelector("[data-signout-label]")) {
        var txt = String(signout.textContent || "").replace(/\s+/g, " ").trim() || "Sign out";
        signout.textContent = "";

        var icon = document.createElement("span");
        icon.setAttribute("data-signout-icon", "1");
        icon.className = "inline-flex shrink-0 text-white/95";
        icon.setAttribute("aria-hidden", "true");
        icon.innerHTML =
          '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">' +
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H9m4 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />' +
          "</svg>";
        signout.appendChild(icon);

        var s = document.createElement("span");
        s.setAttribute("data-signout-label", "1");
        s.className = "ml-2";
        s.textContent = txt;
        signout.appendChild(s);
      }
    });
  }

  function styleSidebarCollapsed(aside, collapsed) {
    var labels = Array.prototype.slice.call(aside.querySelectorAll("[data-nav-label]"));
    var brandLabel = aside.querySelector("[data-brand-label]");
    var menuLabel = aside.querySelector("[data-menu-label]");
    var signoutIcon = aside.querySelector("[data-signout-icon]");
    var signoutLabel = aside.querySelector("[data-signout-label]");
    var navLinks = Array.prototype.slice.call(aside.querySelectorAll('a[href^="/internal/"]'));
    var signout = aside.querySelector("[data-admin-signout]");

    if (!collapsed || !isDesktop()) {
      aside.style.width = "";
      navLinks.forEach(function (link) {
        link.classList.remove("justify-center");
        link.style.paddingLeft = "";
        link.style.paddingRight = "";
      });
      labels.forEach(function (el) { el.style.display = ""; });
      if (brandLabel) brandLabel.style.display = "";
      if (menuLabel) menuLabel.style.display = "";
      if (signoutIcon) signoutIcon.style.display = "";
      if (signoutLabel) signoutLabel.style.display = "";
      if (signout) {
        signout.classList.remove("justify-center");
        signout.style.paddingLeft = "";
        signout.style.paddingRight = "";
      }
      aside.setAttribute("data-collapsed", "0");
      return;
    }

    aside.style.width = "5.5rem";
    navLinks.forEach(function (link) {
      link.classList.add("justify-center");
      link.style.paddingLeft = "0.5rem";
      link.style.paddingRight = "0.5rem";
    });
    labels.forEach(function (el) { el.style.display = "none"; });
    if (brandLabel) brandLabel.style.display = "none";
    if (menuLabel) menuLabel.style.display = "none";
    if (signoutIcon) signoutIcon.style.display = "";
    if (signoutLabel) signoutLabel.style.display = "none";
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

  function shouldHidePath(pathname) {
    var path = normalizePath(pathname);
    return hiddenInternalPaths.indexOf(path) !== -1;
  }

  function hideInternalEntries() {
    hiddenInternalPaths.forEach(function (path) {
      var navSelector = 'aside a[href="' + path + '"]';
      Array.prototype.slice.call(document.querySelectorAll(navSelector)).forEach(function (link) {
        var row = link.closest("a");
        if (row) row.classList.add("hidden");
      });

      var cardSelector = 'main article a[href="' + path + '"]';
      Array.prototype.slice.call(document.querySelectorAll(cardSelector)).forEach(function (cardLink) {
        var card = cardLink.closest("article");
        if (card) card.classList.add("hidden");
      });
    });
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

  syncPageTitle();
  ensureVideoLibraryNavLink();
  ensureLearningProgressNavLink();
  ensureSchoolsNavLink();
  sidebars = Array.prototype.slice.call(document.querySelectorAll("aside")).filter(function (aside) {
    return !!aside.querySelector('a[href^="/internal/"]');
  });
  hideInternalEntries();
  ensureSidebarIcons();
  ensureSidebarLabelWrappers();
  ensureRailToggleButtons();
  applySidebarCollapsed(readCollapsedPref());
  window.addEventListener("resize", function () {
    applySidebarCollapsed(readCollapsedPref());
  });

  menuLinks.forEach(function (link) {
    var targetPath = getPathFromHref(link.getAttribute("href"));
    if (shouldHidePath(targetPath)) return;
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

      // Let the mobile drawer close before leaving the page.
      window.setTimeout(function () {
        window.location.href = href;
      }, 45);
    });
  });

  sidebarSignoutButtons.forEach(function (button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      if (navLock) return;
      navLock = true;
      button.disabled = true;
      button.style.opacity = "0.7";
      logoutAdmin().catch(function () {
        navLock = false;
        button.disabled = false;
        button.style.opacity = "1";
      });
    });
  });
})();
