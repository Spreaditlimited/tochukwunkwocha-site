(function () {
  const appCard = document.getElementById("adminAppCard");
  const logoutBtn = document.getElementById("adminLogoutBtn");
  const refreshBtn = document.getElementById("adminRefreshBtn");
  const statusFilter = document.getElementById("adminStatusFilter");
  const courseFilter = document.getElementById("adminCourseFilter");
  const batchFilter = document.getElementById("adminBatchFilter");
  const searchInput = document.getElementById("adminSearchInput");
  const rowsEl = document.getElementById("adminRows");
  const messageEl = document.getElementById("adminMessage");
  const summaryPlansEl = document.getElementById("summaryPlans");
  const summaryPaidEl = document.getElementById("summaryPaid");
  const summaryPendingEl = document.getElementById("summaryPending");
  const summaryAmountEl = document.getElementById("summaryAmount");

  let debounceTimer = null;
  let latestSummary = null;
  const FALLBACK_COURSES = [
    { slug: "prompt-to-profit", label: "Prompt to Profit" },
    { slug: "prompt-to-production", label: "Prompt to Profit Advanced" },
    { slug: "prompt-to-profit-schools", label: "Prompt to Profit for Schools" },
  ];

  function redirectToInternalSignIn() {
    const next = `${window.location.pathname}${window.location.search || ""}`;
    window.location.href = `/internal/?next=${encodeURIComponent(next)}`;
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

  function selectedStatus() {
    const active = statusFilter ? statusFilter.querySelector(".status-filter__btn.is-active") : null;
    return active && active.getAttribute("data-status") ? String(active.getAttribute("data-status")) : "all";
  }

  function selectedBatch() {
    return batchFilter ? String(batchFilter.value || "").trim() : "all";
  }

  function selectedCourse() {
    return courseFilter ? String(courseFilter.value || "prompt-to-profit").trim() : "prompt-to-profit";
  }

  function setCourseOptions(items) {
    if (!courseFilter) return;
    const selected = selectedCourse();
    const list = Array.isArray(items) && items.length ? items : FALLBACK_COURSES;
    const options = list
      .map(function (item) {
        const slug = String(item && item.slug || "").trim();
        const label = String(item && item.label || slug).trim();
        if (!slug) return "";
        return `<option value="${escapeHtml(slug)}">${escapeHtml(label || slug)}</option>`;
      })
      .filter(Boolean);
    if (!options.length) return;
    courseFilter.innerHTML = options.join("");
    const hasSelected = list.some(function (item) {
      return String(item && item.slug || "").trim() === selected;
    });
    courseFilter.value = hasSelected ? selected : String((list[0] && list[0].slug) || "prompt-to-profit");
  }

  async function loadCourseOptions() {
    if (!courseFilter) return;
    const res = await fetch("/.netlify/functions/admin-course-slugs-list", {
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
      throw new Error((json && json.error) || "Could not load course options");
    }
    setCourseOptions(Array.isArray(json.items) ? json.items : []);
  }

  function fmtDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
  }

  function fmtMoney(minor, currency) {
    const amount = Number(minor || 0) / 100;
    const code = String(currency || "NGN").toUpperCase();
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(amount);
    } catch (_error) {
      return `${code} ${amount.toFixed(2)}`;
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

  function setMessage(text, type) {
    if (!messageEl) return;
    messageEl.textContent = text || "";
    messageEl.classList.remove("text-red-600", "text-green-600", "hidden");
    if (!text) {
      messageEl.classList.add("hidden");
      return;
    }
    messageEl.classList.add(type === "error" ? "text-red-600" : "text-green-600");
  }

  function renderBatchOptions(summary) {
    if (!batchFilter || !summary || !Array.isArray(summary.availableBatches)) return;
    const current = selectedBatch() || "all";
    const options = ['<option value="all">All batches</option>']
      .concat(summary.availableBatches.map(function (b) {
        const key = String(b.batchKey || "").trim();
        if (!key) return "";
        const selected = key === current ? " selected" : "";
        return `<option value="${escapeHtml(key)}"${selected}>${escapeHtml(String(b.batchLabel || key))}</option>`;
      }).filter(Boolean));
    batchFilter.innerHTML = options.join("");
    if (current) batchFilter.value = current;
  }

  function renderSummary(summary) {
    latestSummary = summary || null;
    if (!summary) return;
    if (courseFilter && summary.courseSlug) {
      courseFilter.value = String(summary.courseSlug || selectedCourse());
    }
    if (summaryPlansEl) summaryPlansEl.textContent = String(Number(summary.totalPlans || 0));
    if (summaryPaidEl) summaryPaidEl.textContent = String(Number(summary.paidCount || 0));
    if (summaryPendingEl) summaryPendingEl.textContent = String(Number(summary.pendingCount || 0));
    if (summaryAmountEl) {
      const totals = summary.totalsByCurrency && typeof summary.totalsByCurrency === "object" ? summary.totalsByCurrency : {};
      const amountText = Object.keys(totals).sort().map(function (currency) {
        return fmtMoney(totals[currency], currency);
      }).join(" + ");
      summaryAmountEl.textContent = amountText || "--";
    }
    renderBatchOptions(summary);
  }

  function rowMarkup(item) {
    const paid = String(item.paymentStatus || "").toLowerCase() === "paid";
    const statusPill = paid
      ? '<span class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">Paid</span>'
      : '<span class="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">In Progress</span>';
    const progress = `${fmtMoney(item.totalPaidMinor, item.currency)} / ${fmtMoney(item.targetAmountMinor, item.currency)}`;
    return `
      <tr>
        <td class="py-3.5 pl-4 pr-3 text-sm text-gray-600">${escapeHtml(fmtDate(item.createdAt))}</td>
        <td class="px-3 py-3.5 text-sm text-gray-600">${escapeHtml(item.fullName)}<br /><small>${escapeHtml(item.email)}</small></td>
        <td class="px-3 py-3.5 text-sm text-gray-600">${escapeHtml(item.batchLabel || "-")}</td>
        <td class="px-3 py-3.5 text-sm text-gray-600">${escapeHtml(item.providerLabel || "-")}</td>
        <td class="px-3 py-3.5 text-sm text-gray-600">${escapeHtml(fmtMoney(item.amountMinor, item.currency))}</td>
        <td class="px-3 py-3.5 text-sm text-gray-600">${statusPill}</td>
        <td class="px-3 py-3.5 text-sm text-gray-600">${escapeHtml(progress)}</td>
        <td class="px-3 py-3.5 text-sm text-gray-600">${escapeHtml(item.providerReference || "-")}</td>
      </tr>
    `;
  }

  async function loadItems() {
    const qs = new URLSearchParams({
      course_slug: selectedCourse(),
      status: selectedStatus(),
      batch_key: selectedBatch() || "all",
      search: searchInput ? String(searchInput.value || "").trim() : "",
      limit: "120",
    });
    const res = await fetch(`/.netlify/functions/admin-installments-list?${qs.toString()}`, {
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
      throw new Error((json && json.error) || "Could not load installments");
    }
    const items = Array.isArray(json.items) ? json.items : [];
    renderSummary(json.summary || null);
    if (rowsEl) {
      rowsEl.innerHTML = items.length
        ? items.map(rowMarkup).join("")
        : '<tr><td colspan="8" class="px-6 py-10 text-center text-sm text-gray-500">No installment records found.</td></tr>';
    }
    showApp();
    setMessage("", "");
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      await fetch("/.netlify/functions/admin-logout", { method: "POST", credentials: "include" }).catch(function () {
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
      if (!btn) return;
      statusFilter.querySelectorAll(".status-filter__btn").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      loadItems().catch(function (error) {
        setMessage(error.message || "Could not filter", "error");
      });
    });
  }

  if (batchFilter) {
    batchFilter.addEventListener("change", function () {
      loadItems().catch(function (error) {
        setMessage(error.message || "Could not filter by batch", "error");
      });
    });
  }

  if (courseFilter) {
    courseFilter.addEventListener("change", function () {
      if (batchFilter) batchFilter.value = "all";
      loadItems().catch(function (error) {
        setMessage(error.message || "Could not filter by course", "error");
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

  bootAppShell();
  loadCourseOptions()
    .catch(function () {
      setCourseOptions(FALLBACK_COURSES);
      return null;
    })
    .then(function () {
      return loadItems();
    })
    .catch(function (error) {
    const text = String(error && error.message ? error.message : "");
    if (/not signed in|unauthorized|session/i.test(text)) {
      redirectToInternalSignIn();
      return;
    }
    showApp();
    setMessage(text || "Could not load installments.", "error");
    });
})();
