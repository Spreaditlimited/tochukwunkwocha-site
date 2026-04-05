(function () {
  var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-auth-back]"));
  if (!buttons.length) return;

  var SIGNOUT_MARKER_KEY = "tn_auth_just_signed_out";

  function consumeSignedOutMarker() {
    try {
      var value = String(sessionStorage.getItem(SIGNOUT_MARKER_KEY) || "");
      if (value !== "1") return false;
      sessionStorage.removeItem(SIGNOUT_MARKER_KEY);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function sameOriginReferrerPath() {
    var ref = String(document.referrer || "").trim();
    if (!ref) return "";
    try {
      var parsed = new URL(ref);
      if (parsed.origin !== window.location.origin) return "";
      return parsed.pathname + parsed.search + parsed.hash;
    } catch (_error) {
      return "";
    }
  }

  function goBack() {
    if (consumeSignedOutMarker()) {
      window.location.href = "/";
      return;
    }
    var refPath = sameOriginReferrerPath();
    var currentPath = window.location.pathname + window.location.search + window.location.hash;
    if (refPath && refPath !== currentPath && window.history.length > 1) {
      window.history.back();
      return;
    }
    if (refPath && refPath !== currentPath) {
      window.location.href = refPath;
      return;
    }
    window.location.href = "/";
  }

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      goBack();
    });
  });
})();
