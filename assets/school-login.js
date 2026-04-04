(function () {
  var form = document.getElementById("schoolLoginForm");
  var emailEl = document.getElementById("schoolLoginEmail");
  var passwordEl = document.getElementById("schoolLoginPassword");
  var statusEl = document.getElementById("schoolLoginStatus");
  var btn = document.getElementById("schoolLoginBtn");

  function clean(value) {
    return String(value || "").trim();
  }

  function setStatus(text, bad) {
    if (!statusEl) return;
    statusEl.textContent = clean(text);
    statusEl.className = "text-sm " + (bad ? "text-red-600" : "text-slate-600");
  }

  if (!form) return;

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

