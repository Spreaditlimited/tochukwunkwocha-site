(function () {
  const appCard = document.getElementById("adminAppCard");
  const internalShell = document.getElementById("internalShell");

  const statusFilter = document.getElementById("adminStatusFilter");
  const searchInput = document.getElementById("adminSearchInput");
  const refreshBtn = document.getElementById("adminRefreshBtn");
  const logoutBtn = document.getElementById("adminLogoutBtn");
  const rowsEl = document.getElementById("adminRows");
  const messageEl = document.getElementById("adminMessage");

  let debounceTimer = null;

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
    messageEl.classList.remove("is-error", "is-ok");
    if (type === "error") messageEl.classList.add("is-error");
    if (type === "ok") messageEl.classList.add("is-ok");
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

  function rowMarkup(item) {
    const status = String(item.status || "");
    const contact = `${escapeHtml(item.full_name || "")}<br /><small>${escapeHtml(item.email || "")}</small><br /><small>${escapeHtml(item.phone || "")}</small>`;
    const paymentStatus = String(item.payment_status || "").toLowerCase();
    const publishEnabled = Number(item.publish_enabled || 0) === 1;
    const showFirstPublish = paymentStatus === "paid" && !publishEnabled;
    const firstPublishBtn = showFirstPublish
      ? '<button type="button" class="btn-small btn-small-approve" data-action="first-publish">First Publish</button>'
      : "";

    return `
      <tr data-job-uuid="${escapeHtml(item.job_uuid)}">
        <td>${escapeHtml(fmtDate(item.created_at))}</td>
        <td>${escapeHtml(item.business_name || "-")}</td>
        <td>${contact}</td>
        <td>${escapeHtml(item.service_offer || "-")}</td>
        <td><span class="status-pill status-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></td>
        <td>
          <div class="action-buttons">
            <select class="job-status-select" aria-label="Set status">
              ${statusOptions(status)}
            </select>
            <button type="button" class="btn-small btn-small-approve" data-action="save">Save</button>
            ${firstPublishBtn}
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
