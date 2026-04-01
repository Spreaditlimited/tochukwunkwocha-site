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

  function ensureDomainManagementIcon() {
    var domainLinks = Array.prototype.slice.call(
      document.querySelectorAll('aside a[href="/internal/domain-management/"]')
    );
    domainLinks.forEach(function (link) {
      if (!link) return;
      if (link.querySelector("svg")) return;
      link.classList.add("group");
      link.insertAdjacentHTML(
        "afterbegin",
        '<svg class="h-5 w-5 text-brand-300 group-hover:text-brand-100 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 7.5V6a2 2 0 00-2-2h-2.5M3 7.5V6a2 2 0 012-2h2.5M21 16.5V18a2 2 0 01-2 2h-2.5M3 16.5V18a2 2 0 002 2h2.5M8 12h8M8 9h8M8 15h5" /></svg>'
      );
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
  ensureDomainManagementIcon();

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
