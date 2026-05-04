(function () {
  var state = {
    configPromise: null,
    scriptPromise: null,
    siteKey: "",
    enabled: false,
  };

  function loadConfig() {
    if (state.configPromise) return state.configPromise;
    state.configPromise = fetch("/.netlify/functions/recaptcha-config", { method: "GET" })
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        var data = json && typeof json === "object" ? json : {};
        state.enabled = Boolean(data.enabled);
        state.siteKey = String(data.siteKey || "").trim();
        return state;
      })
      .catch(function () {
        state.enabled = false;
        state.siteKey = "";
        return state;
      });
    return state.configPromise;
  }

  function loadScript() {
    if (state.scriptPromise) return state.scriptPromise;
    state.scriptPromise = new Promise(function (resolve, reject) {
      if (window.grecaptcha && typeof window.grecaptcha.ready === "function") {
        resolve();
        return;
      }
      var script = document.createElement("script");
      script.src = "https://www.google.com/recaptcha/api.js?render=" + encodeURIComponent(state.siteKey);
      script.async = true;
      script.defer = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("Could not load security verification.")); };
      document.head.appendChild(script);
    });
    return state.scriptPromise;
  }

  function execute(action) {
    return new Promise(function (resolve, reject) {
      if (!window.grecaptcha || typeof window.grecaptcha.ready !== "function") {
        reject(new Error("Security verification is unavailable."));
        return;
      }
      window.grecaptcha.ready(function () {
        window.grecaptcha.execute(state.siteKey, { action: String(action || "submit") })
          .then(resolve)
          .catch(function () {
            reject(new Error("Could not complete security verification."));
          });
      });
    });
  }

  async function getToken(action) {
    await loadConfig();
    if (!state.enabled) return "";
    if (!state.siteKey) throw new Error("Security verification is not configured.");
    await loadScript();
    return execute(action);
  }

  window.recaptchaHelper = {
    getToken: getToken,
  };
})();

