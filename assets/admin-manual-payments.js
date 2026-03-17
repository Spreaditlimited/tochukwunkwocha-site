(function () {
  const loginCard = document.getElementById("adminLoginCard");
  const appCard = document.getElementById("adminAppCard");
  const internalShell = document.getElementById("internalShell");

  const loginForm = document.getElementById("adminLoginForm");
  const loginBtn = document.getElementById("adminLoginBtn");
  const loginErr = document.getElementById("adminLoginError");

  const statusFilter = document.getElementById("adminStatusFilter");
  const searchInput = document.getElementById("adminSearchInput");
  const refreshBtn = document.getElementById("adminRefreshBtn");
  const logoutBtn = document.getElementById("adminLogoutBtn");
  const rowsEl = document.getElementById("adminRows");
  const messageEl = document.getElementById("adminMessage");

  let debounceTimer = null;

  function setAuthMode(isAuthMode) {
    if (!internalShell) return;
    internalShell.classList.toggle("internal-shell--auth", !!isAuthMode);
  }

  function selectedStatus() {
    if (!statusFilter) return "pending_verification";
    const active = statusFilter.querySelector(".status-filter__btn.is-active");
    return active && active.getAttribute("data-status")
      ? String(active.getAttribute("data-status"))
      : "pending_verification";
  }

  function statusLabel(status) {
    if (status === "pending_verification") return "Pending";
    if (status === "approved") return "Approved";
    if (status === "rejected") return "Rejected";
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

  function fmtMoney(amountMinor, currency) {
    const amount = Number(amountMinor || 0) / 100;
    const code = String(currency || "NGN").toUpperCase();
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch (_error) {
      return `${code} ${amount.toFixed(2)}`;
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

  function rowMarkup(item) {
    const status = String(item.status || "");
    const canReview = status === "pending_verification";
    const payer = `${escapeHtml(item.first_name || "")}<br /><small>${escapeHtml(item.email || "")}</small>`;
    const amount = fmtMoney(item.amount_minor, item.currency);

    return `
      <tr data-payment-uuid="${escapeHtml(item.payment_uuid)}">
        <td>${escapeHtml(fmtDate(item.created_at))}</td>
        <td>${payer}</td>
        <td>${escapeHtml(item.course_slug || "")}</td>
        <td>${escapeHtml(amount)}</td>
        <td><span class="status-pill status-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></td>
        <td>${
          item.proof_url
            ? `<a href="${escapeHtml(item.proof_url)}" target="_blank" rel="noopener noreferrer">View proof</a>`
            : "-"
        }</td>
        <td>
          ${
            canReview
              ? '<div class="action-buttons"><button type="button" class="btn-small btn-small-approve" data-action="approve">Approve</button><button type="button" class="btn-small btn-small-danger" data-action="reject">Reject</button></div>'
              : `<small>${escapeHtml(item.reviewed_by || "reviewed")}</small>`
          }
        </td>
      </tr>
    `;
  }

  async function loadItems() {
    setMessage("", "");

    const status = selectedStatus();
    const search = searchInput ? searchInput.value.trim() : "";
    const qs = new URLSearchParams({ status, search, limit: "100" });

    const res = await fetch(`/.netlify/functions/admin-manual-payments-list?${qs.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (res.status === 401) {
      if (appCard) appCard.hidden = true;
      if (loginCard) loginCard.hidden = false;
      setAuthMode(true);
      return;
    }

    const json = await res.json().catch(function () {
      return null;
    });

    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load manual payments");
    }

    const items = Array.isArray(json.items) ? json.items : [];
    if (rowsEl) {
      rowsEl.innerHTML = items.length
        ? items.map(rowMarkup).join("")
        : '<tr><td colspan="7"><small>No records found.</small></td></tr>';
    }

    if (appCard) appCard.hidden = false;
    if (loginCard) loginCard.hidden = true;
    setAuthMode(false);
  }

  async function handleReview(paymentUuid, action) {
    const note = window.prompt(action === "approve" ? "Optional approval note" : "Optional rejection note", "");
    if (note === null) return;

    const res = await fetch("/.netlify/functions/admin-manual-payments-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentUuid, action, reviewNote: note }),
    });

    const json = await res.json().catch(function () {
      return null;
    });

    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Review failed");
    }

    if (action === "approve") {
      setMessage("Payment approved and moved to main enrolment segment.", "ok");
    } else {
      setMessage("Payment marked as rejected.", "ok");
    }

    await loadItems();
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (loginErr) loginErr.textContent = "";

      const password = String((loginForm.password && loginForm.password.value) || "");
      if (!password.trim()) {
        if (loginErr) loginErr.textContent = "Password is required.";
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = "Signing in...";
      try {
        const res = await fetch("/.netlify/functions/admin-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const json = await res.json().catch(function () {
          return null;
        });

        if (!res.ok || !json || !json.ok) {
          throw new Error((json && json.error) || "Sign in failed");
        }

        loginForm.reset();
        await loadItems();
      } catch (error) {
        if (loginErr) loginErr.textContent = error.message || "Sign in failed";
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Sign in";
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      await fetch("/.netlify/functions/admin-logout", { method: "POST" }).catch(function () {
        return null;
      });
      if (appCard) appCard.hidden = true;
      if (loginCard) loginCard.hidden = false;
      setMessage("", "");
      setAuthMode(true);
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
      }, 280);
    });
  }

  if (rowsEl) {
    rowsEl.addEventListener("click", function (event) {
      const btn = event.target.closest("button[data-action]");
      if (!btn) return;
      const row = btn.closest("tr[data-payment-uuid]");
      if (!row) return;
      const paymentUuid = row.getAttribute("data-payment-uuid");
      const action = btn.getAttribute("data-action");
      if (!paymentUuid || !action) return;

      handleReview(paymentUuid, action).catch(function (error) {
        setMessage(error.message || "Could not update payment", "error");
      });
    });
  }

  loadItems().catch(function (_error) {
    if (appCard) appCard.hidden = true;
    if (loginCard) loginCard.hidden = false;
    setAuthMode(true);
  });
})();
