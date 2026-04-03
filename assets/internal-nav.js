(function () {
  var menuLinks = Array.prototype.slice.call(
    document.querySelectorAll('aside a[href^="/internal/"]')
  );
  if (!menuLinks.length) return;

  var navLock = false;
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
  hideInternalEntries();
  ensureSidebarIcons();

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
