(function () {
  var rowsEl = document.getElementById("schoolsRows");
  var messageEl = document.getElementById("schoolsMessage");
  var refreshBtn = document.getElementById("schoolsRefreshBtn");

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

  function moneyNgn(minor) {
    var amount = Math.max(0, Number(minor || 0)) / 100;
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);
  }

  function setMessage(text, bad) {
    if (!messageEl) return;
    messageEl.textContent = clean(text);
    messageEl.className = "text-sm " + (bad ? "text-red-600" : "text-gray-600");
  }

  async function api(url, init) {
    var response = await fetch(url, Object.assign({
      credentials: "include",
      headers: { Accept: "application/json" },
    }, init || {}));
    var data = await response.json().catch(function () {
      return null;
    });
    if (response.status === 401) {
      window.location.href = "/internal/?next=" + encodeURIComponent(window.location.pathname);
      throw new Error("Unauthorized");
    }
    if (!response.ok || !data || data.ok !== true) {
      throw new Error((data && data.error) || "Request failed");
    }
    return data;
  }

  function renderRows(items) {
    if (!rowsEl) return;
    if (!items.length) {
      rowsEl.innerHTML = '<tr><td colspan="7" class="px-4 py-6 text-sm text-gray-500">No schools found yet.</td></tr>';
      return;
    }
    rowsEl.innerHTML = items.map(function (row) {
      var status = clean(row.status || "active").toLowerCase();
      return [
        "<tr>",
        '<td class="px-4 py-3">',
        '<p class="font-semibold text-gray-900">' + escapeHtml(row.school_name || "School") + "</p>",
        '<p class="text-xs text-gray-500">' + escapeHtml(row.course_slug || "") + "</p>",
        "</td>",
        '<td class="px-4 py-3">',
        '<p class="text-sm text-gray-800">' + escapeHtml(row.admin_name || "-") + "</p>",
        '<p class="text-xs text-gray-500">' + escapeHtml(row.admin_email || "-") + "</p>",
        "</td>",
        '<td class="px-4 py-3 text-gray-700">' + String(row.seats_used || 0) + " / " + String(row.seats_purchased || 0) + "</td>",
        '<td class="px-4 py-3 text-gray-700">',
        '<p>' + escapeHtml(moneyNgn(row.price_per_student_minor || 0)) + ' per student</p>',
        '<p class="text-xs text-gray-500">VAT: ' + String((Number(row.vat_bps || 0) / 100).toFixed(2)).replace(/\.00$/, "") + '%</p>',
        "</td>",
        '<td class="px-4 py-3">',
        '<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ' +
          (status === "active" ? "bg-emerald-100 text-emerald-700" : status === "disabled" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700") +
          '">' + escapeHtml(status) + "</span>",
        "</td>",
        '<td class="px-4 py-3 text-gray-700">' + escapeHtml(fmtDate(row.access_expires_at)) + "</td>",
        '<td class="px-4 py-3 text-right">',
        '<button type="button" data-edit-school="' + String(row.id) + '" data-school=\'' + escapeHtml(JSON.stringify(row)) + '\' class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Edit</button>',
        "</td>",
        "</tr>",
      ].join("");
    }).join("");

    Array.prototype.slice.call(rowsEl.querySelectorAll("[data-edit-school]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var payloadRaw = btn.getAttribute("data-school") || "";
        var school = null;
        try {
          school = JSON.parse(payloadRaw);
        } catch (_error) {
          school = null;
        }
        if (!school) return;
        editSchool(school).catch(function (error) {
          setMessage(error.message || "Could not update school.", true);
        });
      });
    });
  }

  async function editSchool(school) {
    var seats = window.prompt("Seats purchased", String(Number(school.seats_purchased || 0)));
    if (seats === null) return;
    var status = window.prompt("Status (active, disabled, expired)", clean(school.status || "active"));
    if (status === null) return;
    var expiry = window.prompt("Access expiry (ISO date/time or blank)", clean(school.access_expires_at || ""));
    if (expiry === null) return;

    await api("/.netlify/functions/admin-school-update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        schoolId: Number(school.id || 0),
        seatsPurchased: Number(seats || 0),
        status: clean(status || ""),
        accessExpiresAt: clean(expiry || ""),
      }),
    });
    setMessage("School updated.", false);
    await load();
  }

  async function load() {
    setMessage("Loading schools...", false);
    var data = await api("/.netlify/functions/admin-schools-list");
    var schools = Array.isArray(data.schools) ? data.schools : [];
    renderRows(schools);
    setMessage("Loaded " + String(schools.length) + " school account(s).", false);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      load().catch(function (error) {
        setMessage(error.message || "Could not load schools.", true);
      });
    });
  }

  load().catch(function (error) {
    setMessage(error.message || "Could not load schools.", true);
  });
})();

