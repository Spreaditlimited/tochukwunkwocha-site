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

  var modalEl = document.getElementById("domainDetailsModal");
  var modalTitleEl = document.getElementById("domainDetailsTitle");
  var modalSubtitleEl = document.getElementById("domainDetailsSubtitle");
  var modalMessageEl = document.getElementById("domainDetailsMessage");
  var modalMetaEl = document.getElementById("domainDetailsMeta");
  var modalNetlifyEl = document.getElementById("domainNetlifyMeta");
  var modalOrderHistoryEl = document.getElementById("domainOrderHistory");
  var modalNameserversEl = document.getElementById("domainNameservers");
  var modalDnsHintEl = document.getElementById("domainDnsHint");
  var modalDnsRowsEl = document.getElementById("domainDnsRows");
  var modalDnsSaveBtn = document.getElementById("domainDnsSaveBtn");
  var modalDnsAddRowBtn = document.getElementById("domainDnsAddRowBtn");

  var debounceTimer = null;
  var detailsState = {
    accountId: 0,
    domainName: "",
    canEditDns: false,
  };

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
    if (!appCard) return;
    appCard.hidden = false;
    appCard.style.display = "";
  }

  function bootAppShell() {
    showApp();
    setMessage("Loading...", "ok");
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

  function setModalMessage(text, type) {
    if (!modalMessageEl) return;
    modalMessageEl.textContent = text || "";
    modalMessageEl.classList.remove(
      "hidden",
      "border-red-200",
      "bg-red-50",
      "text-red-700",
      "border-emerald-200",
      "bg-emerald-50",
      "text-emerald-700",
      "border-gray-200",
      "bg-gray-50",
      "text-gray-700"
    );

    if (!text) {
      modalMessageEl.classList.add("hidden");
      return;
    }

    if (type === "error") {
      modalMessageEl.classList.add("border-red-200", "bg-red-50", "text-red-700");
      return;
    }
    if (type === "ok") {
      modalMessageEl.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-700");
      return;
    }
    modalMessageEl.classList.add("border-gray-200", "bg-gray-50", "text-gray-700");
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
      .replace(/\"/g, "&quot;")
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
      domainsRowsEl.innerHTML = '<tr><td colspan="8" class="px-6 py-10 text-center text-sm text-gray-500">No domain records found.</td></tr>';
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
          '<td class="px-3 py-3.5 text-sm text-gray-600"><button type="button" data-domain-details data-account-id="' +
            escapeHtml(row.account_id) +
            '" data-domain-name="' +
            escapeHtml(row.domain_name) +
            '" data-owner-email="' +
            escapeHtml(row.email || "") +
            '" class="inline-flex rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">View details</button></td>',
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

  function parseDateValue(value) {
    if (!value) return 0;
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return 0;
    return d.getTime();
  }

  function renderOrderHistory(payload) {
    if (!modalOrderHistoryEl) return;
    var orders = Array.isArray(payload && payload.orders) ? payload.orders : [];
    var checkouts = Array.isArray(payload && payload.checkouts) ? payload.checkouts : [];
    var renewals = Array.isArray(payload && payload.renewals) ? payload.renewals : [];

    var timeline = [];
    orders.forEach(function (item) {
      timeline.push({
        kind: "order",
        stamp: item.created_at,
        title: "Domain Order",
        status: item.status || "-",
        payment: (item.payment_provider || "-") + " / " + (item.payment_status || "-"),
        amount: fmtMoney(item.purchase_amount_minor, item.purchase_currency || "NGN"),
        ref: item.provider_order_id || item.order_uuid || "-",
      });
    });
    checkouts.forEach(function (item) {
      timeline.push({
        kind: "checkout",
        stamp: item.created_at,
        title: "Checkout Attempt",
        status: item.status || "-",
        payment: item.payment_provider || "-",
        amount: fmtMoney(item.payment_amount_minor, item.payment_currency || "NGN"),
        ref: item.payment_reference || item.checkout_uuid || "-",
      });
    });
    renewals.forEach(function (item) {
      timeline.push({
        kind: "renewal",
        stamp: item.created_at,
        title: "Renewal Checkout",
        status: item.status || "-",
        payment: item.payment_provider || "-",
        amount: fmtMoney(item.payment_amount_minor, item.payment_currency || "NGN"),
        ref: item.payment_reference || item.renewal_uuid || "-",
      });
    });

    timeline.sort(function (a, b) {
      return parseDateValue(b.stamp) - parseDateValue(a.stamp);
    });
    timeline = timeline.slice(0, 12);

    if (!timeline.length) {
      modalOrderHistoryEl.innerHTML = '<div class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">No order history found for this domain.</div>';
      return;
    }

    modalOrderHistoryEl.innerHTML = timeline
      .map(function (item) {
        return [
          '<article class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">',
          '<div class="flex flex-wrap items-center justify-between gap-2">',
          '<p class="text-sm font-semibold text-gray-900">' + escapeHtml(item.title) + "</p>",
          '<p class="text-xs text-gray-500">' + escapeHtml(fmtDate(item.stamp)) + "</p>",
          "</div>",
          '<div class="mt-1 grid gap-1 text-xs text-gray-600 sm:grid-cols-2">',
          "<div>" + detailLine("Status", item.status) + "</div>",
          "<div>" + detailLine("Payment", item.payment) + "</div>",
          "<div>" + detailLine("Amount", item.amount) + "</div>",
          "<div>" + detailLine("Reference", item.ref) + "</div>",
          "</div>",
          "</article>",
        ].join("");
      })
      .join("");
  }

  function openModal() {
    if (!modalEl) return;
    modalEl.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
  }

  function closeModal() {
    if (!modalEl) return;
    modalEl.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
    detailsState = { accountId: 0, domainName: "", canEditDns: false };
    setModalMessage("", "");
  }

  function detailLine(label, value) {
    return '<div><span class="font-semibold text-gray-900">' + escapeHtml(label) + ':</span> ' + escapeHtml(value || "-") + "</div>";
  }

  function renderDnsRows(records, editable) {
    if (!modalDnsRowsEl) return;
    var list = Array.isArray(records) ? records : [];
    if (!list.length) {
      modalDnsRowsEl.innerHTML = '<tr><td colspan="5" class="px-3 py-6 text-center text-sm text-gray-500">No DNS records returned for this domain.</td></tr>';
      return;
    }

    modalDnsRowsEl.innerHTML = list
      .map(function (record, index) {
        var host = String(record && record.host ? record.host : "@");
        var type = String(record && record.type ? record.type : "A").toUpperCase();
        var value = String(record && (record.value || record.address || record.target) ? (record.value || record.address || record.target) : "");
        var ttl = Number(record && record.ttl) || 3600;

        if (!editable) {
          return [
            "<tr>",
            '<td class="px-3 py-2 text-sm text-gray-700">' + escapeHtml(host) + "</td>",
            '<td class="px-3 py-2 text-sm text-gray-700">' + escapeHtml(type) + "</td>",
            '<td class="px-3 py-2 text-sm text-gray-700 break-all">' + escapeHtml(value) + "</td>",
            '<td class="px-3 py-2 text-sm text-gray-700">' + escapeHtml(ttl) + "</td>",
            '<td class="px-3 py-2 text-xs text-gray-400">Locked</td>',
            "</tr>",
          ].join("");
        }

        return [
          '<tr data-dns-row data-index="' + String(index) + '">',
          '<td class="px-3 py-2"><input data-dns-host type="text" value="' + escapeHtml(host) + '" class="block w-full rounded-lg border-0 px-2.5 py-1.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600" /></td>',
          '<td class="px-3 py-2"><input data-dns-type type="text" value="' + escapeHtml(type) + '" class="block w-full rounded-lg border-0 px-2.5 py-1.5 text-sm uppercase text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600" /></td>',
          '<td class="px-3 py-2"><input data-dns-value type="text" value="' + escapeHtml(value) + '" class="block w-full rounded-lg border-0 px-2.5 py-1.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600" /></td>',
          '<td class="px-3 py-2"><input data-dns-ttl type="number" min="60" max="86400" value="' + escapeHtml(ttl) + '" class="block w-full rounded-lg border-0 px-2.5 py-1.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600" /></td>',
          '<td class="px-3 py-2"><button type="button" data-dns-remove class="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100">Remove</button></td>',
          "</tr>",
        ].join("");
      })
      .join("");
  }

  function collectDnsRows() {
    if (!modalDnsRowsEl) return [];
    var rows = Array.from(modalDnsRowsEl.querySelectorAll("tr[data-dns-row]"));
    return rows
      .map(function (row) {
        var hostEl = row.querySelector("[data-dns-host]");
        var typeEl = row.querySelector("[data-dns-type]");
        var valueEl = row.querySelector("[data-dns-value]");
        var ttlEl = row.querySelector("[data-dns-ttl]");
        return {
          host: hostEl ? String(hostEl.value || "").trim() : "",
          type: typeEl ? String(typeEl.value || "").trim().toUpperCase() : "",
          value: valueEl ? String(valueEl.value || "").trim() : "",
          ttl: ttlEl ? Number(ttlEl.value || 3600) : 3600,
        };
      })
      .filter(function (item) {
        return item.host && item.type && item.value;
      });
  }

  async function loadDetails(accountId, domainName, ownerEmail) {
    detailsState = {
      accountId: Number(accountId || 0),
      domainName: String(domainName || "").toLowerCase(),
      canEditDns: false,
    };

    if (modalTitleEl) modalTitleEl.textContent = detailsState.domainName || "Domain details";
    if (modalSubtitleEl) modalSubtitleEl.textContent = ownerEmail ? "Owner: " + ownerEmail : "Loading details...";
    if (modalMetaEl) modalMetaEl.innerHTML = "<div class=\"text-sm text-gray-500\">Loading domain record...</div>";
    if (modalNetlifyEl) modalNetlifyEl.innerHTML = "<div class=\"text-sm text-gray-500\">Loading Netlify details...</div>";
    if (modalOrderHistoryEl) modalOrderHistoryEl.innerHTML = "<div class=\"rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500\">Loading order history...</div>";
    if (modalNameserversEl) modalNameserversEl.textContent = "";
    if (modalDnsHintEl) modalDnsHintEl.textContent = "Loading DNS records...";
    if (modalDnsRowsEl) modalDnsRowsEl.innerHTML = '<tr><td colspan="5" class="px-3 py-6 text-center text-sm text-gray-500">Loading...</td></tr>';
    if (modalDnsAddRowBtn) modalDnsAddRowBtn.classList.add("hidden");
    if (modalDnsSaveBtn) modalDnsSaveBtn.classList.add("hidden");
    setModalMessage("", "");

    var res = await fetch("/.netlify/functions/admin-domain-details", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: detailsState.accountId, domainName: detailsState.domainName }),
    });

    if (res.status === 401) {
      redirectToInternalSignIn();
      return;
    }

    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load domain details.");
    }

    var domain = json.domain || {};
    var netlify = json.netlify || null;
    var dns = json.dns || {};
    var permissions = json.permissions || {};

    detailsState.canEditDns = permissions.canEditDns === true;

    if (modalTitleEl) modalTitleEl.textContent = String(domain.domain_name || detailsState.domainName || "Domain details");
    if (modalSubtitleEl) modalSubtitleEl.textContent = "Owner: " + String(domain.email || ownerEmail || "-");

    if (modalMetaEl) {
      modalMetaEl.innerHTML = [
        detailLine("Status", domain.status || "-"),
        detailLine("Provider", domain.provider || "-"),
        detailLine("Years", domain.years || "-"),
        detailLine("Order Ref", domain.provider_order_id || "-"),
        detailLine("Amount", fmtMoney(domain.purchase_amount_minor, domain.purchase_currency || "NGN")),
        detailLine("Registered", fmtDate(domain.registered_at)),
        detailLine("Renewal Due", fmtDate(domain.renewal_due_at)),
      ].join("");
    }

    if (modalNetlifyEl) {
      if (netlify) {
        modalNetlifyEl.innerHTML = [
          detailLine("Status", netlify.status || "submitted"),
          detailLine("Login email", netlify.netlify_email || "-"),
          detailLine("Project name", netlify.netlify_site_name || "-"),
          detailLine("Temporary Netlify domain", netlify.netlify_workspace || "-"),
          detailLine("Access mode", netlify.connection_method || "temporary login"),
          detailLine("Notes", netlify.access_details || "-"),
          detailLine("Updated", fmtDate(netlify.updated_at)),
        ].join("");
      } else {
        modalNetlifyEl.innerHTML = '<div class="text-sm text-gray-500">No Netlify submission found for this student.</div>';
      }
    }

    renderOrderHistory(json);

    var nameservers = Array.isArray(dns.nameservers) ? dns.nameservers : [];
    if (modalNameserversEl) {
      modalNameserversEl.innerHTML = nameservers.length
        ? '<span class="font-semibold text-gray-700">Nameservers:</span> ' + nameservers.map(escapeHtml).join(", ")
        : '<span class="text-gray-500">Nameservers were not returned.</span>';
    }

    if (!dns.ok) {
      if (modalDnsHintEl) modalDnsHintEl.textContent = dns.error || "DNS records are currently unavailable.";
      renderDnsRows([], false);
      if (modalDnsAddRowBtn) modalDnsAddRowBtn.classList.add("hidden");
      if (modalDnsSaveBtn) modalDnsSaveBtn.classList.add("hidden");
      return;
    }

    if (modalDnsHintEl) {
      if (detailsState.canEditDns) {
        modalDnsHintEl.textContent = "Edit and save DNS records for Prompt to Profit students that submitted Netlify details.";
      } else if (permissions.requiresNetlifySubmission) {
        modalDnsHintEl.textContent = "DNS editing is locked until the student submits Netlify setup details.";
      } else {
        modalDnsHintEl.textContent = "DNS records are visible, but editing is currently locked.";
      }
    }

    renderDnsRows(Array.isArray(dns.records) ? dns.records : [], detailsState.canEditDns);

    if (modalDnsAddRowBtn) modalDnsAddRowBtn.classList.toggle("hidden", detailsState.canEditDns !== true);
    if (modalDnsSaveBtn) modalDnsSaveBtn.classList.toggle("hidden", detailsState.canEditDns !== true);
  }

  async function saveDnsRecords() {
    if (detailsState.canEditDns !== true) return;
    var records = collectDnsRows();
    if (!records.length) {
      setModalMessage("Add at least one valid DNS record before saving.", "error");
      return;
    }

    if (modalDnsSaveBtn) {
      modalDnsSaveBtn.disabled = true;
      modalDnsSaveBtn.textContent = "Saving...";
    }

    try {
      var res = await fetch("/.netlify/functions/admin-domain-dns-update", {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: detailsState.accountId,
          domainName: detailsState.domainName,
          records: records,
        }),
      });

      if (res.status === 401) {
        redirectToInternalSignIn();
        return;
      }

      var json = await res.json().catch(function () { return null; });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not save DNS records.");
      }

      var saved = Array.isArray(json.records) ? json.records : records;
      var verification = json.verification || null;
      renderDnsRows(saved, true);
      if (verification && verification.checked) {
        if (verification.ok) {
          setModalMessage(
            "DNS records updated successfully. Verified via registrar readback (" +
              String(Number(verification.fetchedCount || 0)) +
              " records fetched).",
            "ok"
          );
        } else {
          setModalMessage(
            "DNS records were submitted, but registrar verification readback failed: " +
              String(verification.error || "Unknown verification error."),
            "error"
          );
        }
      } else {
        setModalMessage("DNS records updated successfully.", "ok");
      }
      setMessage("DNS records updated for " + detailsState.domainName + ".", "ok");
    } catch (error) {
      setModalMessage(error.message || "Could not save DNS records.", "error");
    } finally {
      if (modalDnsSaveBtn) {
        modalDnsSaveBtn.disabled = false;
        modalDnsSaveBtn.textContent = "Save DNS Changes";
      }
    }
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
      var netlifyBtn = event.target.closest("[data-netlify-update]");
      if (netlifyBtn) {
        var status = String(netlifyBtn.getAttribute("data-status") || "").trim();
        var accountId = Number(netlifyBtn.getAttribute("data-account-id") || 0);
        var domainName = String(netlifyBtn.getAttribute("data-domain-name") || "").trim().toLowerCase();
        if (!status || !Number.isFinite(accountId) || accountId <= 0 || !domainName) return;

        netlifyBtn.disabled = true;
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
            netlifyBtn.disabled = false;
          });
        return;
      }

      var detailsBtn = event.target.closest("[data-domain-details]");
      if (!detailsBtn) return;

      var detailsAccountId = Number(detailsBtn.getAttribute("data-account-id") || 0);
      var detailsDomainName = String(detailsBtn.getAttribute("data-domain-name") || "").trim().toLowerCase();
      var detailsOwnerEmail = String(detailsBtn.getAttribute("data-owner-email") || "").trim();
      if (!Number.isFinite(detailsAccountId) || detailsAccountId <= 0 || !detailsDomainName) return;

      openModal();
      loadDetails(detailsAccountId, detailsDomainName, detailsOwnerEmail).catch(function (error) {
        setModalMessage(error.message || "Could not load domain details.", "error");
      });
    });
  }

  if (modalEl) {
    modalEl.addEventListener("click", function (event) {
      if (event.target.closest("[data-domain-modal-close]")) {
        closeModal();
        return;
      }
      var removeBtn = event.target.closest("[data-dns-remove]");
      if (removeBtn) {
        var row = removeBtn.closest("tr[data-dns-row]");
        if (row) row.remove();
      }
    });
  }

  if (modalDnsAddRowBtn) {
    modalDnsAddRowBtn.addEventListener("click", function () {
      if (detailsState.canEditDns !== true || !modalDnsRowsEl) return;
      var tr = document.createElement("tr");
      tr.setAttribute("data-dns-row", "");
      tr.innerHTML = [
        '<td class="px-3 py-2"><input data-dns-host type="text" value="@" class="block w-full rounded-lg border-0 px-2.5 py-1.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600" /></td>',
        '<td class="px-3 py-2"><input data-dns-type type="text" value="A" class="block w-full rounded-lg border-0 px-2.5 py-1.5 text-sm uppercase text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600" /></td>',
        '<td class="px-3 py-2"><input data-dns-value type="text" value="" class="block w-full rounded-lg border-0 px-2.5 py-1.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600" /></td>',
        '<td class="px-3 py-2"><input data-dns-ttl type="number" min="60" max="86400" value="3600" class="block w-full rounded-lg border-0 px-2.5 py-1.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-brand-600" /></td>',
        '<td class="px-3 py-2"><button type="button" data-dns-remove class="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100">Remove</button></td>',
      ].join("");
      modalDnsRowsEl.appendChild(tr);
      setModalMessage("", "");
    });
  }

  if (modalDnsSaveBtn) {
    modalDnsSaveBtn.addEventListener("click", function () {
      saveDnsRecords();
    });
  }

  document.querySelectorAll("[data-domain-modal-close]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      closeModal();
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && modalEl && !modalEl.classList.contains("hidden")) {
      closeModal();
    }
  });

  bootAppShell();
  loadData().catch(function (error) {
    var text = String(error && error.message ? error.message : "");
    if (/not signed in|unauthorized|session/i.test(text)) {
      redirectToInternalSignIn();
      return;
    }
    showApp();
    setMessage(text || "Could not load domain management", "error");
  });
})();
