(function () {
  const daysEl = document.getElementById("marketingDays");
  const refreshBtn = document.getElementById("marketingRefreshBtn");
  const messageEl = document.getElementById("marketingMessage");
  const periodEl = document.getElementById("marketingPeriodLeads");
  const totalEl = document.getElementById("marketingTotalLeads");
  const uniqueEl = document.getElementById("marketingUniqueEmails");
  const pagesCountEl = document.getElementById("marketingConvertingPages");
  const dailyChartEl = document.getElementById("marketingDailyChart");
  const sourceChartEl = document.getElementById("marketingSourceChart");
  const pageChartEl = document.getElementById("marketingPageChart");
  const campaignChartEl = document.getElementById("marketingCampaignChart");
  const rowsEl = document.getElementById("marketingLeadRows");

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setMessage(text, type) {
    if (!messageEl) return;
    const hasText = Boolean(text);
    messageEl.classList.toggle("hidden", !hasText);
    messageEl.textContent = String(text || "");
    messageEl.classList.remove("border-emerald-200", "bg-emerald-50", "text-emerald-800", "border-rose-200", "bg-rose-50", "text-rose-800");
    if (!hasText) return;
    if (type === "error") {
      messageEl.classList.add("border-rose-200", "bg-rose-50", "text-rose-800");
      return;
    }
    messageEl.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-800");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en").format(Number(value || 0));
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  function redirectToInternalSignIn() {
    const next = `${window.location.pathname}${window.location.search || ""}`;
    window.location.href = `/internal/?next=${encodeURIComponent(next)}`;
  }

  function renderBars(container, items, emptyText) {
    if (!container) return;
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      container.innerHTML = `<p class="text-sm text-gray-500">${escapeHtml(emptyText || "No data yet.")}</p>`;
      return;
    }

    const max = rows.reduce(function (acc, item) {
      return Math.max(acc, Number(item && item.leads || 0));
    }, 1);

    container.innerHTML = rows.map(function (item) {
      const label = String(item && item.label || "Unknown");
      const leads = Number(item && item.leads || 0);
      const pct = Math.max(3, Math.round((leads / max) * 100));
      return `
        <div>
          <div class="mb-1.5 flex items-center justify-between gap-3">
            <p class="min-w-0 truncate text-sm font-semibold text-gray-800" title="${escapeHtml(label)}">${escapeHtml(label)}</p>
            <p class="shrink-0 text-xs font-bold text-gray-500">${formatNumber(leads)}</p>
          </div>
          <div class="h-2.5 overflow-hidden rounded-full bg-gray-100">
            <div class="h-full rounded-full bg-brand-600" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderDailyChart(items) {
    if (!dailyChartEl) return;
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      dailyChartEl.innerHTML = '<div class="flex min-h-64 items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-500">No daily lead data yet.</div>';
      return;
    }

    const max = rows.reduce(function (acc, item) {
      return Math.max(acc, Number(item && item.leads || 0));
    }, 1);

    dailyChartEl.innerHTML = `
      <div class="flex min-h-64 items-end gap-2 rounded-xl bg-gray-50 px-4 pb-4 pt-6">
        ${rows.map(function (item) {
          const label = String(item && item.label || "");
          const leads = Number(item && item.leads || 0);
          const height = Math.max(8, Math.round((leads / max) * 210));
          return `
            <div class="flex min-w-[16px] flex-1 flex-col items-center justify-end gap-2">
              <div class="w-full rounded-t-lg bg-brand-600" style="height: ${height}px" title="${escapeHtml(label)}: ${formatNumber(leads)}"></div>
              <span class="hidden max-w-12 rotate-[-35deg] truncate text-[10px] text-gray-500 sm:block">${escapeHtml(label.slice(5))}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderLeadRows(leads) {
    if (!rowsEl) return;
    const rows = Array.isArray(leads) ? leads : [];
    if (!rows.length) {
      rowsEl.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-sm text-gray-500">No leads captured yet.</td></tr>';
      return;
    }

    rowsEl.innerHTML = rows.map(function (lead) {
      const name = String(lead && lead.firstName || "").trim() || "No name";
      const email = String(lead && lead.email || "").trim();
      const page = String(lead && lead.pathname || "").trim() || "/";
      const pageUrl = String(lead && lead.pageUrl || "").trim();
      const source = String(lead && (lead.utmSource || lead.source) || "").trim() || "direct/unknown";
      const medium = String(lead && lead.utmMedium || "").trim();
      const campaign = String(lead && lead.utmCampaign || "").trim() || "none";
      const referrer = String(lead && lead.referrer || "").trim() || "-";
      return `
        <tr class="align-top hover:bg-gray-50">
          <td class="px-4 py-3">
            <p class="font-semibold text-gray-900">${escapeHtml(name)}</p>
            <p class="text-xs text-gray-500">${escapeHtml(email)}</p>
          </td>
          <td class="px-4 py-3">
            ${pageUrl ? `<a href="${escapeHtml(pageUrl)}" target="_blank" rel="noreferrer" class="font-semibold text-brand-700 hover:text-brand-500">${escapeHtml(page)}</a>` : `<span class="font-semibold text-gray-800">${escapeHtml(page)}</span>`}
            <p class="mt-1 text-xs uppercase tracking-wide text-gray-400">${escapeHtml(lead && lead.pageType || "site")}</p>
          </td>
          <td class="px-4 py-3">
            <p class="font-semibold text-gray-800">${escapeHtml(source)}</p>
            <p class="text-xs text-gray-500">${escapeHtml(medium || "-")}</p>
          </td>
          <td class="px-4 py-3 text-gray-700">${escapeHtml(campaign)}</td>
          <td class="max-w-sm px-4 py-3">
            <p class="truncate text-gray-600" title="${escapeHtml(referrer)}">${escapeHtml(referrer)}</p>
          </td>
          <td class="px-4 py-3 text-gray-600">${escapeHtml(formatDateTime(lead && lead.createdAt))}</td>
        </tr>
      `;
    }).join("");
  }

  async function loadMarketingDashboard() {
    const days = Number(daysEl && daysEl.value || 30);
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Loading...";
    }
    setMessage("", "success");
    try {
      const res = await fetch(`/.netlify/functions/admin-marketing-leads?days=${encodeURIComponent(days)}&limit=150`, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      if (res.status === 401) {
        redirectToInternalSignIn();
        return;
      }
      const json = await res.json().catch(function () { return null; });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not load marketing dashboard.");
      }
      const dashboard = json.dashboard || {};
      const summary = dashboard.summary || {};
      if (periodEl) periodEl.textContent = formatNumber(summary.periodLeads);
      if (totalEl) totalEl.textContent = formatNumber(summary.totalLeads);
      if (uniqueEl) uniqueEl.textContent = formatNumber(summary.uniqueEmails);
      if (pagesCountEl) pagesCountEl.textContent = formatNumber(summary.convertingPages);
      renderDailyChart(dashboard.daily);
      renderBars(sourceChartEl, dashboard.sources, "No source data yet.");
      renderBars(pageChartEl, dashboard.pages, "No page data yet.");
      renderBars(campaignChartEl, dashboard.campaigns, "No campaign data yet.");
      renderLeadRows(dashboard.recentLeads);
    } catch (error) {
      setMessage(error && error.message ? error.message : "Could not load marketing dashboard.", "error");
      renderLeadRows([]);
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = "Refresh";
      }
    }
  }

  if (refreshBtn) refreshBtn.addEventListener("click", loadMarketingDashboard);
  if (daysEl) daysEl.addEventListener("change", loadMarketingDashboard);

  loadMarketingDashboard();
})();
