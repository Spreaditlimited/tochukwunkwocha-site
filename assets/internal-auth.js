(function () {
  const loginCard = document.getElementById("internalLoginCard");
  const toolsCard = document.getElementById("internalToolsCard");
  const loginForm = document.getElementById("internalLoginForm");
  const loginBtn = document.getElementById("internalLoginBtn");
  const loginErr = document.getElementById("internalLoginError");
  const logoutBtn = document.getElementById("internalLogoutBtn");

  function setView(authed) {
    const isAuthed = !!authed;
    if (loginCard) loginCard.hidden = isAuthed;
    if (toolsCard) toolsCard.hidden = !isAuthed;
  }

  function nextUrl() {
    const qs = new URLSearchParams(window.location.search);
    const raw = String(qs.get("next") || "").trim();
    if (!raw.startsWith("/internal/")) return "";
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

  async function login(password) {
    const res = await fetch("/.netlify/functions/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password }),
    });
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
          loginBtn.textContent = "Sign in";
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

  checkSession()
    .then(function (authed) {
      if (authed) {
        setView(true);
      } else {
        setView(false);
      }
    })
    .catch(function () {
      setView(false);
    });
})();
