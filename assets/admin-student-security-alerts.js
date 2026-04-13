(function () {
  var countEl = document.getElementById("studentSecurityAlertCount");
  var rowsEl = document.getElementById("studentSecurityAlertRows");
  if (!countEl || !rowsEl) return;
  var actionConfirmModal = document.getElementById("actionConfirmModal");
  var actionConfirmBackdrop = document.getElementById("actionConfirmBackdrop");
  var actionConfirmCloseBtn = document.getElementById("actionConfirmCloseBtn");
  var actionConfirmCancelBtn = document.getElementById("actionConfirmCancelBtn");
  var actionConfirmConfirmBtn = document.getElementById("actionConfirmConfirmBtn");
  var actionConfirmTitle = document.getElementById("actionConfirmTitle");
  var actionConfirmMessage = document.getElementById("actionConfirmMessage");
  var latestItems = [];
  var resettingByAccountId = {};
  var feedbackTimeout = 0;

  function clean(value) {
    return String(value || "").trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtDate(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "-";
    return d.toLocaleString();
  }

  function severityClass(sev) {
    var s = clean(sev).toLowerCase();
    if (s === "high") return "bg-rose-100 text-rose-700";
    if (s === "medium") return "bg-amber-100 text-amber-700";
    return "bg-slate-100 text-slate-700";
  }

  function render(items) {
    latestItems = Array.isArray(items) ? items.slice() : [];
    countEl.textContent = String(items.length);
    if (!items.length) {
      rowsEl.innerHTML = '<p class="text-sm text-gray-500">No open student security alerts.</p>';
      return;
    }
    rowsEl.innerHTML = items.map(function (item) {
      var accountId = Number(item && item.accountId || 0);
      var canReset = accountId > 0;
      var isResetting = canReset && resettingByAccountId[accountId];
      var subject = clean(item.studentName) || clean(item.studentEmail) || "Student";
      var school = clean(item.schoolName);
      return [
        '<article class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">',
        '<div class="flex flex-wrap items-center justify-between gap-2">',
        '<p class="text-sm font-bold text-gray-900">' + escapeHtml(subject) + "</p>",
        '<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ' + severityClass(item.severity) + '">' + escapeHtml(clean(item.severity) || "medium") + "</span>",
        "</div>",
        '<p class="mt-1 text-xs text-gray-500">' + escapeHtml(clean(item.studentEmail) || "-") + (school ? " • " + escapeHtml(school) : "") + "</p>",
        '<p class="mt-2 text-sm text-gray-800 font-medium">' + escapeHtml(clean(item.title) || "Alert") + "</p>",
        '<p class="mt-1 text-xs text-gray-500">Type: ' + escapeHtml(clean(item.alertType) || "-") + ' • Count: ' + String(Number(item.occurrences || 0)) + "</p>",
        '<p class="mt-1 text-xs text-gray-500">Last seen: ' + escapeHtml(fmtDate(item.lastSeenAt)) + "</p>",
        '<div class="mt-3">',
        canReset
          ? '<button type="button" data-action="reset-student-devices" data-account-id="' + String(accountId) + '" data-student-name="' + escapeHtml(subject) + '" class="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60" ' + (isResetting ? "disabled" : "") + ">" + (isResetting ? "Resetting..." : "Reset devices") + "</button>"
          : "",
        "</div>",
        "</article>",
      ].join("");
    }).join("");
  }

  function updateResetting(accountId, value) {
    if (!accountId) return;
    if (value) resettingByAccountId[accountId] = true;
    else delete resettingByAccountId[accountId];
    render(latestItems);
  }

  function ensureFeedbackEl() {
    var existing = document.getElementById("studentSecurityAlertFeedback");
    if (existing) return existing;
    var node = document.createElement("p");
    node.id = "studentSecurityAlertFeedback";
    node.className = "mb-3 hidden rounded-lg border px-3 py-2 text-sm";
    rowsEl.parentNode.insertBefore(node, rowsEl);
    return node;
  }

  function setFeedback(message, tone) {
    var el = ensureFeedbackEl();
    if (!message) {
      el.textContent = "";
      el.className = "mb-3 hidden rounded-lg border px-3 py-2 text-sm";
      return;
    }
    var isError = tone === "error";
    el.textContent = clean(message).slice(0, 220);
    el.className =
      "mb-3 rounded-lg border px-3 py-2 text-sm " +
      (isError
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700");
    if (feedbackTimeout) window.clearTimeout(feedbackTimeout);
    feedbackTimeout = window.setTimeout(function () {
      setFeedback("", "ok");
    }, 3200);
  }

  function closeActionConfirm(result) {
    if (!actionConfirmModal) return;
    actionConfirmModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (typeof actionConfirmModal._resolve === "function") {
      var resolve = actionConfirmModal._resolve;
      actionConfirmModal._resolve = null;
      resolve(!!result);
    }
  }

  function requestActionConfirm(input) {
    if (!actionConfirmModal) {
      return Promise.resolve(window.confirm(String(input && input.message || "Please confirm this action.")));
    }
    var title = clean(input && input.title) || "Confirm action";
    var message = clean(input && input.message) || "Please confirm this action.";
    var confirmLabel = clean(input && input.confirmLabel) || "Confirm";
    var cancelLabel = clean(input && input.cancelLabel) || "Cancel";
    if (actionConfirmTitle) actionConfirmTitle.textContent = title;
    if (actionConfirmMessage) actionConfirmMessage.textContent = message;
    if (actionConfirmConfirmBtn) actionConfirmConfirmBtn.textContent = confirmLabel;
    if (actionConfirmCancelBtn) actionConfirmCancelBtn.textContent = cancelLabel;
    actionConfirmModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    return new Promise(function (resolve) {
      actionConfirmModal._resolve = resolve;
      if (actionConfirmConfirmBtn) actionConfirmConfirmBtn.focus();
    });
  }

  async function load() {
    var res = await fetch("/.netlify/functions/admin-student-security-alerts-list", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    var json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load security alerts.");
    }
    render(Array.isArray(json.alerts) ? json.alerts : []);
  }

  async function resetStudentDevices(accountId, studentName) {
    if (!accountId) return;
    if (resettingByAccountId[accountId]) return;
    var label = clean(studentName) || "this student";
    var confirmed = await requestActionConfirm({
      title: "Reset trusted devices?",
      message: "Reset trusted devices for " + label + "? This will sign them out on all devices.",
      confirmLabel: "Reset devices",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
    updateResetting(accountId, true);
    setFeedback("", "ok");
    try {
      var res = await fetch("/.netlify/functions/admin-student-devices-reset", {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountId: accountId }),
      });
      var json = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not reset student devices.");
      }
      await load();
      setFeedback(
        "Devices reset for " +
          label +
          ". Removed " +
          String(Number(json.devicesRemoved || 0)) +
          " trusted device(s).",
        "ok"
      );
    } finally {
      updateResetting(accountId, false);
    }
  }

  rowsEl.addEventListener("click", function (event) {
    var target = event && event.target ? event.target.closest("[data-action='reset-student-devices']") : null;
    if (!target) return;
    var accountId = Number(target.getAttribute("data-account-id") || 0);
    var studentName = target.getAttribute("data-student-name") || "Student";
    resetStudentDevices(accountId, studentName).catch(function (error) {
      var message = clean(error && error.message).slice(0, 180);
      setFeedback(message || "Could not reset student devices.", "error");
    });
  });

  if (actionConfirmBackdrop) {
    actionConfirmBackdrop.addEventListener("click", function () {
      closeActionConfirm(false);
    });
  }
  if (actionConfirmCloseBtn) {
    actionConfirmCloseBtn.addEventListener("click", function () {
      closeActionConfirm(false);
    });
  }
  if (actionConfirmCancelBtn) {
    actionConfirmCancelBtn.addEventListener("click", function () {
      closeActionConfirm(false);
    });
  }
  if (actionConfirmConfirmBtn) {
    actionConfirmConfirmBtn.addEventListener("click", function () {
      closeActionConfirm(true);
    });
  }
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || !actionConfirmModal) return;
    if (actionConfirmModal.getAttribute("aria-hidden") === "false") closeActionConfirm(false);
  });

  load().catch(function (error) {
    countEl.textContent = "!";
    rowsEl.innerHTML = '<p class="text-sm text-red-600">' + escapeHtml(error.message || "Could not load security alerts.") + "</p>";
  });
})();
