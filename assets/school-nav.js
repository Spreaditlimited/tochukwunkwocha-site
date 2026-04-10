(function () {
  var menuLinks = Array.prototype.slice.call(
    document.querySelectorAll('aside a[href^="/schools/"], aside a[href^="#"]')
  );
  if (!menuLinks.length) return;

  var navLock = false;
  var SIDEBAR_COLLAPSE_KEY = "tochukwu_school_sidebar_collapsed";
  var sidebars = Array.prototype.slice.call(document.querySelectorAll("aside"));
  var primarySidebar = document.getElementById("schoolSidebar") || sidebars[0] || null;
  var mobileMenuButton = document.getElementById("schoolMobileMenuButton");
  var mobileMenuOverlay = document.getElementById("schoolMobileMenuOverlay");
  var railToggleButtons = [];
  var sidebarSignoutButtons = Array.prototype.slice.call(
    document.querySelectorAll("[data-school-signout]")
  );
  var mobileMenuOpen = false;

  function normalizePath(pathname) {
    var path = String(pathname || "/").trim();
    if (!path) return "/";
    return path.endsWith("/") ? path : path + "/";
  }

  function isDesktop() {
    return window.matchMedia("(min-width: 768px)").matches;
  }

  function setMobileMenuOpen(open) {
    var shouldOpen = !!open && !isDesktop();
    mobileMenuOpen = shouldOpen;

    if (primarySidebar) {
      primarySidebar.classList.toggle("translate-x-0", shouldOpen);
      primarySidebar.classList.toggle("-translate-x-full", !shouldOpen);
    }
    if (mobileMenuOverlay) {
      mobileMenuOverlay.classList.toggle("hidden", !shouldOpen);
    }
    if (mobileMenuButton) {
      mobileMenuButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    }
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
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

  async function logoutSchoolAdmin() {
    await fetch("/.netlify/functions/school-admin-logout", {
      method: "POST",
      credentials: "include",
    }).catch(function () {
      return null;
    });
    window.location.href = "/schools/login/";
  }

  function ensureSidebarIcons() {
    var iconMap = {
      "/schools/dashboard/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>',
      "/schools/reset-password-request/":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c0 1.657-1.343 3-3 3S6 12.657 6 11s1.343-3 3-3 3 1.343 3 3zm0 0V9a3 3 0 116 0v2m-6 0h6m-6 0v6m0 0h6m-6 0H6a2 2 0 01-2-2v-4a2 2 0 012-2h6" /></svg>',
      "#studentsSection":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5V4H2v16h5m10 0v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4m10 0H7m2-10h6m-6 4h6" /></svg>',
      "#uploadSection":
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" /></svg>',
    };

    menuLinks.forEach(function (link) {
      if (!link) return;
      if (link.querySelector("svg")) return;
      var href = String(link.getAttribute("href") || "");
      var key = href.startsWith("#") ? href : normalizePath(href);
      var icon = iconMap[key];
      if (!icon) return;
      link.classList.add("group");
      link.insertAdjacentHTML("afterbegin", icon);
    });
  }

  function ensureSidebarLabelWrappers() {
    sidebars.forEach(function (aside) {
      var links = Array.prototype.slice.call(aside.querySelectorAll('a[href^="/schools/"], a[href^="#"]'));
      links.forEach(function (link) {
        if (link.querySelector("[data-nav-label]")) return;
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

      var brandLabel = aside.querySelector("[data-brand-label]");
      if (!brandLabel) {
        var heading = aside.querySelector("div > span.font-heading.font-bold.text-lg");
        if (heading) heading.setAttribute("data-brand-label", "1");
      }

      var menuLabel = aside.querySelector("[data-menu-label]") || aside.querySelector("p");
      if (menuLabel && !menuLabel.hasAttribute("data-menu-label")) menuLabel.setAttribute("data-menu-label", "1");

      var signout = aside.querySelector("[data-school-signout]");
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

        var label = document.createElement("span");
        label.setAttribute("data-signout-label", "1");
        label.className = "ml-2";
        label.textContent = txt;
        signout.appendChild(label);
      }
    });
  }

  function styleSidebarCollapsed(aside, collapsed) {
    var labels = Array.prototype.slice.call(aside.querySelectorAll("[data-nav-label]"));
    var brandLabel = aside.querySelector("[data-brand-label]");
    var menuLabel = aside.querySelector("[data-menu-label]");
    var signoutIcon = aside.querySelector("[data-signout-icon]");
    var signoutLabel = aside.querySelector("[data-signout-label]");
    var navLinks = Array.prototype.slice.call(aside.querySelectorAll('a[href^="/schools/"], a[href^="#"]'));
    var signout = aside.querySelector("[data-school-signout]");

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
        signout.classList.add("justify-center");
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

  function handleAnchorNav(link) {
    var href = String(link.getAttribute("href") || "");
    if (!href.startsWith("#")) return false;
    var target = document.querySelector(href);
    if (!target) return true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    closeMobileMenu();
    return true;
  }

  ensureSidebarIcons();
  ensureSidebarLabelWrappers();
  ensureRailToggleButtons();
  closeMobileMenu();
  applySidebarCollapsed(readCollapsedPref());
  window.addEventListener("resize", function () {
    closeMobileMenu();
    applySidebarCollapsed(readCollapsedPref());
  });
  if (mobileMenuButton) {
    mobileMenuButton.addEventListener("click", function () {
      setMobileMenuOpen(!mobileMenuOpen);
    });
  }
  if (mobileMenuOverlay) {
    mobileMenuOverlay.addEventListener("click", function () {
      closeMobileMenu();
    });
  }
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    closeMobileMenu();
  });

  menuLinks.forEach(function (link) {
    link.addEventListener("click", function (event) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      var handledAnchor = handleAnchorNav(link);
      if (handledAnchor) {
        event.preventDefault();
        return;
      }

      if (navLock) {
        event.preventDefault();
        return;
      }

      closeMobileMenu();
    });
  });

  sidebarSignoutButtons.forEach(function (button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      if (navLock) return;
      navLock = true;
      button.disabled = true;
      button.style.opacity = "0.7";
      logoutSchoolAdmin().catch(function () {
        navLock = false;
        button.disabled = false;
        button.style.opacity = "1";
      });
    });
  });
})();
