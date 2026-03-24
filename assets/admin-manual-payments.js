(function () {
  const appCard = document.getElementById("adminAppCard");
  const internalShell = document.getElementById("internalShell");

  const courseFilter = document.getElementById("adminCourseFilter");
  const statusFilter = document.getElementById("adminStatusFilter");
  const batchFilter = document.getElementById("adminBatchFilter");
  const searchInput = document.getElementById("adminSearchInput");
  const reconcileBtn = document.getElementById("adminReconcileBtn");
  const addStudentBtn = document.getElementById("adminAddStudentBtn");
  const createBatchBtn = document.getElementById("adminCreateBatchBtn");
  const editBatchBtn = document.getElementById("adminEditBatchBtn");
  const activateBatchBtn = document.getElementById("adminActivateBatchBtn");
  const activateBatchSelect = document.getElementById("adminActivateBatchSelect");
  const batchStartInput = document.getElementById("adminBatchStartAt");
  const activeBatchText = document.getElementById("adminActiveBatchText");
  const refreshBtn = document.getElementById("adminRefreshBtn");
  const logoutBtn = document.getElementById("adminLogoutBtn");
  const rowsEl = document.getElementById("adminRows");
  const messageEl = document.getElementById("adminMessage");
  const summaryTitleEl = document.getElementById("paymentsSummaryTitle");
  const summaryStatusEl = document.getElementById("paymentsSummaryStatus");
  const summaryPendingEl = document.getElementById("paymentsSummaryPending");
  const summaryCourseEl = document.getElementById("paymentsSummaryCourse");
  const summaryStudentsEl = document.getElementById("paymentsSummaryStudents");
  const summaryTotalEl = document.getElementById("paymentsSummaryTotal");
  const summarySourcesEl = document.getElementById("paymentsSummarySources");
  const reviewModal = document.getElementById("reviewModal");
  const reviewModalEyebrow = document.getElementById("reviewModalEyebrow");
  const reviewModalTitle = document.getElementById("reviewModalTitle");
  const reviewModalDesc = document.getElementById("reviewModalDesc");
  const reviewModalWarning = document.getElementById("reviewModalWarning");
  const reviewNoteLabel = document.getElementById("reviewNoteLabel");
  const reviewNoteInput = document.getElementById("reviewNoteInput");
  const reviewModalError = document.getElementById("reviewModalError");
  const reviewModalConfirmBtn = document.getElementById("reviewModalConfirmBtn");
  const addStudentModal = document.getElementById("addStudentModal");
  const addStudentForm = document.getElementById("addStudentForm");
  const addStudentBatch = document.getElementById("addStudentBatch");
  const addStudentProofFile = document.getElementById("addStudentProofFile");
  const addStudentError = document.getElementById("addStudentError");
  const addStudentSubmitBtn = document.getElementById("addStudentSubmitBtn");
  const createBatchModal = document.getElementById("createBatchModal");
  const createBatchForm = document.getElementById("createBatchForm");
  const createBatchError = document.getElementById("createBatchError");
  const createBatchSubmitBtn = document.getElementById("createBatchSubmitBtn");
  const editBatchModal = document.getElementById("editBatchModal");
  const editBatchForm = document.getElementById("editBatchForm");
  const editBatchError = document.getElementById("editBatchError");
  const editBatchSubmitBtn = document.getElementById("editBatchSubmitBtn");

  let debounceTimer = null;
  let pendingReviewAction = null;
  let latestBatches = [];
  const COURSE_DEFAULTS = {
    "prompt-to-profit": { prefix: "PTP", amountMinor: 1075000, paypalAmountMinor: 2400 },
    "prompt-to-production": { prefix: "PTPROD", amountMinor: 25000000, paypalAmountMinor: 2400 },
  };

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
    if (!statusFilter) return "pending_verification";
    const active = statusFilter.querySelector(".status-filter__btn.is-active");
    return active && active.getAttribute("data-status")
      ? String(active.getAttribute("data-status"))
      : "pending_verification";
  }

  function selectedBatchKey() {
    if (!batchFilter) return "";
    return String(batchFilter.value || "").trim();
  }

  function selectedCourseSlug() {
    if (!courseFilter) return "prompt-to-profit";
    const value = String(courseFilter.value || "").trim();
    return value || "prompt-to-profit";
  }

  function statusLabel(status) {
    if (status === "pending_verification") return "Pending";
    if (status === "approved") return "Approved";
    if (status === "rejected") return "Rejected";
    if (status === "paid") return "Approved";
    if (status === "pending") return "Pending";
    return String(status || "").replace(/_/g, " ");
  }

  function setMessage(text, type) {
    if (!messageEl) return;
    messageEl.textContent = text || "";
    messageEl.classList.remove("is-error", "is-ok");
    if (type === "error") messageEl.classList.add("is-error");
    if (type === "ok") messageEl.classList.add("is-ok");
  }

  function openReviewModal(payload) {
    pendingReviewAction = payload;
    if (!reviewModal) return;

    const approve = payload && payload.action === "approve";
    if (reviewModalEyebrow) reviewModalEyebrow.textContent = approve ? "Approve payment" : "Reject payment";
    if (reviewModalTitle) reviewModalTitle.textContent = approve ? "Confirm approval" : "Confirm rejection";
    reviewModal.classList.toggle("review-modal--reject", !approve);
    if (reviewModalDesc) {
      reviewModalDesc.textContent = approve
        ? "This will mark the payment as approved and sync the contact to the main enrolment segment."
        : "Reject only when transfer cannot be verified in your bank app.";
    }
    if (reviewModalWarning) reviewModalWarning.hidden = approve;
    if (reviewNoteLabel) reviewNoteLabel.textContent = approve ? "Optional approval note" : "Rejection reason";
    if (reviewModalConfirmBtn) {
      reviewModalConfirmBtn.textContent = approve ? "Approve payment" : "Reject payment";
      reviewModalConfirmBtn.classList.toggle("review-confirm-reject", !approve);
    }
    if (reviewNoteInput) {
      reviewNoteInput.value = "";
      reviewNoteInput.placeholder = approve
        ? "Add context for your records (optional)"
        : "State why this payment is being rejected";
    }
    if (reviewModalError) reviewModalError.textContent = "";
    reviewModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (reviewNoteInput) reviewNoteInput.focus();
  }

  function closeReviewModal() {
    pendingReviewAction = null;
    if (!reviewModal) return;
    reviewModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (reviewModalError) reviewModalError.textContent = "";
    if (reviewNoteInput) reviewNoteInput.value = "";
    if (reviewModalConfirmBtn) reviewModalConfirmBtn.classList.remove("review-confirm-reject");
    if (reviewModalWarning) reviewModalWarning.hidden = true;
    reviewModal.classList.remove("review-modal--reject");
  }

  function openAddStudentModal() {
    if (!addStudentModal) return;
    if (addStudentError) {
      addStudentError.textContent = "";
      addStudentError.classList.add("hidden");
    }
    addStudentModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (addStudentForm && addStudentForm.firstName) addStudentForm.firstName.focus();
  }

  function closeAddStudentModal() {
    if (!addStudentModal) return;
    addStudentModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (addStudentError) {
      addStudentError.textContent = "";
      addStudentError.classList.add("hidden");
    }
    if (addStudentForm) addStudentForm.reset();
  }

  function openCreateBatchModal() {
    if (!createBatchModal) return;
    if (createBatchError) {
      createBatchError.textContent = "";
      createBatchError.classList.add("hidden");
    }
    createBatchModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (createBatchForm) {
      const defaults = COURSE_DEFAULTS[selectedCourseSlug()] || COURSE_DEFAULTS["prompt-to-profit"];
      if (createBatchForm.paystackReferencePrefix) createBatchForm.paystackReferencePrefix.value = defaults.prefix;
      if (createBatchForm.paystackAmountMinor) {
        createBatchForm.paystackAmountMinor.value = String(defaults.amountMinor);
      }
      if (createBatchForm.paypalAmountMinor) {
        createBatchForm.paypalAmountMinor.value = String(defaults.paypalAmountMinor);
      }
    }
    if (createBatchForm && createBatchForm.batchLabel) createBatchForm.batchLabel.focus();
  }

  function closeCreateBatchModal() {
    if (!createBatchModal) return;
    createBatchModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (createBatchError) {
      createBatchError.textContent = "";
      createBatchError.classList.add("hidden");
    }
    if (createBatchForm) createBatchForm.reset();
  }

  function openEditBatchModal() {
    if (!editBatchModal || !editBatchForm) return;
    if (editBatchError) {
      editBatchError.textContent = "";
      editBatchError.classList.add("hidden");
    }
    const batchKey = String((activateBatchSelect && activateBatchSelect.value) || "").trim();
    const selected = batchByKey(batchKey);
    if (!selected) {
      setMessage("Select a batch first.", "error");
      return;
    }
    if (editBatchForm.batchKey) editBatchForm.batchKey.value = String(selected.batchKey || "");
    if (editBatchForm.batchLabel) editBatchForm.batchLabel.value = String(selected.batchLabel || "");
    if (editBatchForm.paystackReferencePrefix) {
      editBatchForm.paystackReferencePrefix.value = String(selected.paystackReferencePrefix || "");
    }
    if (editBatchForm.paystackAmountMinor) {
      editBatchForm.paystackAmountMinor.value = String(Number(selected.paystackAmountMinor || 0) || "");
    }
    if (editBatchForm.paypalAmountMinor) {
      editBatchForm.paypalAmountMinor.value = String(Number(selected.paypalAmountMinor || 0) || "");
    }
    if (editBatchForm.batchStartAt) {
      editBatchForm.batchStartAt.value = toDatetimeLocalValue(selected.batchStartAt || "");
    }
    editBatchModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (editBatchForm.batchLabel) editBatchForm.batchLabel.focus();
  }

  function closeEditBatchModal() {
    if (!editBatchModal) return;
    editBatchModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (editBatchError) {
      editBatchError.textContent = "";
      editBatchError.classList.add("hidden");
    }
    if (editBatchForm) editBatchForm.reset();
  }

  function normalizeBatchStartText(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?/);
    if (!m) return "";
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  }

  function fmtBatchStart(value) {
    return normalizeBatchStartText(value) || "-";
  }

  function fmtDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }

  function toDatetimeLocalValue(value) {
    return normalizeBatchStartText(value);
  }

  function batchByKey(batchKey) {
    const key = String(batchKey || "").trim();
    if (!key) return null;
    return (latestBatches || []).find(function (item) {
      return String(item.batchKey || "").trim() === key;
    }) || null;
  }

  function syncBatchStartInputFromSelection() {
    if (!batchStartInput || !activateBatchSelect) return;
    const selected = batchByKey(activateBatchSelect.value);
    batchStartInput.value = selected ? toDatetimeLocalValue(selected.batchStartAt) : "";
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

  async function getUploadSignature() {
    const res = await fetch("/.netlify/functions/upload-signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "manual_payment" }),
    });
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not prepare proof upload");
    }
    return json;
  }

  async function uploadProofToCloudinary(file) {
    const uploadConfig = await getUploadSignature();
    const fd = new FormData();
    fd.append("file", file);
    fd.append("api_key", uploadConfig.apiKey);
    fd.append("timestamp", String(uploadConfig.timestamp));
    fd.append("folder", uploadConfig.folder);
    fd.append("signature", uploadConfig.signature);

    const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(uploadConfig.cloudName)}/auto/upload`;
    const res = await fetch(endpoint, { method: "POST", body: fd });
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.secure_url) {
      const msg = (json && json.error && json.error.message) || "Could not upload proof";
      throw new Error(msg);
    }
    return {
      proofUrl: String(json.secure_url || ""),
      proofPublicId: String(json.public_id || ""),
    };
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
    const source = String(item.source || "").toLowerCase();
    const providerLabel = String(item.provider_label || "").trim() || "Manual";
    const canReview = status === "pending_verification" && source === "manual";
    const payer = `${escapeHtml(item.first_name || "")}<br /><small>${escapeHtml(item.email || "")}</small>`;
    const amount = fmtMoney(item.amount_minor, item.currency);

    return `
      <tr data-payment-uuid="${escapeHtml(item.payment_uuid)}">
        <td>${escapeHtml(fmtDate(item.created_at))}</td>
        <td>${payer}</td>
        <td>${escapeHtml(item.course_slug || "")}</td>
        <td>${escapeHtml(item.batch_label || "-")}</td>
        <td><span class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">${escapeHtml(providerLabel)}</span></td>
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

  function renderBatchOptions(summary) {
    if (!batchFilter || !summary) return;
    const current = selectedBatchKey() || String(summary.batchKey || "");
    const batches = Array.isArray(summary.availableBatches) ? summary.availableBatches : latestBatches;
    const options = ['<option value="all">All batches</option>'];
    batches.forEach(function (item) {
      const key = String(item.batchKey || "").trim();
      if (!key) return;
      const label = String(item.batchLabel || key).trim();
      const selected = key === current ? " selected" : "";
      options.push(`<option value="${escapeHtml(key)}"${selected}>${escapeHtml(label)}</option>`);
    });
    batchFilter.innerHTML = options.join("");
    if (current) batchFilter.value = current;

    if (addStudentBatch) {
      addStudentBatch.innerHTML = options.filter(function (item) {
        return item.indexOf('value="all"') === -1;
      }).join("");
      const addBatchCurrent = current && current !== "all" ? current : "";
      if (addBatchCurrent) addStudentBatch.value = addBatchCurrent;
    }

    if (activateBatchSelect) {
      const activeOptions = batches
        .map(function (item) {
          const key = String(item.batchKey || "").trim();
          const label = String(item.batchLabel || key).trim();
          if (!key) return "";
          const selected = item.isActive ? " selected" : "";
          return `<option value="${escapeHtml(key)}"${selected}>${escapeHtml(label)}</option>`;
        })
        .filter(Boolean)
        .join("");
      activateBatchSelect.innerHTML = activeOptions;
      syncBatchStartInputFromSelection();
    }

    const activeBatch = (batches || []).find(function (item) {
      return !!item.isActive;
    });
    if (activeBatchText) {
      if (activeBatch) {
        const startLabel = fmtBatchStart(activeBatch.batchStartAt);
        activeBatchText.textContent = startLabel && startLabel !== "-"
          ? `Active batch: ${activeBatch.batchLabel} (Starts: ${startLabel})`
          : `Active batch: ${activeBatch.batchLabel}`;
      } else {
        activeBatchText.textContent = "Active batch: --";
      }
    }
  }

  async function loadCourseBatches() {
    const res = await fetch(`/.netlify/functions/admin-course-batches-list?course_slug=${encodeURIComponent(selectedCourseSlug())}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load batches");
    }
    latestBatches = Array.isArray(json.batches) ? json.batches : [];
    return latestBatches;
  }

  function formatSummaryCurrency(currency, totalMinor) {
    const code = String(currency || "").toUpperCase();
    if (!code) return "";
    return fmtMoney(totalMinor, code);
  }

  function renderSummary(summary) {
    if (!summary) return;

    if (courseFilter && summary.courseSlug) {
      courseFilter.value = String(summary.courseSlug).trim() || selectedCourseSlug();
    }

    const courseName = String(summary.courseName || "Prompt to Profit").trim();
    const batchLabel = String(summary.batchLabel || "Batch 1").trim();
    const registrationStatus = String(summary.registrationStatus || "Closed").trim();
    const totalStudents = Number(summary.totalStudents || 0);
    const totalRegistrations = Number(summary.totalRegistrations || 0);
    const paidApprovedCount = Number(summary.paidApprovedCount || totalStudents);
    const manualPendingCount = Number(summary.manualPendingCount || 0);

    const totalsByCurrency = summary.totalsByCurrency && typeof summary.totalsByCurrency === "object"
      ? summary.totalsByCurrency
      : {};
    const totalTokens = Object.keys(totalsByCurrency)
      .sort()
      .map(function (currency) {
        return formatSummaryCurrency(currency, totalsByCurrency[currency]);
      })
      .filter(Boolean);
    const totalAmount = totalTokens.length ? totalTokens.join(" + ") : "--";

    const providerCounts = summary.providerCounts && typeof summary.providerCounts === "object"
      ? summary.providerCounts
      : {};
    const manualCount = Number(providerCounts.manual || 0);
    const paystackCount = Number(providerCounts.paystack || 0);
    const paypalCount = Number(providerCounts.paypal || 0);

    if (summaryTitleEl) summaryTitleEl.textContent = `${courseName} - ${batchLabel}`;
    if (summaryStatusEl) summaryStatusEl.textContent = `Registration: ${registrationStatus}`;
    if (summaryPendingEl) summaryPendingEl.textContent = `Pending manual approvals: ${manualPendingCount}`;
    if (summaryCourseEl) summaryCourseEl.textContent = `${courseName} (${batchLabel})`;
    if (summaryStudentsEl) summaryStudentsEl.textContent = String(totalRegistrations || totalStudents);
    if (summaryTotalEl) summaryTotalEl.textContent = totalAmount;
    if (summarySourcesEl) {
      summarySourcesEl.textContent = `Manual: ${manualCount}, Paystack: ${paystackCount}, PayPal: ${paypalCount} | Approved/Paid: ${paidApprovedCount}`;
    }
  }

  async function loadItems(options) {
    setMessage("", "");
    const shouldReconcile = !!(options && options.reconcile);

    const status = selectedStatus();
    const batchKey = selectedBatchKey();
    const search = searchInput ? searchInput.value.trim() : "";
    const qs = new URLSearchParams({
      course_slug: selectedCourseSlug(),
      status,
      search,
      limit: "100",
      reconcile: shouldReconcile ? "1" : "0",
      batch_key: batchKey || "all",
    });

    const res = await fetch(`/.netlify/functions/admin-manual-payments-list?${qs.toString()}`, {
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
      throw new Error((json && json.error) || "Could not load manual payments");
    }

    const items = Array.isArray(json.items) ? json.items : [];
    const summaryObj = json.summary || null;
    const summaryBatches = summaryObj && Array.isArray(summaryObj.availableBatches) ? summaryObj.availableBatches : [];
    if (!latestBatches.length && summaryBatches.length) {
      latestBatches = summaryBatches;
    }
    renderSummary(summaryObj);
    renderBatchOptions(summaryObj);
    const reconcile = json.reconcile && typeof json.reconcile === "object" ? json.reconcile : null;
    if (shouldReconcile && reconcile) {
      const markedPaid = Number(reconcile.markedPaid || 0);
      const checked = Number(reconcile.checked || 0);
      if (markedPaid > 0) {
        setMessage(`Synced ${markedPaid} Paystack payment(s). Checked ${checked} record(s).`, "ok");
      } else {
        setMessage(`Reconciliation complete. No new payments found. Checked ${checked} record(s).`, "ok");
      }
    }
    if (rowsEl) {
      rowsEl.innerHTML = items.length
        ? items.map(rowMarkup).join("")
        : '<tr><td colspan="9" class="px-6 py-10 text-center text-sm text-gray-500">No records found.</td></tr>';
    }

    if (appCard) appCard.hidden = false;
    setAuthMode(false);
  }

  async function handleReview(paymentUuid, action, note) {
    const safeNote = String(note || "").trim().slice(0, 500);

    const res = await fetch("/.netlify/functions/admin-manual-payments-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentUuid, action, reviewNote: safeNote }),
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

    await loadItems({ reconcile: false });
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
      loadItems({ reconcile: false }).catch(function (error) {
        setMessage(error.message || "Could not refresh", "error");
      });
    });
  }

  if (reconcileBtn) {
    reconcileBtn.addEventListener("click", function () {
      reconcileBtn.disabled = true;
      const prevText = reconcileBtn.textContent;
      reconcileBtn.textContent = "Reconciling...";
      loadItems({ reconcile: true })
        .catch(function (error) {
          setMessage(error.message || "Could not reconcile payments", "error");
        })
        .finally(function () {
          reconcileBtn.disabled = false;
          reconcileBtn.textContent = prevText || "Reconcile Now";
        });
    });
  }

  if (addStudentBtn) {
    addStudentBtn.addEventListener("click", function () {
      openAddStudentModal();
    });
  }

  if (addStudentModal) {
    addStudentModal.querySelectorAll("[data-add-student-close]").forEach(function (el) {
      el.addEventListener("click", closeAddStudentModal);
    });
  }

  if (createBatchBtn) {
    createBatchBtn.addEventListener("click", function () {
      openCreateBatchModal();
    });
  }

  if (createBatchModal) {
    createBatchModal.querySelectorAll("[data-create-batch-close]").forEach(function (el) {
      el.addEventListener("click", closeCreateBatchModal);
    });
  }

  if (editBatchBtn) {
    editBatchBtn.addEventListener("click", function () {
      openEditBatchModal();
    });
  }

  if (editBatchModal) {
    editBatchModal.querySelectorAll("[data-edit-batch-close]").forEach(function (el) {
      el.addEventListener("click", closeEditBatchModal);
    });
  }

  if (createBatchForm) {
    createBatchForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (createBatchError) {
        createBatchError.textContent = "";
        createBatchError.classList.add("hidden");
      }

      const payload = {
        batchLabel: String((createBatchForm.batchLabel && createBatchForm.batchLabel.value) || "").trim(),
        batchKey: String((createBatchForm.batchKey && createBatchForm.batchKey.value) || "").trim(),
        paystackReferencePrefix: String(
          (createBatchForm.paystackReferencePrefix && createBatchForm.paystackReferencePrefix.value) || ""
        ).trim(),
        paystackAmountMinor: Number(
          String((createBatchForm.paystackAmountMinor && createBatchForm.paystackAmountMinor.value) || "").trim()
        ),
        paypalAmountMinor: Number(
          String((createBatchForm.paypalAmountMinor && createBatchForm.paypalAmountMinor.value) || "").trim()
        ),
        batchStartAt:
          normalizeBatchStartText(String((createBatchForm.batchStartAt && createBatchForm.batchStartAt.value) || "").trim()) ||
          null,
      };
      if (!payload.batchLabel) {
        if (createBatchError) {
          createBatchError.textContent = "Batch label is required.";
          createBatchError.classList.remove("hidden");
        }
        return;
      }
      if (!Number.isFinite(payload.paystackAmountMinor) || payload.paystackAmountMinor <= 0) {
        if (createBatchError) {
          createBatchError.textContent = "Enter a valid Paystack amount in minor units.";
          createBatchError.classList.remove("hidden");
        }
        return;
      }
      if (!Number.isFinite(payload.paypalAmountMinor) || payload.paypalAmountMinor <= 0) {
        if (createBatchError) {
          createBatchError.textContent = "Enter a valid PayPal amount in minor units.";
          createBatchError.classList.remove("hidden");
        }
        return;
      }

      if (createBatchSubmitBtn) {
        createBatchSubmitBtn.disabled = true;
        createBatchSubmitBtn.textContent = "Creating...";
      }
      try {
        const res = await fetch("/.netlify/functions/admin-course-batches-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.assign({}, payload, { courseSlug: selectedCourseSlug() })),
        });
        const json = await res.json().catch(function () {
          return null;
        });
        if (!res.ok || !json || !json.ok) {
          throw new Error((json && json.error) || "Could not create batch");
        }
        closeCreateBatchModal();
        await loadCourseBatches();
        await loadItems({ reconcile: false });
        setMessage("Batch created successfully. Activate it when ready.", "ok");
      } catch (error) {
        if (createBatchError) {
          createBatchError.textContent = error.message || "Could not create batch";
          createBatchError.classList.remove("hidden");
        }
      } finally {
        if (createBatchSubmitBtn) {
          createBatchSubmitBtn.disabled = false;
          createBatchSubmitBtn.textContent = "Create Batch";
        }
      }
    });
  }

  if (editBatchForm) {
    editBatchForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (editBatchError) {
        editBatchError.textContent = "";
        editBatchError.classList.add("hidden");
      }
      const payload = {
        batchKey: String((editBatchForm.batchKey && editBatchForm.batchKey.value) || "").trim(),
        batchLabel: String((editBatchForm.batchLabel && editBatchForm.batchLabel.value) || "").trim(),
        paystackReferencePrefix: String(
          (editBatchForm.paystackReferencePrefix && editBatchForm.paystackReferencePrefix.value) || ""
        ).trim(),
        paystackAmountMinor: Number(
          String((editBatchForm.paystackAmountMinor && editBatchForm.paystackAmountMinor.value) || "").trim()
        ),
        paypalAmountMinor: Number(
          String((editBatchForm.paypalAmountMinor && editBatchForm.paypalAmountMinor.value) || "").trim()
        ),
        batchStartAt:
          normalizeBatchStartText(String((editBatchForm.batchStartAt && editBatchForm.batchStartAt.value) || "").trim()) ||
          null,
      };
      if (!payload.batchKey || !payload.batchLabel) {
        if (editBatchError) {
          editBatchError.textContent = "Batch key and label are required.";
          editBatchError.classList.remove("hidden");
        }
        return;
      }
      if (!Number.isFinite(payload.paystackAmountMinor) || payload.paystackAmountMinor <= 0) {
        if (editBatchError) {
          editBatchError.textContent = "Enter a valid amount in minor units.";
          editBatchError.classList.remove("hidden");
        }
        return;
      }
      if (!Number.isFinite(payload.paypalAmountMinor) || payload.paypalAmountMinor <= 0) {
        if (editBatchError) {
          editBatchError.textContent = "Enter a valid PayPal amount in minor units.";
          editBatchError.classList.remove("hidden");
        }
        return;
      }
      if (editBatchSubmitBtn) {
        editBatchSubmitBtn.disabled = true;
        editBatchSubmitBtn.textContent = "Saving...";
      }
      try {
        const res = await fetch("/.netlify/functions/admin-course-batches-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.assign({}, payload, { courseSlug: selectedCourseSlug() })),
        });
        const json = await res.json().catch(function () {
          return null;
        });
        if (!res.ok || !json || !json.ok) {
          throw new Error((json && json.error) || "Could not update batch");
        }
        closeEditBatchModal();
        await loadCourseBatches();
        await loadItems({ reconcile: false });
        setMessage("Batch updated successfully.", "ok");
      } catch (error) {
        if (editBatchError) {
          editBatchError.textContent = error.message || "Could not update batch";
          editBatchError.classList.remove("hidden");
        }
      } finally {
        if (editBatchSubmitBtn) {
          editBatchSubmitBtn.disabled = false;
          editBatchSubmitBtn.textContent = "Save Changes";
        }
      }
    });
  }

  if (activateBatchBtn) {
    activateBatchBtn.addEventListener("click", async function () {
      const batchKey = String((activateBatchSelect && activateBatchSelect.value) || "").trim();
      const batchStartAt =
        normalizeBatchStartText(String((batchStartInput && batchStartInput.value) || "").trim()) || null;
      if (!batchKey) {
        setMessage("Select a batch to activate.", "error");
        return;
      }
      activateBatchBtn.disabled = true;
      const prevText = activateBatchBtn.textContent;
      activateBatchBtn.textContent = "Activating...";
      try {
        const res = await fetch("/.netlify/functions/admin-course-batches-activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseSlug: selectedCourseSlug(), batchKey, batchStartAt }),
        });
        const json = await res.json().catch(function () {
          return null;
        });
        if (!res.ok || !json || !json.ok) {
          throw new Error((json && json.error) || "Could not activate batch");
        }
        await loadCourseBatches();
        await loadItems({ reconcile: false });
        setMessage("Batch activated successfully.", "ok");
      } catch (error) {
        setMessage(error.message || "Could not activate batch", "error");
      } finally {
        activateBatchBtn.disabled = false;
        activateBatchBtn.textContent = prevText || "Activate Batch";
      }
    });
  }

  if (activateBatchSelect) {
    activateBatchSelect.addEventListener("change", function () {
      syncBatchStartInputFromSelection();
    });
  }

  if (addStudentForm) {
    addStudentForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (addStudentError) {
        addStudentError.textContent = "";
        addStudentError.classList.add("hidden");
      }

      const payload = {
        firstName: String((addStudentForm.firstName && addStudentForm.firstName.value) || "").trim(),
        email: String((addStudentForm.email && addStudentForm.email.value) || "").trim(),
        country: String((addStudentForm.country && addStudentForm.country.value) || "").trim(),
        batchKey: String((addStudentForm.batchKey && addStudentForm.batchKey.value) || "").trim(),
        adminNote: String((addStudentForm.adminNote && addStudentForm.adminNote.value) || "").trim(),
        proofUrl: "",
        proofPublicId: "",
      };

      if (!payload.firstName || !payload.email) {
        if (addStudentError) {
          addStudentError.textContent = "Full Name and email are required.";
          addStudentError.classList.remove("hidden");
        }
        return;
      }

      if (addStudentSubmitBtn) {
        addStudentSubmitBtn.disabled = true;
        addStudentSubmitBtn.textContent = "Adding...";
      }
      try {
        const proofFile = addStudentProofFile && addStudentProofFile.files ? addStudentProofFile.files[0] : null;
        if (proofFile) {
          if (addStudentSubmitBtn) addStudentSubmitBtn.textContent = "Uploading proof...";
          const uploaded = await uploadProofToCloudinary(proofFile);
          payload.proofUrl = uploaded.proofUrl;
          payload.proofPublicId = uploaded.proofPublicId;
        }
        const res = await fetch("/.netlify/functions/admin-payments-add-student", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.assign({}, payload, { courseSlug: selectedCourseSlug() })),
        });
        const json = await res.json().catch(function () {
          return null;
        });
        if (!res.ok || !json || !json.ok) {
          throw new Error((json && json.error) || "Could not add student");
        }

        closeAddStudentModal();
        setMessage("Student payment added successfully.", "ok");
        await loadItems({ reconcile: false });
      } catch (error) {
        if (addStudentError) {
          addStudentError.textContent = error.message || "Could not add student";
          addStudentError.classList.remove("hidden");
        }
      } finally {
        if (addStudentSubmitBtn) {
          addStudentSubmitBtn.disabled = false;
          addStudentSubmitBtn.textContent = "Add Student";
        }
      }
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener("click", function (event) {
      const btn = event.target.closest(".status-filter__btn");
      if (!btn || !statusFilter.contains(btn)) return;

      statusFilter.querySelectorAll(".status-filter__btn").forEach(function (item) {
        item.classList.toggle("is-active", item === btn);
      });

      loadItems({ reconcile: false }).catch(function (error) {
        setMessage(error.message || "Could not filter", "error");
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        loadItems({ reconcile: false }).catch(function (error) {
          setMessage(error.message || "Could not search", "error");
        });
      }, 280);
    });
  }

  if (batchFilter) {
    batchFilter.addEventListener("change", function () {
      loadItems({ reconcile: false }).catch(function (error) {
        setMessage(error.message || "Could not filter by batch", "error");
      });
    });
  }

  if (courseFilter) {
    courseFilter.addEventListener("change", function () {
      if (batchFilter) batchFilter.value = "all";
      loadCourseBatches()
        .then(function () {
          return loadItems({ reconcile: false });
        })
        .catch(function (error) {
          setMessage(error.message || "Could not filter by course", "error");
        });
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
      openReviewModal({ paymentUuid, action });
    });
  }

  if (reviewModal) {
    reviewModal.querySelectorAll("[data-review-close]").forEach(function (el) {
      el.addEventListener("click", closeReviewModal);
    });
  }

  if (reviewModalConfirmBtn) {
    reviewModalConfirmBtn.addEventListener("click", function () {
      if (!pendingReviewAction || !pendingReviewAction.paymentUuid || !pendingReviewAction.action) return;

      const payload = pendingReviewAction;
      const note = reviewNoteInput ? reviewNoteInput.value : "";
      reviewModalConfirmBtn.disabled = true;
      reviewModalConfirmBtn.textContent = payload.action === "approve" ? "Approving..." : "Rejecting...";

      handleReview(payload.paymentUuid, payload.action, note)
        .then(function () {
          closeReviewModal();
        })
        .catch(function (error) {
          if (reviewModalError) reviewModalError.textContent = error.message || "Could not update payment";
        })
        .finally(function () {
          reviewModalConfirmBtn.disabled = false;
          if (payload.action === "approve") {
            reviewModalConfirmBtn.textContent = "Approve payment";
          } else {
            reviewModalConfirmBtn.textContent = "Reject payment";
          }
        });
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && reviewModal && reviewModal.getAttribute("aria-hidden") === "false") {
      closeReviewModal();
    }
    if (event.key === "Escape" && addStudentModal && addStudentModal.getAttribute("aria-hidden") === "false") {
      closeAddStudentModal();
    }
    if (event.key === "Escape" && createBatchModal && createBatchModal.getAttribute("aria-hidden") === "false") {
      closeCreateBatchModal();
    }
    if (event.key === "Escape" && editBatchModal && editBatchModal.getAttribute("aria-hidden") === "false") {
      closeEditBatchModal();
    }
  });

  bootAppShell();
  Promise.all([loadCourseBatches().catch(function () { return []; }), loadItems({ reconcile: false })]).catch(function (_error) {
    redirectToInternalSignIn();
  });
})();
