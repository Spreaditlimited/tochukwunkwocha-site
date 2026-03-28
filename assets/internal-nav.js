(function () {
  var menuLinks = Array.prototype.slice.call(
    document.querySelectorAll('aside a[href^="/internal/"]')
  );
  if (!menuLinks.length) return;

  var navLock = false;

  function normalizePath(pathname) {
    var path = String(pathname || "/").trim();
    if (!path) return "/";
    return path.endsWith("/") ? path : path + "/";
  }

  var currentPath = normalizePath(window.location.pathname);

  function getPathFromHref(rawHref) {
    try {
      return normalizePath(new URL(String(rawHref || ""), window.location.origin).pathname);
    } catch (_error) {
      return "";
    }
  }

  function setLoadingState(linkEl) {
    document.body.classList.add("internal-nav-loading");
    if (linkEl) {
      linkEl.style.opacity = "0.7";
      linkEl.style.pointerEvents = "none";
    }
  }

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

      navLock = true;
      setLoadingState(link);

      var mobileMenuToggle = document.getElementById("mobile-menu-toggle");
      if (mobileMenuToggle && mobileMenuToggle.checked) {
        mobileMenuToggle.checked = false;
      }
    });
  });
})();
