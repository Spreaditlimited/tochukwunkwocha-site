(function () {
  const metaEl = document.getElementById("domainsMeta");
  const listEl = document.getElementById("domainsList");
  const ordersEl = document.getElementById("domainOrdersList");
  const dnsTypeOptions = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "NS"];

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function formatDate(value) {
    if (!value) return "-";
    var raw = String(value).trim();
    var normalized = raw;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
      normalized = raw.replace(" ", "T") + "Z";
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      normalized = raw + "T00:00:00Z";
    }
    const date = new Date(normalized);
    if (!Number.isFinite(date.getTime())) return "-";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function parseDateValue(value) {
    if (!value) return null;
    var raw = String(value).trim();
    var normalized = raw;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
      normalized = raw.replace(" ", "T") + "Z";
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      normalized = raw + "T00:00:00Z";
    }
    var out = new Date(normalized);
    if (!Number.isFinite(out.getTime())) return null;
    return out;
  }

  function deriveRenewalDate(item) {
    if (!item) return "-";
    if (item.renewalDueAt) return formatDate(item.renewalDueAt);
    var base = parseDateValue(item.registeredAt || item.createdAt);
    if (!base) return "-";
    var years = Math.max(1, Math.min(Number(item.years || 1) || 1, 10));
    var due = new Date(base.getTime());
    due.setUTCFullYear(due.getUTCFullYear() + years);
    return formatDate(due.toISOString());
  }

  function formatMoney(currency, amountMinor) {
    const amt = Number(amountMinor || 0);
    if (!currency || !Number.isFinite(amt) || amt <= 0) return "-";
    var code = String(currency || "").toUpperCase();
    var amount = amt / 100;
    try {
      return new Intl.NumberFormat("en-NG", { style: "currency", currency: code }).format(amount);
    } catch (_error) {
      return code + " " + amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }

  async function api(path, payload) {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload || {}),
    });
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Request failed");
    }
    return json;
  }

  function statusText(el, message, tone) {
    if (!el) return;
    el.textContent = String(message || "");
    el.classList.remove("text-red-600", "text-emerald-700", "text-gray-600");
    if (tone === "error") el.classList.add("text-red-600");
    else if (tone === "success") el.classList.add("text-emerald-700");
    else el.classList.add("text-gray-600");
  }

  function recordRowHtml(record) {
    const r = record || { host: "", type: "A", value: "", ttl: 3600 };
    const options = dnsTypeOptions
      .map(function (type) {
        return `<option value="${escapeAttr(type)}" ${String(r.type || "").toUpperCase() === type ? "selected" : ""}>${escapeHtml(type)}</option>`;
      })
      .join("");
    return [
      '<div class="rounded-xl border border-gray-200 bg-white p-3 sm:p-4" data-dns-row>',
      '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2">',
      `<input data-dns-field="host" type="text" class="lg:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:ring-brand-400" placeholder="Host" value="${escapeAttr(
        r.host || ""
      )}" />`,
      `<select data-dns-field="type" class="lg:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:ring-brand-400">${options}</select>`,
      `<input data-dns-field="value" type="text" class="lg:col-span-6 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:ring-brand-400" placeholder="Value" value="${escapeAttr(
        r.value || ""
      )}" />`,
      `<input data-dns-field="ttl" type="number" min="60" max="86400" class="lg:col-span-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:ring-brand-400" placeholder="TTL" value="${escapeAttr(
        String(r.ttl || 3600)
      )}" />`,
      '<button type="button" data-dns-remove class="lg:col-span-1 inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">Remove</button>',
      "</div>",
      "</div>",
    ].join("");
  }

  function dnsPanelHtml(domainName) {
    const domain = escapeAttr(domainName);
    return [
      `<div class="mt-4 hidden rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5" data-dns-panel="${domain}" data-loaded="0">`,
      '<div class="mb-4 flex items-center justify-between gap-3">',
      '<h5 data-panel-title class="text-sm font-heading font-bold text-gray-900">DNS Management</h5>',
      '<span data-panel-note class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Propagation may take up to 24h</span>',
      "</div>",
      '<p data-dns-status class="mb-3 text-xs text-gray-600">Open this panel to load DNS details.</p>',
      '<div data-dns-section class="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">',
      '<p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Nameservers</p>',
      '<div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">',
      '<input data-ns-index="0" type="text" class="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:ring-brand-400" placeholder="ns1.example.com" />',
      '<input data-ns-index="1" type="text" class="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:ring-brand-400" placeholder="ns2.example.com" />',
      '<input data-ns-index="2" type="text" class="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:ring-brand-400" placeholder="ns3.example.com (optional)" />',
      '<input data-ns-index="3" type="text" class="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:ring-brand-400" placeholder="ns4.example.com (optional)" />',
      "</div>",
      '<div class="mt-3 flex justify-end">',
      '<button type="button" data-ns-save class="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-500">Save Nameservers</button>',
      "</div>",
      "</div>",
      '<div data-dns-section class="mt-4 rounded-xl border border-gray-200 bg-white p-3 sm:p-4">',
      '<div class="mb-3 flex items-center justify-between gap-2">',
      '<p class="text-xs font-semibold uppercase tracking-wide text-gray-500">DNS Records</p>',
      '<button type="button" data-dns-add class="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100">Add record</button>',
      "</div>",
      '<div data-dns-records class="space-y-2"></div>',
      '<div class="mt-3 flex justify-end">',
      '<button type="button" data-dns-save class="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-500">Save DNS Records</button>',
      "</div>",
      "</div>",
      '<div class="mt-4 rounded-xl border border-gray-200 bg-white p-3 sm:p-4" data-netlify-section>',
      '<p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Netlify Connection Details (Prompt to Profit)</p>',
      '<p class="mt-1 text-xs text-gray-600">Submit the 4 details we need to connect your domain to your Netlify project.</p>',
      '<div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">',
      '<input data-netlify-email type="email" class="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:ring-brand-400" placeholder="Login email" />',
      '<input data-netlify-password type="password" class="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:ring-brand-400" placeholder="Password (temporary)" />',
      '<input data-netlify-site type="text" class="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:ring-brand-400" placeholder="Project name" />',
      '<input data-netlify-temp-domain type="text" class="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-brand-400 focus:ring-brand-400" placeholder="Temporary Netlify domain (e.g. mysite.netlify.app)" />',
      "</div>",
      '<p class="mt-2 text-[11px] text-amber-700">Important: Change this password once your domain connection is complete.</p>',
      '<div class="mt-3 flex justify-end">',
      '<button type="button" data-netlify-save class="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-500">Submit Netlify Details</button>',
      "</div>",
      '<p data-netlify-status class="mt-2 text-xs text-gray-600"></p>',
      "</div>",
      "</div>",
    ].join("");
  }

  function findPanelForDomain(domainName) {
    const safeDomainSelector =
      typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function"
        ? CSS.escape(domainName)
        : String(domainName || "").replace(/"/g, '\\"');
    return listEl ? listEl.querySelector(`[data-dns-panel="${safeDomainSelector}"]`) : null;
  }

  async function ensurePanelLoaded(panel, domainName) {
    if (!panel || panel.dataset.loaded === "1") return;
    await loadDnsPanel(panel, domainName);
    await loadNetlifyPanel(panel, domainName);
  }

  function setPanelMode(panel, mode) {
    if (!panel) return;
    var dnsOnly = String(mode || "").toLowerCase() === "dns";
    var titleEl = panel.querySelector("[data-panel-title]");
    var noteEl = panel.querySelector("[data-panel-note]");
    var dnsStatus = panel.querySelector("[data-dns-status]");
    var dnsSections = Array.from(panel.querySelectorAll("[data-dns-section]"));
    var netlifySection = panel.querySelector("[data-netlify-section]");

    if (titleEl) titleEl.textContent = dnsOnly ? "DNS Management" : "Netlify Connection Details";
    if (noteEl) noteEl.classList.toggle("hidden", !dnsOnly);
    if (dnsStatus) dnsStatus.classList.toggle("hidden", !dnsOnly);
    dnsSections.forEach(function (el) {
      el.classList.toggle("hidden", !dnsOnly);
    });
    if (netlifySection) netlifySection.classList.toggle("hidden", false);
  }

  function collectNameservers(panel) {
    return Array.from(panel.querySelectorAll("[data-ns-index]"))
      .map(function (input) {
        return String(input.value || "").trim().toLowerCase();
      })
      .filter(Boolean);
  }

  function collectRecords(panel) {
    return Array.from(panel.querySelectorAll("[data-dns-row]"))
      .map(function (row) {
        const host = String((row.querySelector('[data-dns-field="host"]') || {}).value || "").trim();
        const type = String((row.querySelector('[data-dns-field="type"]') || {}).value || "").trim().toUpperCase();
        const value = String((row.querySelector('[data-dns-field="value"]') || {}).value || "").trim();
        const ttlRaw = Number((row.querySelector('[data-dns-field="ttl"]') || {}).value || 3600);
        const ttl = Number.isFinite(ttlRaw) ? Math.max(60, Math.min(Math.round(ttlRaw), 86400)) : 3600;
        return { host, type, value, ttl };
      })
      .filter(function (item) {
        return item.host && item.type && item.value;
      });
  }

  function populateDnsPanel(panel, payload) {
    const nameservers = Array.isArray(payload && payload.nameservers) ? payload.nameservers : [];
    const records = Array.isArray(payload && payload.records) ? payload.records : [];
    Array.from(panel.querySelectorAll("[data-ns-index]")).forEach(function (input, idx) {
      input.value = nameservers[idx] || "";
    });
    const recordsEl = panel.querySelector("[data-dns-records]");
    if (recordsEl) {
      recordsEl.innerHTML = (records.length ? records : [{ host: "@", type: "A", value: "", ttl: 3600 }])
        .map(recordRowHtml)
        .join("");
    }
  }

  function populateNetlifyPanel(panel, details) {
    var d = details || {};
    var emailEl = panel.querySelector("[data-netlify-email]");
    var passwordEl = panel.querySelector("[data-netlify-password]");
    var tempDomainEl = panel.querySelector("[data-netlify-temp-domain]");
    var siteEl = panel.querySelector("[data-netlify-site]");
    var statusEl = panel.querySelector("[data-netlify-status]");
    if (emailEl) emailEl.value = String(d.netlifyEmail || "");
    if (passwordEl) passwordEl.value = String(d.accessDetails || "");
    if (tempDomainEl) tempDomainEl.value = String(d.netlifyWorkspace || "");
    if (siteEl) siteEl.value = String(d.netlifySiteName || "");
    if (statusEl) {
      if (d && d.updatedAt) statusText(statusEl, "Last submitted: " + new Date(d.updatedAt).toLocaleString(), "neutral");
      else statusText(statusEl, "No Netlify details submitted yet.", "neutral");
    }
  }

  async function loadDnsPanel(panel, domainName) {
    const statusEl = panel.querySelector("[data-dns-status]");
    statusText(statusEl, "Loading DNS records...", "neutral");
    const json = await api("/.netlify/functions/domain-dns-get", { domainName: domainName });
    populateDnsPanel(panel, json);
    panel.dataset.loaded = "1";
    statusText(statusEl, "DNS loaded. You can now edit and save.", "success");
  }

  async function loadNetlifyPanel(panel, domainName) {
    var statusEl = panel.querySelector("[data-netlify-status]");
    if (statusEl) statusText(statusEl, "Loading Netlify details...", "neutral");
    var json = await api("/.netlify/functions/domain-netlify-get", { domainName: domainName });
    populateNetlifyPanel(panel, json.details || null);
  }

  async function saveNameservers(panel, domainName) {
    const statusEl = panel.querySelector("[data-dns-status]");
    const nameservers = collectNameservers(panel);
    if (nameservers.length < 2) {
      statusText(statusEl, "Enter at least two nameservers.", "error");
      return;
    }
    statusText(statusEl, "Saving nameservers...", "neutral");
    const json = await api("/.netlify/functions/domain-nameservers-update", { domainName: domainName, nameservers: nameservers });
    const savedNs = Array.isArray(json.nameservers) ? json.nameservers : nameservers;
    Array.from(panel.querySelectorAll("[data-ns-index]")).forEach(function (input, idx) {
      input.value = savedNs[idx] || "";
    });
    statusText(statusEl, "Nameservers updated successfully.", "success");
  }

  async function saveDnsRecords(panel, domainName) {
    const statusEl = panel.querySelector("[data-dns-status]");
    const records = collectRecords(panel);
    if (!records.length) {
      statusText(statusEl, "Add at least one complete DNS record.", "error");
      return;
    }
    statusText(statusEl, "Saving DNS records...", "neutral");
    const json = await api("/.netlify/functions/domain-dns-update", { domainName: domainName, records: records });
    populateDnsPanel(panel, { nameservers: collectNameservers(panel), records: json.records || records });
    statusText(statusEl, "DNS records updated successfully.", "success");
  }

  function collectNetlifyPayload(panel, domainName) {
    return {
      domainName: domainName,
      netlifyEmail: String((panel.querySelector("[data-netlify-email]") || {}).value || "").trim(),
      connectionMethod: "temporary_login",
      netlifyWorkspace: String((panel.querySelector("[data-netlify-temp-domain]") || {}).value || "").trim(),
      netlifySiteName: String((panel.querySelector("[data-netlify-site]") || {}).value || "").trim(),
      accessDetails: String((panel.querySelector("[data-netlify-password]") || {}).value || "").trim(),
    };
  }

  async function saveNetlifyDetails(panel, domainName) {
    var statusEl = panel.querySelector("[data-netlify-status]");
    var payload = collectNetlifyPayload(panel, domainName);
    if (!payload.netlifyEmail) {
      statusText(statusEl, "Enter login email.", "error");
      return;
    }
    if (!payload.netlifySiteName) {
      statusText(statusEl, "Enter project name.", "error");
      return;
    }
    if (!payload.netlifyWorkspace) {
      statusText(statusEl, "Enter temporary Netlify domain.", "error");
      return;
    }
    if (!payload.accessDetails) {
      statusText(statusEl, "Enter temporary password.", "error");
      return;
    }
    statusText(statusEl, "Submitting Netlify details...", "neutral");
    var json = await api("/.netlify/functions/domain-netlify-save", payload);
    populateNetlifyPanel(panel, json || payload);
    statusText(statusEl, "Netlify details submitted successfully.", "success");
  }

  function bindDnsEvents() {
    if (!listEl) return;
    listEl.addEventListener("click", async function (event) {
      const toggle = event.target.closest("[data-dns-toggle]");
      if (toggle) {
        const domainName = String(toggle.getAttribute("data-dns-toggle") || "").trim().toLowerCase();
        if (!domainName) return;
        const panel = findPanelForDomain(domainName);
        if (!panel) return;
        setPanelMode(panel, "dns");
        panel.classList.toggle("hidden");
        if (!panel.classList.contains("hidden")) {
          try {
            await ensurePanelLoaded(panel, domainName);
          } catch (error) {
            const statusEl = panel.querySelector("[data-dns-status]");
            statusText(statusEl, error.message || "Could not load DNS data.", "error");
          }
        }
        return;
      }

      const netlifyToggle = event.target.closest("[data-netlify-toggle]");
      if (netlifyToggle) {
        const domainName = String(netlifyToggle.getAttribute("data-netlify-toggle") || "").trim().toLowerCase();
        if (!domainName) return;
        const panel = findPanelForDomain(domainName);
        if (!panel) return;
        try {
          setPanelMode(panel, "netlify");
          if (panel.classList.contains("hidden")) panel.classList.remove("hidden");
          await ensurePanelLoaded(panel, domainName);
          const netlifySection = panel.querySelector("[data-netlify-section]");
          if (netlifySection && typeof netlifySection.scrollIntoView === "function") {
            netlifySection.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        } catch (error) {
          const statusEl = panel.querySelector("[data-netlify-status]") || panel.querySelector("[data-dns-status]");
          statusText(statusEl, error.message || "Could not load Netlify details.", "error");
        }
        return;
      }

      const addBtn = event.target.closest("[data-dns-add]");
      if (addBtn) {
        const panel = addBtn.closest("[data-dns-panel]");
        if (!panel) return;
        const recordsEl = panel.querySelector("[data-dns-records]");
        if (!recordsEl) return;
        recordsEl.insertAdjacentHTML("beforeend", recordRowHtml({ host: "", type: "A", value: "", ttl: 3600 }));
        return;
      }

      const removeBtn = event.target.closest("[data-dns-remove]");
      if (removeBtn) {
        const row = removeBtn.closest("[data-dns-row]");
        if (row) row.remove();
        return;
      }

      const nsSave = event.target.closest("[data-ns-save]");
      if (nsSave) {
        const panel = nsSave.closest("[data-dns-panel]");
        if (!panel) return;
        const domainName = String(panel.getAttribute("data-dns-panel") || "").trim().toLowerCase();
        if (!domainName) return;
        try {
          nsSave.disabled = true;
          await saveNameservers(panel, domainName);
        } catch (error) {
          const statusEl = panel.querySelector("[data-dns-status]");
          statusText(statusEl, error.message || "Could not update nameservers.", "error");
        } finally {
          nsSave.disabled = false;
        }
        return;
      }

      const dnsSave = event.target.closest("[data-dns-save]");
      if (dnsSave) {
        const panel = dnsSave.closest("[data-dns-panel]");
        if (!panel) return;
        const domainName = String(panel.getAttribute("data-dns-panel") || "").trim().toLowerCase();
        if (!domainName) return;
        try {
          dnsSave.disabled = true;
          await saveDnsRecords(panel, domainName);
        } catch (error) {
          const statusEl = panel.querySelector("[data-dns-status]");
          statusText(statusEl, error.message || "Could not update DNS records.", "error");
        } finally {
          dnsSave.disabled = false;
        }
        return;
      }

      const netlifySave = event.target.closest("[data-netlify-save]");
      if (netlifySave) {
        const panel = netlifySave.closest("[data-dns-panel]");
        if (!panel) return;
        const domainName = String(panel.getAttribute("data-dns-panel") || "").trim().toLowerCase();
        if (!domainName) return;
        try {
          netlifySave.disabled = true;
          await saveNetlifyDetails(panel, domainName);
        } catch (error) {
          const statusEl = panel.querySelector("[data-netlify-status]");
          statusText(statusEl, error.message || "Could not submit Netlify details.", "error");
        } finally {
          netlifySave.disabled = false;
        }
      }
    });
  }

  async function load() {
    try {
      const res = await fetch("/.netlify/functions/user-domains", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const json = await res.json().catch(function () {
        return null;
      });
      if (res.status === 401 || res.status === 403) {
        window.location.href = "/dashboard/";
        return;
      }
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not load domain records");
      }

      const domains = Array.isArray(json.domains) ? json.domains : [];
      const orders = Array.isArray(json.orders) ? json.orders : [];
      const email = json.account && json.account.email ? String(json.account.email) : "";

      if (metaEl) {
        metaEl.textContent = `Showing ${domains.length} domain(s)${email ? ` for ${email}` : ""}.`;
      }

      if (!domains.length) {
        if (listEl) {
          listEl.innerHTML = [
            '<article class="rounded-2xl border border-gray-200 bg-gray-50 p-6">',
            '<p class="text-base font-semibold text-gray-900">No domain purchased yet.</p>',
            '<p class="mt-2 text-sm text-gray-600">Register your first domain to see renewal tracking here.</p>',
            '<a class="mt-4 inline-flex items-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-500" href="#domainRegisterSection">Register Domain</a>',
            "</article>",
          ].join("");
        }
      } else if (listEl) {
        listEl.innerHTML = domains
          .map(function (item) {
            return [
              '<article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">',
              `<p class="text-base font-bold text-gray-900">${escapeHtml(item.domainName)}</p>`,
              `<p class="mt-1 text-xs text-gray-500">Provider: ${escapeHtml(item.provider || "-")} • Status: ${escapeHtml(
                item.status || "-"
              )}</p>`,
              '<div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-600">',
              `<div class="rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-200"><span class="font-semibold text-gray-700">Registered:</span> ${escapeHtml(
                formatDate(item.registeredAt || item.createdAt)
              )}</div>`,
              `<div class="rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-200"><span class="font-semibold text-gray-700">Renewal due:</span> ${escapeHtml(
                deriveRenewalDate(item)
              )}</div>`,
              `<div class="rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-200"><span class="font-semibold text-gray-700">Amount:</span> ${escapeHtml(
                formatMoney(item.purchaseCurrency, item.purchaseAmountMinor)
              )}</div>`,
              "</div>",
              '<div class="mt-4 flex flex-wrap gap-2">',
              `<button type="button" data-dns-toggle="${escapeAttr(
                item.domainName
              )}" class="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors">Manage DNS</button>`,
              `<button type="button" data-netlify-toggle="${escapeAttr(
                item.domainName
              )}" class="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-500 transition-colors">Netlify Details</button>`,
              "</div>",
              '<p class="mt-2 text-xs text-gray-500">Prompt to Profit students: use <span class="font-semibold">Netlify Details</span> to submit your connection information.</p>',
              dnsPanelHtml(item.domainName),
              "</article>",
            ].join("");
          })
          .join("");
      }

      if (!orders.length) {
        if (ordersEl) {
          ordersEl.innerHTML = '<p class="text-sm text-gray-500">No order records yet.</p>';
        }
        return;
      }

      if (ordersEl) {
        ordersEl.innerHTML = orders
          .map(function (item) {
            return [
              '<article class="rounded-xl border border-gray-200 bg-white p-4">',
              `<p class="text-sm font-semibold text-gray-900">${escapeHtml(item.domainName)}</p>`,
              `<p class="text-xs text-gray-500 mt-1">Order: ${escapeHtml(item.orderUuid || "-")} • Status: ${escapeHtml(
                item.status || "-"
              )}</p>`,
              `<p class="text-xs text-gray-500 mt-1">Placed: ${escapeHtml(formatDate(item.createdAt))} • Amount: ${escapeHtml(
                formatMoney(item.purchaseCurrency, item.purchaseAmountMinor)
              )}</p>`,
              "</article>",
            ].join("");
          })
          .join("");
      }
    } catch (error) {
      if (metaEl) metaEl.textContent = "Could not load domain records.";
      if (listEl) listEl.innerHTML = `<p class="text-sm text-red-600">${escapeHtml(error.message || "Request failed")}</p>`;
      if (ordersEl) ordersEl.innerHTML = "";
    }
  }

  bindDnsEvents();
  load();
})();
