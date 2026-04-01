(function () {
  var appCard = document.getElementById("adminAppCard");
  var logoutBtn = document.getElementById("adminLogoutBtn");
  var refreshBtn = document.getElementById("adminRefreshBtn");
  var statusFilter = document.getElementById("adminStatusFilter");
  var searchInput = document.getElementById("adminSearchInput");
  var messageEl = document.getElementById("adminMessage");
  var providerNameEl = document.getElementById("providerName");
  var domainsRowsEl = document.getElementById("adminDomainsRows");
  var ordersRowsEl = document.getElementById("adminOrdersRows");

  var summaryTotalEl = document.getElementById("summaryTotal");
  var summaryRegisteredEl = document.getElementById("summaryRegistered");
  var summaryFailedEl = document.getElementById("summaryFailed");
  var summaryRenewalsEl = document.getElementById("summaryRenewals");

  var debounceTimer = null;

  function redirectToInternalSignIn() {
    var next = window.location.pathname + (window.location.search || "");
    window.location.href = "/internal/?next=" + encodeURIComponent(next);
  }

  function selectedStatus() {
    if (!statusFilter) return "all";
    var active = statusFilter.querySelector(".status-filter__btn.is-active");
    return active && active.getAttribute("data-status") ? String(active.getAttribute("data-status")) : "all";
  }

  function showApp() {
    if (appCard) appCard.hidden = false;
  }

  function setMessage(text, type) {
    if (!messageEl) return;
    messageEl.textContent = text || "";
    messageEl.classList.remove("hidden", "text-red-600", "text-green-600", "text-gray-500");
    if (!text) {
      messageEl.classList.add("hidden");
      return;
    }
    if (type === "error") {
      messageEl.classList.add("text-red-600");
      return;
    }
    if (type === "ok") {
      messageEl.classList.add("text-green-600");
      return;
    }
    messageEl.classList.add("text-gray-500");
  }

  function fmtDate(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
  }

  function fmtMoney(minor, currency) {
    var amount = Number(minor || 0) / 100;
    if (!Number.isFinite(amount)) return "-";
    var code = String(currency || "USD").toUpperCase();
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

  function statusBadge(status) {
    var s = String(status || "").toLowerCase();
    if (s === "registered" || s === "paid") {
      return '<span class="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">' + escapeHtml(s || "registered") + "</span>";
    }
    if (s.indexOf("fail") !== -1) {
      return '<span class="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">' + escapeHtml(s || "failed") + "</span>";
    }
    if (s.indexOf("pending") !== -1 || s.indexOf("progress") !== -1) {
      return '<span class="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">' + escapeHtml(s || "pending") + "</span>";
    }
    return '<span class="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">' + escapeHtml(s || "-") + "</span>";
  }

  function netlifyStatusBadge(status) {
    var s = String(status || "").toLowerCase();
    if (s === "completed") {
      return '<span class="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">completed</span>';
    }
    if (s === "connected") {
      return '<span class="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">connected</span>';
    }
    if (s === "follow_up") {
      return '<span class="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">follow up</span>';
    }
    if (s === "submitted") {
      return '<span class="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700 ring-1 ring-gray-200">submitted</span>';
    }
    return '<span class="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 ring-1 ring-gray-200">not submitted</span>';
  }

  function renderDomains(rows) {
    if (!domainsRowsEl) return;
    if (!rows || !rows.length) {
      domainsRowsEl.innerHTML = '<tr><td colspan="7" class="px-6 py-10 text-center text-sm text-gray-500">No domain records found.</td></tr>';
      return;
    }
    domainsRowsEl.innerHTML = rows
      .map(function (row) {
        var netlifyLines = [];
        if (row.netlify_connection_method || row.netlify_email || row.netlify_site_name || row.netlify_workspace) {
          if (row.netlify_email) netlifyLines.push("Login email: " + String(row.netlify_email));
          if (row.netlify_site_name) netlifyLines.push("Project name: " + String(row.netlify_site_name));
          if (row.netlify_workspace) netlifyLines.push("Temporary Netlify domain: " + String(row.netlify_workspace));
          if (row.netlify_connection_method) netlifyLines.push("Access mode: temporary login");
        }
        var details = row.netlify_access_details ? String(row.netlify_access_details) : "";
        var detailsHtml = details
          ? '<details class="mt-1"><summary class="cursor-pointer text-[11px] text-brand-600 font-semibold">View details</summary><p class="mt-1 whitespace-pre-wrap break-words text-[11px] text-gray-600">' +
            escapeHtml(details) +
            "</p></details>"
          : "";
        var hasNetlifySubmission = Boolean(row.netlify_email || row.netlify_connection_method || row.netlify_access_details);
        var actionHtml = hasNetlifySubmission
          ? [
              '<div class="mt-2 flex flex-wrap gap-1">',
              '<button type="button" data-netlify-update data-status="connected" data-account-id="' + escapeHtml(row.account_id) + '" data-domain-name="' + escapeHtml(row.domain_name) + '" class="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100">Mark connected</button>',
              '<button type="button" data-netlify-update data-status="follow_up" data-account-id="' + escapeHtml(row.account_id) + '" data-domain-name="' + escapeHtml(row.domain_name) + '" class="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100">Needs follow-up</button>',
              '<button type="button" data-netlify-update data-status="completed" data-account-id="' + escapeHtml(row.account_id) + '" data-domain-name="' + escapeHtml(row.domain_name) + '" class="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">Mark completed</button>',
              "</div>",
            ].join("")
          : "";
        return [
          "<tr>",
          '<td class="py-3.5 pl-4 pr-3 text-sm font-semibold text-gray-900">' + escapeHtml(row.domain_name) + "</td>",
          '<td class="px-3 py-3.5 text-sm text-gray-600">' + escapeHtml(row.email || "-") + "</td>",
          '<td class="px-3 py-3.5 text-sm text-gray-600">' + statusBadge(row.status) + "</td>",
          '<td class="px-3 py-3.5 text-sm text-gray-600">' + escapeHtml((row.latest_payment_provider || "-") + " / " + (row.latest_payment_status || "-")) + "</td>",
          '<td class="px-3 py-3.5 text-sm text-gray-600">' + escapeHtml(fmtDate(row.renewal_due_at)) + "</td>",
          '<td class="px-3 py-3.5 text-sm text-gray-600">' + escapeHtml(row.provider_order_id || "-") + "</td>",
          '<td class="px-3 py-3.5 text-xs text-gray-600">' +
            (netlifyLines.length
              ? netlifyLines.map(function (line) { return "<div>" + escapeHtml(line) + "</div>"; }).join("") +
                '<div class="mt-1">' + netlifyStatusBadge(row.netlify_status) + "</div>" +
                '<div class="mt-1 text-[11px] text-gray-500">Updated: ' + escapeHtml(fmtDate(row.netlify_updated_at)) + "</div>" +
                actionHtml +
                detailsHtml
              : '<span class="text-gray-400">Not submitted</span>') +
            "</td>",
          "</tr>",
        ].join("");
      })
      .join("");
  }

  function renderOrders(rows) {
    if (!ordersRowsEl) return;
    if (!rows || !rows.length) {
      ordersRowsEl.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-sm text-gray-500">No domain order records found.</td></tr>';
      return;
    }
    ordersRowsEl.innerHTML = rows
      .map(function (row) {
        return [
          "<tr>",
          '<td class="py-3.5 pl-4 pr-3 text-sm text-gray-600">' + escapeHtml(fmtDate(row.created_at)) + "</td>",
          '<td class="px-3 py-3.5 text-sm font-semibold text-gray-900">' + escapeHtml(row.domain_name || "-") + "</td>",
          '<td class="px-3 py-3.5 text-sm text-gray-600">' + escapeHtml(row.email || "-") + "</td>",
          '<td class="px-3 py-3.5 text-sm text-gray-600">' + statusBadge(row.status) + "</td>",
          '<td class="px-3 py-3.5 text-sm text-gray-600">' + escapeHtml((row.payment_provider || "-") + " / " + (row.payment_status || "-")) + '<div class="text-xs text-gray-500 mt-1">' + escapeHtml(fmtMoney(row.purchase_amount_minor, row.purchase_currency)) + "</div></td>",
          '<td class="px-3 py-3.5 text-sm text-gray-600">' + escapeHtml(row.provider_order_id || row.order_uuid || "-") + "</td>",
          "</tr>",
        ].join("");
      })
      .join("");
  }

  function renderSummary(summary) {
    var s = summary || {};
    if (summaryTotalEl) summaryTotalEl.textContent = String(Number(s.totalDomains || 0));
    if (summaryRegisteredEl) summaryRegisteredEl.textContent = String(Number(s.registeredDomains || 0));
    if (summaryFailedEl) summaryFailedEl.textContent = String(Number(s.failedDomains || 0));
    if (summaryRenewalsEl) summaryRenewalsEl.textContent = String(Number(s.renewalsDue30Days || 0));
  }

  async function loadData() {
    var qs = new URLSearchParams({
      status: selectedStatus(),
      search: searchInput ? String(searchInput.value || "").trim() : "",
      limit: "200",
    });

    var res = await fetch("/.netlify/functions/admin-domains-list?" + qs.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });

    if (res.status === 401) {
      redirectToInternalSignIn();
      return;
    }

    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load domain management data");
    }

    if (providerNameEl) providerNameEl.textContent = String(json.provider || "--").toUpperCase();
    renderSummary(json.summary || {});
    renderDomains(Array.isArray(json.domains) ? json.domains : []);
    renderOrders(Array.isArray(json.orders) ? json.orders : []);
    showApp();
    setMessage("", "");
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      await fetch("/.netlify/functions/admin-logout", { method: "POST", credentials: "include" }).catch(function () { return null; });
      window.location.href = "/internal/";
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      loadData().catch(function (error) {
        setMessage(error.message || "Could not refresh", "error");
      });
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener("click", function (event) {
      var btn = event.target.closest(".status-filter__btn");
      if (!btn) return;
      statusFilter.querySelectorAll(".status-filter__btn").forEach(function (node) {
        node.classList.toggle("is-active", node === btn);
      });
      loadData().catch(function (error) {
        setMessage(error.message || "Could not filter", "error");
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        loadData().catch(function (error) {
          setMessage(error.message || "Could not search", "error");
        });
      }, 280);
    });
  }

  if (domainsRowsEl) {
    domainsRowsEl.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-netlify-update]");
      if (!btn) return;
      var status = String(btn.getAttribute("data-status") || "").trim();
      var accountId = Number(btn.getAttribute("data-account-id") || 0);
      var domainName = String(btn.getAttribute("data-domain-name") || "").trim().toLowerCase();
      if (!status || !Number.isFinite(accountId) || accountId <= 0 || !domainName) return;

      btn.disabled = true;
      fetch("/.netlify/functions/admin-domain-netlify-status-update", {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: accountId,
          domainName: domainName,
          status: status,
        }),
      })
        .then(function (res) {
          return res.json().catch(function () { return null; }).then(function (json) {
            if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not update Netlify status.");
            return json;
          });
        })
        .then(function () {
          setMessage("Netlify setup status updated.", "ok");
          return loadData();
        })
        .catch(function (error) {
          setMessage(error.message || "Could not update Netlify status.", "error");
        })
        .finally(function () {
          btn.disabled = false;
        });
    });
  }

  setMessage("Loading...", "ok");
  loadData().catch(function (error) {
    setMessage(error.message || "Could not load domain management", "error");
  });
})();
