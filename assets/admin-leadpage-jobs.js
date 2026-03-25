(function () {
  const appCard = document.getElementById("adminAppCard");
  const internalShell = document.getElementById("internalShell");

  const statusFilter = document.getElementById("adminStatusFilter");
  const searchInput = document.getElementById("adminSearchInput");
  const refreshBtn = document.getElementById("adminRefreshBtn");
  const logoutBtn = document.getElementById("adminLogoutBtn");
  const rowsEl = document.getElementById("adminRows");
  const messageEl = document.getElementById("adminMessage");
  const detailsModal = document.getElementById("adminDetailsModal");
  const detailsBody = document.getElementById("adminDetailsBody");

  let debounceTimer = null;
  let itemsByJobUuid = {};
  let suggestionHistoryByJobUuid = {};

  const STATUSES = [
    "details_pending",
    "details_complete",
    "copy_generated",
    "page_built",
    "qa_passed",
    "delivered",
  ];

  function redirectToInternalSignIn() {
    const next = `${window.location.pathname}${window.location.search || ""}`;
    window.location.href = `/internal/?next=${encodeURIComponent(next)}`;
  }

  function setAuthMode(isAuthMode) {
    if (!internalShell) return;
    internalShell.classList.toggle("internal-shell--auth", !!isAuthMode);
  }

  function bootAppShell() {
    if (appCard) appCard.hidden = false;
    setAuthMode(false);
    setMessage("Loading...", "ok");
  }

  function selectedStatus() {
    if (!statusFilter) return "details_pending";
    const active = statusFilter.querySelector(".status-filter__btn.is-active");
    return active && active.getAttribute("data-status")
      ? String(active.getAttribute("data-status"))
      : "details_pending";
  }

  function statusLabel(status) {
    return String(status || "").replace(/_/g, " ");
  }

  function setMessage(text, type) {
    if (!messageEl) return;
    messageEl.textContent = text || "";
    messageEl.classList.toggle("hidden", !text);
    messageEl.classList.remove(
      "is-error",
      "is-ok",
      "rounded-xl",
      "border",
      "px-4",
      "py-3",
      "text-sm",
      "font-semibold",
      "bg-emerald-50",
      "text-emerald-800",
      "border-emerald-200",
      "bg-rose-50",
      "text-rose-800",
      "border-rose-200",
      "bg-gray-50",
      "text-gray-700",
      "border-gray-200"
    );
    if (!text) return;
    messageEl.classList.add("rounded-xl", "border", "px-4", "py-3", "text-sm", "font-semibold");
    if (type === "error") {
      messageEl.classList.add("is-error", "bg-rose-50", "text-rose-800", "border-rose-200");
      return;
    }
    if (type === "ok") {
      messageEl.classList.add("is-ok", "bg-emerald-50", "text-emerald-800", "border-emerald-200");
      return;
    }
    messageEl.classList.add("bg-gray-50", "text-gray-700", "border-gray-200");
  }

  function showActionFeedback(text, type) {
    setMessage(text, type);
    if (!text) return;
    window.setTimeout(function () {
      if (messageEl) {
        messageEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 0);
  }

  function fmtDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function statusOptions(current) {
    return STATUSES.map(function (status) {
      const selected = status === current ? " selected" : "";
      return `<option value="${escapeHtml(status)}"${selected}>${escapeHtml(statusLabel(status))}</option>`;
    }).join("");
  }

  function boolText(value) {
    return value ? "Yes" : "No";
  }

  function detailRow(label, value) {
    const safeValue = value === null || value === undefined || value === "" ? "-" : String(value);
    return `<div class="grid grid-cols-[180px_1fr] gap-3 border-b border-gray-100 py-2"><div class="font-semibold text-gray-900">${escapeHtml(label)}</div><div class="text-gray-700 break-words">${escapeHtml(safeValue)}</div></div>`;
  }

  function tempPreviewUrl(item) {
    if (!item || !item.job_uuid || !item.client_access_token) return "";
    return `/projects/index.html?job_uuid=${encodeURIComponent(String(item.job_uuid))}&access=${encodeURIComponent(
      String(item.client_access_token)
    )}`;
  }

  function openDetails(item) {
    if (!detailsModal || !detailsBody || !item) return;

    detailsBody.innerHTML = [
      '<div class="space-y-6">',
      '<section>',
      '<h4 class="mb-2 text-base font-heading font-bold text-gray-900">Contact & Business</h4>',
      detailRow("Job UUID", item.job_uuid),
      detailRow("Submitted", fmtDate(item.created_at)),
      detailRow("Full name", item.full_name),
      detailRow("Email", item.email),
      detailRow("Phone", item.phone),
      detailRow("Business name", item.business_name),
      detailRow("Business type", item.business_type),
      detailRow("Service offer", item.service_offer),
      detailRow("Target location", item.target_location),
      detailRow("Primary goal", item.primary_goal),
      detailRow("CTA text", item.cta_text),
      detailRow("Tone", item.tone),
      detailRow("Notes", item.notes),
      "</section>",
      '<section>',
      '<h4 class="mb-2 text-base font-heading font-bold text-gray-900">Tracking & Domain</h4>',
      detailRow("Facebook Pixel ID", item.facebook_pixel_id),
      detailRow("Google Tag ID", item.google_tag_id),
      detailRow("Domain status", item.domain_status),
      detailRow("Domain name", item.domain_name),
      detailRow("Domain provider", item.domain_provider),
      detailRow("Domain order ID", item.domain_order_id),
      detailRow("Domain purchase currency", item.domain_purchase_currency),
      detailRow("Domain purchase amount (minor)", item.domain_purchase_amount_minor),
      detailRow("Domain purchased at", fmtDate(item.domain_purchased_at)),
      detailRow("Hostinger email", item.hostinger_email),
      "</section>",
      '<section>',
      '<h4 class="mb-2 text-base font-heading font-bold text-gray-900">Payment & Publish</h4>',
      detailRow("Payment status", item.payment_status),
      detailRow("Payment provider", item.payment_provider),
      detailRow("Payment reference", item.payment_reference),
      detailRow("Payment currency", item.payment_currency),
      detailRow("Payment amount (minor)", item.payment_amount_minor),
      detailRow("Payment initiated", fmtDate(item.payment_initiated_at)),
      detailRow("Payment paid", fmtDate(item.payment_paid_at)),
      detailRow("Build status", item.status),
      detailRow("Publish status", item.publish_status),
      detailRow("Publish enabled", boolText(Number(item.publish_enabled || 0) === 1)),
      detailRow("Published URL", item.published_url),
      detailRow("Last published", fmtDate(item.last_published_at)),
      detailRow("Build URL", item.build_url),
      detailRow("Delivery URL", item.delivery_url),
      detailRow("Temporary preview URL", tempPreviewUrl(item)),
      "</section>",
      "</div>",
    ].join("");

    detailsModal.classList.remove("hidden");
    detailsModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("overflow-hidden");
  }

  function closeDetails() {
    if (!detailsModal) return;
    detailsModal.classList.add("hidden");
    detailsModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("overflow-hidden");
  }

  function rowMarkup(item) {
    const status = String(item.status || "");
    const paymentStatus = String(item.payment_status || "").toLowerCase();
    const publishStatus = String(item.publish_status || "draft");
    const publishEnabled = Number(item.publish_enabled || 0) === 1;
    const showFirstPublish = paymentStatus === "paid" && !publishEnabled;
    const canRegenerateDesign = paymentStatus === "paid";
    const goal = String(item.primary_goal || "").trim();
    const domainValue = String(item.domain_name || "").trim().toLowerCase();
    const tempUrl = tempPreviewUrl(item);
    const firstPublishBtn = showFirstPublish
      ? '<button type="button" class="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500" data-action="first-publish">First Publish</button>'
      : "";
    const regenerateBtn = canRegenerateDesign
      ? '<button type="button" class="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500" data-action="regenerate-design">Regenerate Design</button>'
      : '<button type="button" class="inline-flex w-full items-center justify-center rounded-md bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-500 ring-1 ring-gray-200" disabled title="Payment must be confirmed before regeneration">Regenerate Design</button>';

    return `
      <tr data-job-uuid="${escapeHtml(item.job_uuid)}">
        <td>
          <div class="font-semibold text-gray-900">${escapeHtml(fmtDate(item.created_at))}</div>
          <div class="mt-1 text-xs text-gray-500">${escapeHtml(item.job_uuid || "")}</div>
        </td>
        <td>
          <div class="font-semibold text-gray-900">${escapeHtml(item.business_name || "-")}</div>
          <div class="mt-1 text-xs text-gray-600">${escapeHtml(item.full_name || "-")}</div>
          <div class="mt-1 text-xs text-gray-500">${escapeHtml(item.email || "-")}</div>
          <div class="mt-1 text-xs text-gray-500">${escapeHtml(item.phone || "-")}</div>
        </td>
        <td>
          <div class="font-medium text-gray-800">${escapeHtml(item.service_offer || "-")}</div>
          <div class="mt-1 text-xs text-gray-500">Goal: ${escapeHtml(goal || "-")}</div>
        </td>
        <td>
          <span class="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">${escapeHtml(statusLabel(status))}</span>
          <div class="mt-2 text-xs text-gray-500">Domain: ${escapeHtml(item.domain_status || "-")}</div>
        </td>
        <td>
          <div>
            <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${paymentStatus === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}">${escapeHtml(paymentStatus || "unpaid")}</span>
          </div>
          <div class="mt-2 text-xs text-gray-600">Publish: ${escapeHtml(publishStatus)}</div>
          <div class="mt-1 text-xs text-gray-600">Enabled: ${publishEnabled ? "Yes" : "No"}</div>
        </td>
        <td>
          <div class="min-w-[300px] space-y-2">
            <button type="button" class="inline-flex w-full items-center justify-center rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-500" data-action="view">View Details</button>
            ${
              tempUrl
                ? `<a href="${escapeHtml(tempUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex w-full items-center justify-center rounded-md bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500">Open Temporary URL</a>`
                : '<span class="inline-flex w-full items-center justify-center rounded-md bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-500 ring-1 ring-gray-200">Temporary URL unavailable</span>'
            }
            <div class="flex items-center gap-2">
              <select class="job-status-select w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-700" aria-label="Set status">
                ${statusOptions(status)}
              </select>
              <button type="button" class="inline-flex shrink-0 items-center justify-center rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700" data-action="save">Save</button>
            </div>
            ${regenerateBtn}
            ${firstPublishBtn}
            <div class="rounded-md border border-gray-200 bg-gray-50 p-2.5">
              <div class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Domain Actions</div>
              <input
                type="text"
                data-role="domain-name"
                value="${escapeHtml(domainValue)}"
                placeholder="e.g. yourbrand.com"
                class="mb-2 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-800"
              />
              <div class="grid grid-cols-3 gap-2">
                <button type="button" class="inline-flex items-center justify-center rounded-md bg-white px-2 py-2 text-[11px] font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-100" data-action="domain-suggest">Suggest</button>
                <button type="button" class="inline-flex items-center justify-center rounded-md bg-white px-2 py-2 text-[11px] font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-100" data-action="domain-check">Check</button>
                <span class="inline-flex items-center justify-center rounded-md bg-gray-100 px-2 py-2 text-[11px] font-semibold text-gray-500 ring-1 ring-gray-200">User registers in dashboard</span>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  async function loadItems() {
    setMessage("", "");

    const status = selectedStatus();
    const search = searchInput ? searchInput.value.trim() : "";
    const qs = new URLSearchParams({ status, search, limit: "120" });

    const res = await fetch(`/.netlify/functions/admin-leadpage-jobs-list?${qs.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (res.status === 401) {
      redirectToInternalSignIn();
      return;
    }

    const json = await res.json().catch(function () {
      return null;
    });

    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load jobs");
    }

    const items = Array.isArray(json.items) ? json.items : [];
    itemsByJobUuid = items.reduce(function (acc, item) {
      if (item && item.job_uuid) acc[String(item.job_uuid)] = item;
      return acc;
    }, {});
    suggestionHistoryByJobUuid = {};

    if (rowsEl) {
      rowsEl.innerHTML = items.length
        ? items.map(rowMarkup).join("")
        : '<tr><td colspan="6" class="px-6 py-10 text-center text-sm text-gray-500">No jobs found.</td></tr>';
    }

    if (appCard) appCard.hidden = false;
    setAuthMode(false);
  }

  async function updateJob(jobUuid, status) {
    const res = await fetch("/.netlify/functions/admin-leadpage-jobs-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobUuid,
        status,
        adminNote: `Status set to ${status}`,
      }),
    });

    const json = await res.json().catch(function () {
      return null;
    });

    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not update status");
    }

    setMessage("Job updated successfully.", "ok");
    await loadItems();
  }

  async function firstPublish(jobUuid) {
    const res = await fetch("/.netlify/functions/admin-leadpage-first-publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobUuid }),
    });

    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not run first publish");
    }

    setMessage("First publish completed.", "ok");
    await loadItems();
  }

  async function regenerateDesign(jobUuid) {
    const res = await fetch("/.netlify/functions/admin-leadpage-run-automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobUuid, dryRun: false }),
    });

    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not regenerate design");
    }

    const result = json.result && typeof json.result === "object" ? json.result : {};
    const provider = String(result.provider || "ai");
    const artifact = result.artifact && typeof result.artifact === "object" ? result.artifact : {};
    const htmlSource = String(artifact.htmlSource || "").trim();
    const quality = artifact.htmlQuality && typeof artifact.htmlQuality === "object" ? artifact.htmlQuality : null;
    if (result.mock) {
      throw new Error(
        `Design regeneration used MOCK output. Set LEADPAGE_AUTOMATION_ALLOW_MOCK=0 and ensure ${provider.toUpperCase()} API key is valid, then run again.`
      );
    }
    const qualitySummary =
      quality && Array.isArray(quality.issues) && quality.issues.length
        ? ` (quality issues: ${quality.issues.join(", ")})`
        : "";
    const msg = `Design regenerated via ${provider}${htmlSource ? ` [${htmlSource}]` : ""}${qualitySummary}.`;
    await loadItems();
    showActionFeedback(msg, "ok");
  }

  function selectedDomainFromRow(row) {
    const input = row ? row.querySelector("input[data-role='domain-name']") : null;
    return input ? String(input.value || "").trim().toLowerCase() : "";
  }

  function setDomainInRow(row, domainName) {
    const input = row ? row.querySelector("input[data-role='domain-name']") : null;
    if (!input) return;
    input.value = String(domainName || "").trim().toLowerCase();
  }

  async function suggestDomain(jobUuid, preferredName) {
    const res = await fetch("/.netlify/functions/admin-leadpage-domain-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobUuid, preferredName, limit: 10 }),
    });

    const json = await res.json().catch(function () {
      return null;
    });

    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not suggest domain");
    }

    return json;
  }

  async function checkDomain(jobUuid, domainName) {
    const res = await fetch("/.netlify/functions/admin-leadpage-domain-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobUuid, domainName }),
    });

    const json = await res.json().catch(function () {
      return null;
    });

    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not check domain");
    }

    return json;
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      await fetch("/.netlify/functions/admin-logout", { method: "POST" }).catch(function () {
        return null;
      });
      window.location.href = "/internal/";
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      loadItems().catch(function (error) {
        setMessage(error.message || "Could not refresh", "error");
      });
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener("click", function (event) {
      const btn = event.target.closest(".status-filter__btn");
      if (!btn || !statusFilter.contains(btn)) return;

      statusFilter.querySelectorAll(".status-filter__btn").forEach(function (item) {
        item.classList.toggle("is-active", item === btn);
      });

      loadItems().catch(function (error) {
        setMessage(error.message || "Could not filter", "error");
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        loadItems().catch(function (error) {
          setMessage(error.message || "Could not search", "error");
        });
      }, 260);
    });
  }

  if (rowsEl) {
    rowsEl.addEventListener("click", function (event) {
      const viewBtn = event.target.closest("button[data-action='view']");
      if (viewBtn) {
        const viewRow = viewBtn.closest("tr[data-job-uuid]");
        if (!viewRow) return;
        const viewJobUuid = String(viewRow.getAttribute("data-job-uuid") || "");
        const item = viewJobUuid ? itemsByJobUuid[viewJobUuid] : null;
        if (!item) return;
        openDetails(item);
        return;
      }

      const firstPublishBtn = event.target.closest("button[data-action='first-publish']");
      if (firstPublishBtn) {
        const firstPublishRow = firstPublishBtn.closest("tr[data-job-uuid]");
        if (!firstPublishRow) return;
        const fpJobUuid = firstPublishRow.getAttribute("data-job-uuid");
        if (!fpJobUuid) return;
        firstPublishBtn.disabled = true;
        firstPublish(fpJobUuid)
          .catch(function (error) {
            setMessage(error.message || "Could not run first publish", "error");
          })
          .finally(function () {
            firstPublishBtn.disabled = false;
          });
        return;
      }

      const regenerateBtn = event.target.closest("button[data-action='regenerate-design']");
      if (regenerateBtn) {
        const regenerateRow = regenerateBtn.closest("tr[data-job-uuid]");
        if (!regenerateRow) return;
        const jobUuid = regenerateRow.getAttribute("data-job-uuid");
        if (!jobUuid) return;
        regenerateBtn.disabled = true;
        regenerateBtn.textContent = "Regenerating...";
        regenerateDesign(jobUuid)
          .catch(function (error) {
            setMessage(error.message || "Could not regenerate design", "error");
          })
          .finally(function () {
            regenerateBtn.disabled = false;
            regenerateBtn.textContent = "Regenerate Design";
          });
        return;
      }

      const suggestBtn = event.target.closest("button[data-action='domain-suggest']");
      if (suggestBtn) {
        const suggestRow = suggestBtn.closest("tr[data-job-uuid]");
        if (!suggestRow) return;
        const jobUuid = String(suggestRow.getAttribute("data-job-uuid") || "");
        if (!jobUuid) return;
        const preferredName = selectedDomainFromRow(suggestRow);

        suggestBtn.disabled = true;
        suggestDomain(jobUuid, preferredName)
          .then(function (result) {
            const current = String(preferredName || "").trim().toLowerCase();
            const available = Array.isArray(result.suggestions)
              ? result.suggestions
                  .filter(function (x) {
                    return x && x.available && x.domainName;
                  })
                  .map(function (x) {
                    return String(x.domainName || "").trim().toLowerCase();
                  })
              : [];
            const used = Array.isArray(suggestionHistoryByJobUuid[jobUuid]) ? suggestionHistoryByJobUuid[jobUuid] : [];
            let pick = available.find(function (name) {
              return name && name !== current && !used.includes(name);
            });
            if (!pick) {
              pick = available.find(function (name) {
                return name && name !== current;
              });
            }
            if (!pick) {
              pick = String(result.firstAvailable || "").trim().toLowerCase();
            }
            if (pick) {
              suggestionHistoryByJobUuid[jobUuid] = used.concat([pick]).slice(-20);
            }
            if (pick) setDomainInRow(suggestRow, pick);
            if (pick) {
              setMessage(`Domain suggestion ready: ${pick}`, "ok");
            } else {
              setMessage("No available domain found in current suggestions.", "error");
            }
          })
          .catch(function (error) {
            setMessage(error.message || "Could not suggest domain", "error");
          })
          .finally(function () {
            suggestBtn.disabled = false;
          });
        return;
      }

      const checkBtn = event.target.closest("button[data-action='domain-check']");
      if (checkBtn) {
        const checkRow = checkBtn.closest("tr[data-job-uuid]");
        if (!checkRow) return;
        const jobUuid = String(checkRow.getAttribute("data-job-uuid") || "");
        const domainName = selectedDomainFromRow(checkRow);
        if (!jobUuid || !domainName) {
          setMessage("Enter a domain name first.", "error");
          return;
        }

        checkBtn.disabled = true;
        checkDomain(jobUuid, domainName)
          .then(function (result) {
            const statusText = result.available ? "available" : "not available";
            setMessage(`${domainName} is ${statusText}.`, result.available ? "ok" : "error");
          })
          .catch(function (error) {
            setMessage(error.message || "Could not check domain", "error");
          })
          .finally(function () {
            checkBtn.disabled = false;
          });
        return;
      }

      const btn = event.target.closest("button[data-action='save']");
      if (!btn) return;
      const row = btn.closest("tr[data-job-uuid]");
      if (!row) return;

      const jobUuid = row.getAttribute("data-job-uuid");
      const select = row.querySelector(".job-status-select");
      const status = select ? String(select.value || "") : "";
      if (!jobUuid || !status) return;

      btn.disabled = true;
      updateJob(jobUuid, status)
        .catch(function (error) {
          setMessage(error.message || "Could not update job", "error");
        })
        .finally(function () {
          btn.disabled = false;
        });
    });
  }

  if (detailsModal) {
    detailsModal.addEventListener("click", function (event) {
      if (event.target.closest("[data-details-close]")) closeDetails();
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeDetails();
  });

  bootAppShell();
  loadItems().catch(function (error) {
    const text = String(error && error.message ? error.message : "");
    if (/not signed in|unauthorized|session/i.test(text)) {
      redirectToInternalSignIn();
      return;
    }
    setMessage(text || "Could not load jobs", "error");
  });
})();
