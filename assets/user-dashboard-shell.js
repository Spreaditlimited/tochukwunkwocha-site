(function () {
  var SIGNOUT_MARKER_KEY = "tn_auth_just_signed_out";
  var navLinks = Array.from(document.querySelectorAll('a[href^="/dashboard/"]'));
  const signoutButtons = Array.from(document.querySelectorAll("[data-user-signout]"));

  function normalizePath(pathname) {
    var path = String(pathname || "/").trim();
    if (!path) return "/";
    return path.endsWith("/") ? path : path + "/";
  }

  function pathFromHref(rawHref) {
    try {
      return normalizePath(new URL(String(rawHref || ""), window.location.origin).pathname);
    } catch (_error) {
      return "";
    }
  }

  var currentPath = normalizePath(window.location.pathname);

  navLinks.forEach(function (link) {
    var targetPath = pathFromHref(link.getAttribute("href"));
    if (!targetPath || targetPath !== currentPath) return;
    link.setAttribute("aria-current", "page");
    link.addEventListener("click", function (event) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
    });
  });

  if (!signoutButtons.length) return;

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

  signoutButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      signOut().catch(function () {
        window.location.href = "/dashboard/";
      });
    });
  });
})();
