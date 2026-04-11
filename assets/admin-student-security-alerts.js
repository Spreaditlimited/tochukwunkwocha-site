(function () {
  var countEl = document.getElementById("studentSecurityAlertCount");
  var rowsEl = document.getElementById("studentSecurityAlertRows");
  if (!countEl || !rowsEl) return;

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
    countEl.textContent = String(items.length);
    if (!items.length) {
      rowsEl.innerHTML = '<p class="text-sm text-gray-500">No open student security alerts.</p>';
      return;
    }
    rowsEl.innerHTML = items.map(function (item) {
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
        "</article>",
      ].join("");
    }).join("");
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

  load().catch(function (error) {
    countEl.textContent = "!";
    rowsEl.innerHTML = '<p class="text-sm text-red-600">' + escapeHtml(error.message || "Could not load security alerts.") + "</p>";
  });
})();
