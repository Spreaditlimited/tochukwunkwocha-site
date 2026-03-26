(function () {
  var loginCard = document.getElementById("verifierLoginCard");
  var loginForm = document.getElementById("verifierLoginForm");
  var loginBtn = document.getElementById("verifierLoginBtn");
  var loginMsg = document.getElementById("verifierLoginMsg");
  var app = document.getElementById("verifierApp");
  var rows = document.getElementById("verifierRows");
  var meta = document.getElementById("verifierMeta");
  var signOutBtn = document.getElementById("verifierSignOutBtn");
  var modal = document.getElementById("verifierModal");
  var planTextEl = document.getElementById("verifierPlanText");
  var notesEl = document.getElementById("verifierNotes");
  var markBtn = document.getElementById("verifierMarkBtn");

  var items = [];
  var activePlanUuid = "";

  function setMsg(text, type) {
    if (!loginMsg) return;
    loginMsg.textContent = String(text || "");
    loginMsg.className = "mt-3 text-sm";
    if (!text) return;
    if (type === "error") loginMsg.classList.add("text-red-700");
    if (type === "ok") loginMsg.classList.add("text-emerald-700");
  }

  function fmtDate(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }

  function fmtMoney(minor, currency) {
    var amount = Number(minor || 0) / 100;
    var code = String(currency || "NGN").toUpperCase();
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(amount);
    } catch (_error) {
      return code + " " + amount.toFixed(2);
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function fetchQueue() {
    var res = await fetch("/.netlify/functions/admin-business-plans-list?status=awaiting_verification", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (res.status === 401 || res.status === 403) {
      if (loginCard) loginCard.hidden = false;
      if (app) app.hidden = true;
      return;
    }
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not load queue");
    items = Array.isArray(json.items) ? json.items : [];
    if (meta) meta.textContent = "Showing " + items.length + " plan(s) awaiting verification.";
    if (rows) {
      rows.innerHTML = items.map(function (item, idx) {
        return [
          '<article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">',
          '<p class="text-sm font-bold text-gray-900">' + escapeHtml(item.businessName || "-") + "</p>",
          '<p class="mt-1 text-xs text-gray-500">' + escapeHtml(item.fullName || "-") + " • " + escapeHtml(item.email || "-") + "</p>",
          '<p class="mt-1 text-xs text-gray-500">Amount: ' + escapeHtml(fmtMoney(item.amountMinor, item.paymentCurrency)) + " • Generated: " + escapeHtml(fmtDate(item.generatedAt)) + "</p>",
          '<button type="button" data-v-open="' + idx + '" class="mt-3 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50">Open Plan</button>',
          "</article>",
        ].join("");
      }).join("");
    }
  }

  function openModal(item) {
    if (!modal || !item) return;
    activePlanUuid = String(item.planUuid || "");
    if (planTextEl) planTextEl.textContent = String(item.planText || "");
    if (notesEl) notesEl.value = "";
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    activePlanUuid = "";
  }

  async function markVerified() {
    if (!activePlanUuid) return;
    markBtn.disabled = true;
    markBtn.textContent = "Saving...";
    try {
      var res = await fetch("/.netlify/functions/admin-business-plans-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planUuid: activePlanUuid, verifierNotes: notesEl ? notesEl.value : "" }),
      });
      var json = await res.json().catch(function () { return null; });
      if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not verify plan");
      closeModal();
      await fetchQueue();
    } finally {
      markBtn.disabled = false;
      markBtn.textContent = "Mark Verified";
    }
  }

  async function checkSession() {
    var res = await fetch("/.netlify/functions/verifier-session", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    return res.ok;
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      setMsg("", "");
      var email = String((loginForm.email && loginForm.email.value) || "").trim();
      var password = String((loginForm.password && loginForm.password.value) || "");
      if (!email || !password) {
        setMsg("Email and password are required.", "error");
        return;
      }
      loginBtn.disabled = true;
      loginBtn.textContent = "Signing in...";
      try {
        var res = await fetch("/.netlify/functions/verifier-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: email, password: password }),
        });
        var json = await res.json().catch(function () { return null; });
        if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not sign in");
        if (loginCard) loginCard.hidden = true;
        if (app) app.hidden = false;
        await fetchQueue();
      } catch (error) {
        setMsg(error.message || "Could not sign in", "error");
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Sign In";
      }
    });
  }

  if (rows) {
    rows.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-v-open]");
      if (!btn) return;
      var idx = Number(btn.getAttribute("data-v-open"));
      if (!Number.isFinite(idx) || !items[idx]) return;
      openModal(items[idx]);
    });
  }
  if (markBtn) markBtn.addEventListener("click", function () { markVerified().catch(function () { return null; }); });
  Array.prototype.slice.call(document.querySelectorAll("[data-v-close]")).forEach(function (el) {
    el.addEventListener("click", function () { closeModal(); });
  });
  if (signOutBtn) {
    signOutBtn.addEventListener("click", async function () {
      await fetch("/.netlify/functions/admin-logout", { method: "POST", credentials: "include" }).catch(function () { return null; });
      if (loginCard) loginCard.hidden = false;
      if (app) app.hidden = true;
    });
  }

  checkSession()
    .then(function (ok) {
      if (!ok) return;
      if (loginCard) loginCard.hidden = true;
      if (app) app.hidden = false;
      return fetchQueue();
    })
    .catch(function () { return null; });
})();
