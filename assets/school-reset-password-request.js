(function () {
  var form = document.getElementById("schoolResetRequestForm");
  var emailEl = document.getElementById("schoolResetRequestEmail");
  var statusEl = document.getElementById("schoolResetRequestStatus");
  var btn = document.getElementById("schoolResetRequestBtn");
  if (!form) return;

  function clean(value) {
    return String(value || "").trim();
  }

  function setStatus(text, bad) {
    if (!statusEl) return;
    statusEl.textContent = clean(text);
    statusEl.className = "text-sm " + (bad ? "text-red-600" : "text-emerald-700");
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setStatus("", false);
    var email = clean(emailEl && emailEl.value).toLowerCase();
    if (!email) {
      setStatus("Enter your email.", true);
      return;
    }
    btn.disabled = true;
    btn.textContent = "Sending...";
    try {
      var response = await fetch("/.netlify/functions/school-admin-password-reset-request", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: email }),
      });
      var data = await response.json().catch(function () {
        return null;
      });
      if (!response.ok || !data || data.ok !== true) {
        throw new Error((data && data.error) || "Could not send reset link.");
      }
      setStatus(data.message || "If this email exists, a reset link has been sent.", false);
      form.reset();
    } catch (error) {
      setStatus(error.message || "Could not send reset link.", true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Send Reset Link";
    }
  });
})();
