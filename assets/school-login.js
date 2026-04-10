(function () {
  var form = document.getElementById("schoolLoginForm");
  var registerForm = document.getElementById("schoolRegisterForm");
  var emailEl = document.getElementById("schoolLoginEmail");
  var passwordEl = document.getElementById("schoolLoginPassword");
  var statusEl = document.getElementById("schoolLoginStatus");
  var btn = document.getElementById("schoolLoginBtn");
  var showSignInBtn = document.getElementById("schoolShowSignInBtn");
  var showRegisterBtn = document.getElementById("schoolShowRegisterBtn");
  var registerStatusEl = document.getElementById("schoolRegisterStatus");

  function clean(value) {
    return String(value || "").trim();
  }

  function setStatus(text, bad) {
    if (!statusEl) return;
    statusEl.textContent = clean(text);
    statusEl.className = "text-sm " + (bad ? "text-red-600" : "text-slate-600");
  }

  function setRegisterStatus(text, bad) {
    if (!registerStatusEl) return;
    registerStatusEl.textContent = clean(text);
    registerStatusEl.className = "text-sm " + (bad ? "text-red-600" : "text-slate-600");
  }

  function setMode(mode) {
    var register = String(mode || "").toLowerCase() === "register";
    if (form) form.hidden = register;
    if (registerForm) registerForm.hidden = !register;
    if (showSignInBtn) {
      showSignInBtn.className = register
        ? "flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-gray-600"
        : "flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-gray-900 bg-white shadow-sm ring-1 ring-gray-200";
      showSignInBtn.setAttribute("aria-selected", register ? "false" : "true");
    }
    if (showRegisterBtn) {
      showRegisterBtn.className = register
        ? "flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-gray-900 bg-white shadow-sm ring-1 ring-gray-200"
        : "flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-gray-600";
      showRegisterBtn.setAttribute("aria-selected", register ? "true" : "false");
    }
  }

  if (!form) return;

  if (showSignInBtn) {
    showSignInBtn.addEventListener("click", function () {
      setMode("signin");
    });
  }
  if (showRegisterBtn) {
    showRegisterBtn.addEventListener("click", function () {
      setMode("register");
    });
  }

  (function initFromQuery() {
    var query = new URLSearchParams(window.location.search || "");
    var mode = clean(query.get("mode")).toLowerCase();
    var payment = clean(query.get("payment")).toLowerCase();
    if (mode === "register" || payment === "failed") setMode("register");
    else setMode("signin");
    if (payment === "failed") {
      setRegisterStatus("Payment was not completed. Please try again.", true);
    }
  })();

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setStatus("", false);
    btn.disabled = true;
    btn.textContent = "Signing in...";
    try {
      var response = await fetch("/.netlify/functions/school-admin-login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: clean(emailEl && emailEl.value),
          password: String(passwordEl && passwordEl.value || ""),
        }),
      });
      var data = await response.json().catch(function () {
        return null;
      });
      if (!response.ok || !data || data.ok !== true) {
        throw new Error((data && data.error) || "Could not sign in.");
      }
      window.location.href = "/schools/dashboard/";
    } catch (error) {
      setStatus(error.message || "Could not sign in.", true);
      btn.disabled = false;
      btn.textContent = "Sign In";
    }
  });
})();
