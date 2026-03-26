(function () {
  var form = document.getElementById("resetPasswordForm");
  var btn = document.getElementById("resetPasswordBtn");
  var msg = document.getElementById("resetPasswordMsg");
  if (!form) return;

  function setMsg(text, type) {
    if (!msg) return;
    msg.textContent = String(text || "");
    msg.className = "mt-4 text-sm";
    if (!text) return;
    if (type === "error") msg.classList.add("text-red-700");
    if (type === "ok") msg.classList.add("text-emerald-700");
  }

  function tokenFromQuery() {
    var qs = new URLSearchParams(window.location.search || "");
    return String(qs.get("token") || "").trim();
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setMsg("", "");

    var token = tokenFromQuery();
    var password = String((form.password && form.password.value) || "");
    var confirmPassword = String((form.confirmPassword && form.confirmPassword.value) || "");
    if (!token) {
      setMsg("Reset token is missing.", "error");
      return;
    }
    if (password.length < 8) {
      setMsg("Password must be at least 8 characters.", "error");
      return;
    }
    if (password !== confirmPassword) {
      setMsg("Passwords do not match.", "error");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Resetting...";
    try {
      var res = await fetch("/.netlify/functions/user-auth-password-reset-complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token, password: password }),
      });
      var json = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not reset password");
      }
      setMsg("Password reset successful. Redirecting to dashboard...", "ok");
      window.setTimeout(function () {
        window.location.href = "/dashboard/";
      }, 1200);
    } catch (error) {
      setMsg(error.message || "Could not reset password", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Reset Password";
    }
  });
})();
