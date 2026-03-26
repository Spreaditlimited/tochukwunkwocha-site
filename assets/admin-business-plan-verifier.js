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

  function monthKey(dateLike) {
    var d = new Date(dateLike || "");
    if (Number.isNaN(d.getTime())) return "Unknown";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function monthLabel(key) {
    if (key === "Unknown") return "Unknown Month";
    var parts = String(key).split("-");
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var d = new Date(y, Math.max(0, m - 1), 1);
    if (Number.isNaN(d.getTime())) return key;
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  }

  function statusBadge(status) {
    var s = String(status || "awaiting_verification").toLowerCase();
    if (s === "verified") {
      return '<span class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">Verified</span>';
    }
    return '<span class="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">Awaiting Verification</span>';
  }

  function renderRows() {
    if (!rows) return;
    if (!items.length) {
      rows.innerHTML = '<article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p class="text-sm text-gray-600">No generated plans yet.</p></article>';
      return;
    }

    var grouped = {};
    items.forEach(function (item) {
      var key = monthKey(item.generatedAt);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    var keys = Object.keys(grouped).sort(function (a, b) {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return a > b ? -1 : 1;
    });

    var html = [];
    keys.forEach(function (key) {
      html.push('<section class="space-y-3">');
      html.push('<h3 class="text-sm font-bold uppercase tracking-wide text-gray-500">' + escapeHtml(monthLabel(key)) + "</h3>");
      grouped[key].forEach(function (item, idxInGroup) {
        var originalIdx = items.indexOf(item);
        var isAwaiting = String(item.verificationStatus || "").toLowerCase() !== "verified";
        html.push([
          '<article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">',
          '<div class="flex items-start justify-between gap-3">',
          '<div>',
          '<p class="text-sm font-bold text-gray-900">' + escapeHtml(item.businessName || "-") + "</p>",
          '<p class="mt-1 text-xs text-gray-500">' + escapeHtml(item.fullName || "-") + " • " + escapeHtml(item.email || "-") + "</p>",
          '<p class="mt-1 text-xs text-gray-500">Amount: ' + escapeHtml(fmtMoney(item.amountMinor, item.paymentCurrency)) + " • Generated: " + escapeHtml(fmtDate(item.generatedAt)) + "</p>",
          "</div>",
          statusBadge(item.verificationStatus),
          "</div>",
          '<div class="mt-3 flex items-center gap-2">',
          '<button type="button" data-v-open="' + originalIdx + '" class="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50">Open Plan</button>',
          '<button type="button" data-v-mark="' + originalIdx + '" class="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50" ' + (isAwaiting ? "" : "disabled") + ">Mark Verified</button>",
          "</div>",
          "</article>",
        ].join(""));
      });
      html.push("</section>");
    });

    rows.innerHTML = html.join("");
  }

  async function fetchQueue() {
    var res = await fetch("/.netlify/functions/admin-business-plans-list?status=all", {
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
    var awaiting = items.filter(function (item) {
      return String(item.verificationStatus || "").toLowerCase() !== "verified";
    }).length;
    var verified = items.length - awaiting;
    if (meta) meta.textContent = "Showing " + items.length + " plan(s): " + awaiting + " awaiting, " + verified + " verified.";
    renderRows();
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
      if (btn) {
        var idx = Number(btn.getAttribute("data-v-open"));
        if (!Number.isFinite(idx) || !items[idx]) return;
        openModal(items[idx]);
        return;
      }
      var verifyBtn = event.target.closest("[data-v-mark]");
      if (!verifyBtn) return;
      var verifyIdx = Number(verifyBtn.getAttribute("data-v-mark"));
      if (!Number.isFinite(verifyIdx) || !items[verifyIdx]) return;
      var plan = items[verifyIdx];
      if (String(plan.verificationStatus || "").toLowerCase() === "verified") return;
      activePlanUuid = String(plan.planUuid || "");
      if (!activePlanUuid) return;
      markVerified().catch(function () { return null; });
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
