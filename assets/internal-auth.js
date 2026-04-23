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
    try {
      document.dispatchEvent(new CustomEvent("internal-auth-state", { detail: { authed: isAuthed } }));
    } catch (_error) {}
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
    if (!res.ok) return { ok: false, account: null };
    const data = await res.json().catch(function () {
      return null;
    });
    return { ok: true, account: data && data.account ? data.account : null };
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

  async function login(email, password) {
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
        body: JSON.stringify({ email, password }),
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
      const email = String((loginForm.email && loginForm.email.value) || "").trim().toLowerCase();
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
        await login(email, password);
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

  // Keep the initial hidden state while auth probe runs to avoid login-card flash.
  (function surfaceDeniedMessage() {
    if (!loginErr) return;
    try {
      var qs = new URLSearchParams(window.location.search || "");
      var denied = String(qs.get("denied") || "").trim();
      if (denied) {
        loginErr.textContent = "Access denied for " + denied + ".";
      }
    } catch (_error) {}
  })();

  var sessionProbe = checkSession();

  sessionProbe
    .then(function (session) {
      authResolved = true;
      if (session && session.ok) {
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
    .then(function (session) {
      if (authResolved) return;
      authResolved = true;
      setView(!!(session && session.ok));
    })
    .catch(function () {
      if (authResolved) return;
      authResolved = true;
      setView(false);
    });
})();
