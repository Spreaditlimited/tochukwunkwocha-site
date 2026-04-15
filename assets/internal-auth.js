(function () {
  const loginCard = document.getElementById("internalLoginCard");
  const toolsCard = document.getElementById("internalToolsCard");
  const loginForm = document.getElementById("internalLoginForm");
  const loginBtn = document.getElementById("internalLoginBtn");
  const loginErr = document.getElementById("internalLoginError");
  const logoutBtn = document.getElementById("internalLogoutBtn");
  const SIGNOUT_MARKER_KEY = "tn_auth_just_signed_out";
  var authResolved = false;

  function setView(authed) {
    const isAuthed = !!authed;
    if (loginCard) loginCard.hidden = isAuthed;
    if (toolsCard) toolsCard.hidden = !isAuthed;
  }

  function nextUrl() {
    const qs = new URLSearchParams(window.location.search);
    const raw = String(qs.get("next") || "").trim();
    if (!raw.startsWith("/internal/")) return "";
    if (/^\/internal\/business-plan-manager(?:\/|$|\?)/i.test(raw)) return "";
    return raw;
  }

  async function checkSession() {
    const res = await fetch("/.netlify/functions/admin-session", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    return res.ok;
  }

  function withTimeout(promise, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error("Session check timed out"));
      }, Math.max(300, Number(timeoutMs || 2500)));
      promise.then(function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }).catch(function (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async function login(password) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, 15000);
    var res;
    try {
      res = await fetch("/.netlify/functions/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("Sign in timed out. Please try again.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Sign in failed");
    }
  }

  async function logout() {
    await fetch("/.netlify/functions/admin-logout", {
      method: "POST",
      credentials: "include",
    }).catch(function () {
      return null;
    });
    try {
      sessionStorage.setItem(SIGNOUT_MARKER_KEY, "1");
    } catch (_error) {}
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (loginErr) loginErr.textContent = "";
      const password = String((loginForm.password && loginForm.password.value) || "");
      if (!password.trim()) {
        if (loginErr) loginErr.textContent = "Password is required.";
        return;
      }
      if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = "Signing in...";
      }
      try {
        await login(password);
        const next = nextUrl();
        if (next) {
          window.location.href = next;
          return;
        }
        setView(true);
        loginForm.reset();
      } catch (error) {
        if (loginErr) loginErr.textContent = error.message || "Sign in failed";
      } finally {
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.textContent = "Authenticate";
        }
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      await logout();
      window.location.href = "/internal/";
    });
  }

  // Avoid blank page while auth probe is in-flight.
  setView(false);

  var sessionProbe = checkSession();

  sessionProbe
    .then(function (authed) {
      authResolved = true;
      if (authed) {
        setView(true);
      } else {
        setView(false);
      }
    })
    .catch(function () {
      authResolved = true;
      setView(false);
    });

  // If the auth endpoint is slow/unavailable, keep UI usable.
  withTimeout(sessionProbe, 2500)
    .then(function (authed) {
      if (authResolved) return;
      authResolved = true;
      setView(!!authed);
    })
    .catch(function () {
      if (authResolved) return;
      authResolved = true;
      setView(false);
    });
})();
