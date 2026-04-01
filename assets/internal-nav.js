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
