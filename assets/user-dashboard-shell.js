(function () {
  var SIGNOUT_MARKER_KEY = "tn_auth_just_signed_out";
  var navLinks = Array.from(document.querySelectorAll('a[href^="/dashboard/"]'));
  const signoutButtons = Array.from(document.querySelectorAll("[data-user-signout]"));

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
    ].join("\n");

    document.head.appendChild(style);
    document.body.classList.add("tochukwu-hide-scrollbars");
  }

  injectHiddenScrollbarStyles();

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

  navLinks.forEach(function (link) {
    var label = String(link && link.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (label === "register domain") {
      link.remove();
    }
  });
  navLinks = Array.from(document.querySelectorAll('a[href^="/dashboard/"]'));

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
