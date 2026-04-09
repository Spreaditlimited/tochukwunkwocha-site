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
  const accessCheckEmailInput = document.getElementById("adminAccessCheckEmail");
  const accessCheckBtn = document.getElementById("adminAccessCheckBtn");
  const logoutBtn = document.getElementById("adminLogoutBtn");
  const rowsEl = document.getElementById("adminRows");
  const messageEl = document.getElementById("adminMessage");
  const summaryTitleEl = document.getElementById("paymentsSummaryTitle");
  const summaryStatusEl = document.getElementById("paymentsSummaryStatus");
  const summaryPendingEl = document.getElementById("paymentsSummaryPending");
  const summaryCourseFilter = document.getElementById("paymentsSummaryCourseFilter");
  const summaryBatchFilter = document.getElementById("paymentsSummaryBatchFilter");
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
  const addStudentCourse = document.getElementById("addStudentCourse");
  const addStudentCourseDisplay = document.getElementById("addStudentCourseDisplay");
  const addStudentHasDiscount = document.getElementById("addStudentHasDiscount");
  const addStudentCouponWrap = document.getElementById("addStudentCouponWrap");
  const addStudentCouponCode = document.getElementById("addStudentCouponCode");
  const addStudentDiscountSummary = document.getElementById("addStudentDiscountSummary");
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
  let availableCourses = [];
  let availableCoupons = [];
  let addStudentBatchMetaByKey = {};
  const COURSE_DEFAULTS = {
    "prompt-to-profit": { prefix: "PTP", amountMinor: 1075000, paypalAmountMinor: 2400 },
    "prompt-to-production": { prefix: "PTPROD", amountMinor: 25000000, paypalAmountMinor: 2400 },
    "prompt-to-profit-schools": { prefix: "PTPS", amountMinor: 1075000, paypalAmountMinor: 2400 },
  };
  const FALLBACK_COURSES = [
    { slug: "prompt-to-profit", label: "Prompt To Profit" },
    { slug: "prompt-to-production", label: "Prompt To Production" },
    { slug: "prompt-to-profit-schools", label: "Prompt to Profit for Schools" },
  ];
  const COURSE_SLUG_ALIASES = {
    "prompt-to-profit-for-schools": "prompt-to-profit-schools",
    "prompt-to-profit-school": "prompt-to-profit-schools",
  };

  function canonicalCourseSlug(value) {
    const slug = String(value || "").trim().toLowerCase();
    if (!slug) return "";
    return COURSE_SLUG_ALIASES[slug] || slug;
  }

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
    const value = canonicalCourseSlug(courseFilter.value);
    return value || "prompt-to-profit";
  }

  function selectedAddStudentCourseSlug() {
    const value = canonicalCourseSlug((addStudentCourse && addStudentCourse.value) || "");
    if (!value) return selectedCourseSlug();
    if (availableCourses.some(function (item) { return item.slug === value; })) return value;
    return selectedCourseSlug();
  }

  function selectedAddStudentCourseLabel() {
    const slug = selectedAddStudentCourseSlug();
    const found = availableCourses.find(function (item) {
      return item.slug === slug;
    });
    return String((found && found.label) || slug || "Course").trim();
  }

  function hasAddStudentDiscount() {
    return String((addStudentHasDiscount && addStudentHasDiscount.value) || "no").trim().toLowerCase() === "yes";
  }

  function selectedAddStudentCouponCode() {
    return String((addStudentCouponCode && addStudentCouponCode.value) || "").trim().toUpperCase();
  }

  function selectedSummaryCourseSlug() {
    if (!summaryCourseFilter) return selectedCourseSlug();
    const value = canonicalCourseSlug(summaryCourseFilter.value);
    if (value === "all") return value;
    if (availableCourses.some(function (item) { return item.slug === value; })) return value;
    return selectedCourseSlug();
  }

  function setCourseFilterOptions(items) {
    if (!courseFilter) return;
    const current = selectedCourseSlug();
    const list = Array.isArray(items) && items.length ? items : FALLBACK_COURSES;
    courseFilter.innerHTML = list
      .map(function (item) {
        const slug = canonicalCourseSlug(item.slug);
        const label = String(item.label || slug || "Course").trim();
        if (!slug) return "";
        return '<option value="' + escapeHtml(slug) + '">' + escapeHtml(label) + "</option>";
      })
      .filter(Boolean)
      .join("");
    if (list.some(function (item) { return item.slug === current; })) {
      courseFilter.value = current;
    }
  }

  function setSummaryCourseFilterOptions(items) {
    if (!summaryCourseFilter) return;
    const current = selectedSummaryCourseSlug();
    const list = Array.isArray(items) && items.length ? items : [];
    const options = ['<option value="all">All courses</option>'].concat(
      list.map(function (item) {
        const slug = canonicalCourseSlug(item.slug);
        const label = String(item.label || slug || "Course").trim();
        if (!slug) return "";
        return '<option value="' + escapeHtml(slug) + '">' + escapeHtml(label) + "</option>";
      }).filter(Boolean)
    );
    summaryCourseFilter.innerHTML = options.join("");
    if (current === "all" || list.some(function (item) { return item.slug === current; })) {
      summaryCourseFilter.value = current;
    }
  }

  function setAddStudentCourseOptions(items) {
    if (!addStudentCourse) return;
    const current = selectedAddStudentCourseSlug();
    const list = Array.isArray(items) && items.length ? items : [];
    addStudentCourse.innerHTML = list
      .map(function (item) {
        const slug = canonicalCourseSlug(item.slug);
        const label = String(item.label || slug || "Course").trim();
        if (!slug) return "";
        return '<option value="' + escapeHtml(slug) + '">' + escapeHtml(label) + "</option>";
      })
      .filter(Boolean)
      .join("");
    if (list.some(function (item) { return item.slug === current; })) {
      addStudentCourse.value = current;
    }
  }

  function syncAddStudentCourseDisplay() {
    if (!addStudentCourseDisplay) return;
    addStudentCourseDisplay.textContent = selectedAddStudentCourseLabel();
  }

  function setAddStudentDiscountVisibility() {
    if (!addStudentCouponWrap) return;
    addStudentCouponWrap.classList.toggle("hidden", !hasAddStudentDiscount());
  }

  function couponMatchesCourse(coupon, courseSlug) {
    const scoped = String((coupon && coupon.course_slug) || "").trim().toLowerCase();
    if (!scoped) return true;
    return scoped === String(courseSlug || "").trim().toLowerCase();
  }

  function couponLabel(coupon) {
    const code = String((coupon && coupon.code) || "").trim().toUpperCase();
    const type = String((coupon && coupon.discount_type) || "").trim().toLowerCase();
    let discountText = "";
    if (type === "percent") {
      const pct = Number(coupon && coupon.percent_off);
      discountText = Number.isFinite(pct) && pct > 0 ? `${pct}% off` : "Percent discount";
    } else {
      const fixedNgn = Number(coupon && coupon.fixed_ngn_minor);
      discountText = Number.isFinite(fixedNgn) && fixedNgn > 0 ? `- ${fmtMoney(fixedNgn, "NGN")}` : "Fixed discount";
    }
    const active = Number(coupon && coupon.is_active) === 1 ? "" : " (inactive)";
    return `${code} (${discountText})${active}`;
  }

  function selectedAddStudentBatchAmountMinor() {
    const key = String((addStudentBatch && addStudentBatch.value) || "").trim();
    if (!key || !addStudentBatchMetaByKey[key]) return 0;
    return Math.max(0, Number(addStudentBatchMetaByKey[key].paystackAmountMinor || 0));
  }

  function selectedAddStudentCoupon() {
    const code = selectedAddStudentCouponCode();
    if (!code) return null;
    return availableCoupons.find(function (item) {
      return String(item.code || "").trim().toUpperCase() === code;
    }) || null;
  }

  function computeDiscountPreview(coupon, baseAmountMinor) {
    const base = Math.max(0, Number(baseAmountMinor || 0));
    if (!coupon || base <= 0) return null;
    const type = String(coupon.discount_type || "").trim().toLowerCase();
    let discountMinor = 0;
    if (type === "percent") {
      const pct = Number(coupon.percent_off || 0);
      if (!Number.isFinite(pct) || pct <= 0) return null;
      discountMinor = Math.min(base, Math.round((base * pct) / 100));
    } else {
      const fixed = Number(coupon.fixed_ngn_minor || 0);
      if (!Number.isFinite(fixed) || fixed <= 0) return null;
      discountMinor = Math.min(base, Math.round(fixed));
    }
    const finalAmountMinor = Math.max(0, base - discountMinor);
    if (discountMinor <= 0 || finalAmountMinor <= 0) return null;
    return { baseAmountMinor: base, discountMinor, finalAmountMinor };
  }

  function syncAddStudentDiscountSummary() {
    if (!addStudentDiscountSummary) return;
    if (!hasAddStudentDiscount()) {
      addStudentDiscountSummary.classList.add("hidden");
      addStudentDiscountSummary.textContent = "";
      return;
    }
    const coupon = selectedAddStudentCoupon();
    const pricing = computeDiscountPreview(coupon, selectedAddStudentBatchAmountMinor());
    if (!coupon || !pricing) {
      addStudentDiscountSummary.classList.remove("hidden");
      addStudentDiscountSummary.textContent = "Select a valid code to preview discounted amount.";
      return;
    }
    addStudentDiscountSummary.classList.remove("hidden");
    addStudentDiscountSummary.textContent =
      `Base: ${fmtMoney(pricing.baseAmountMinor, "NGN")} • Discount: -${fmtMoney(pricing.discountMinor, "NGN")} • Final: ${fmtMoney(pricing.finalAmountMinor, "NGN")}`;
  }

  function setAddStudentCouponOptions() {
    if (!addStudentCouponCode) return;
    const courseSlug = selectedAddStudentCourseSlug();
    const previous = selectedAddStudentCouponCode();
    const scoped = availableCoupons.filter(function (item) {
      return couponMatchesCourse(item, courseSlug);
    });
    const options = ['<option value="">Select discount code</option>'].concat(
      scoped.map(function (item) {
        const code = String(item.code || "").trim().toUpperCase();
        if (!code) return "";
        return '<option value="' + escapeHtml(code) + '">' + escapeHtml(couponLabel(item)) + "</option>";
      }).filter(Boolean)
    );
    addStudentCouponCode.innerHTML = options.join("");
    if (previous && scoped.some(function (item) { return String(item.code || "").trim().toUpperCase() === previous; })) {
      addStudentCouponCode.value = previous;
    }
    syncAddStudentDiscountSummary();
  }

  async function loadAvailableCourses() {
    const res = await fetch("/.netlify/functions/admin-course-slugs-list", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load course list");
    }
    const items = Array.isArray(json.items) ? json.items : [];
    const merged = new Map();
    items.forEach(function (item) {
      const slug = canonicalCourseSlug(item && item.slug);
      const label = String((item && item.label) || slug || "").trim();
      if (!slug) return;
      if (!merged.has(slug)) {
        merged.set(slug, { slug: slug, label: label || slug });
      }
    });
    availableCourses = Array.from(merged.values()).map(function (item) {
      return {
        slug: canonicalCourseSlug(item.slug),
        label: String(item.label || item.slug || "").trim(),
      };
    }).filter(function (item) {
      return !!item.slug;
    });
    if (!availableCourses.length) availableCourses = FALLBACK_COURSES.slice();
    setCourseFilterOptions(availableCourses);
    setSummaryCourseFilterOptions(availableCourses);
    setAddStudentCourseOptions(availableCourses);
    syncAddStudentCourseDisplay();
    return availableCourses;
  }

  async function loadAvailableCoupons() {
    const res = await fetch("/.netlify/functions/admin-coupons-list", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load discount codes");
    }
    const items = Array.isArray(json.items) ? json.items : [];
    availableCoupons = items.map(function (item) {
      return {
        code: String(item.code || "").trim().toUpperCase(),
        course_slug: String(item.course_slug || "").trim().toLowerCase(),
        discount_type: String(item.discount_type || "").trim().toLowerCase(),
        percent_off: item.percent_off !== null && item.percent_off !== undefined ? Number(item.percent_off) : null,
        fixed_ngn_minor:
          item.fixed_ngn_minor !== null && item.fixed_ngn_minor !== undefined ? Number(item.fixed_ngn_minor) : null,
        is_active: Number(item.is_active || 0),
      };
    }).filter(function (item) {
      return !!item.code;
    });
    setAddStudentCouponOptions();
    return availableCoupons;
  }

  function selectedSummaryBatchKey() {
    if (!summaryBatchFilter || summaryBatchFilter.disabled) return "all";
    const value = String(summaryBatchFilter.value || "").trim();
    return value || "all";
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
    if (text) messageEl.classList.remove("hidden");
    else messageEl.classList.add("hidden");
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
    if (addStudentCourse) addStudentCourse.value = selectedCourseSlug();
    syncAddStudentCourseDisplay();
    if (addStudentHasDiscount) addStudentHasDiscount.value = "no";
    if (addStudentCouponCode) addStudentCouponCode.value = "";
    setAddStudentDiscountVisibility();
    setAddStudentCouponOptions();
    loadAddStudentBatches(selectedAddStudentCourseSlug(), selectedBatchKey()).catch(function (error) {
      if (addStudentError) {
        addStudentError.textContent = error.message || "Could not load batches";
        addStudentError.classList.remove("hidden");
      }
    });
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
    setAddStudentDiscountVisibility();
    syncAddStudentDiscountSummary();
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
    if (editBatchForm.brevoListId) {
      editBatchForm.brevoListId.value = String(selected.brevoListId || "");
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

  function resolvePreferredBatchKey(batches, preferredBatchKey) {
    const list = Array.isArray(batches) ? batches : [];
    const preferred = String(preferredBatchKey || "").trim();
    if (preferred && preferred !== "all") {
      const foundPreferred = list.find(function (item) {
        return String(item.batchKey || "").trim() === preferred;
      });
      if (foundPreferred) return preferred;
    }
    const active = list.find(function (item) {
      return !!item.isActive && String(item.batchKey || "").trim();
    });
    if (active) return String(active.batchKey || "").trim();
    const first = list.find(function (item) {
      return String(item.batchKey || "").trim();
    });
    return first ? String(first.batchKey || "").trim() : "";
  }

  async function loadCourseBatches(courseSlug) {
    const slug = canonicalCourseSlug(courseSlug || selectedCourseSlug()) || selectedCourseSlug();
    const res = await fetch(`/.netlify/functions/admin-course-batches-list?course_slug=${encodeURIComponent(slug)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load batches");
    }
    const batches = Array.isArray(json.batches) ? json.batches : [];
    if (!courseSlug || slug === selectedCourseSlug()) {
      latestBatches = batches;
    }
    return batches;
  }

  async function loadAddStudentBatches(courseSlug, preferredBatchKey) {
    if (!addStudentBatch) return;
    const batches = await loadCourseBatches(courseSlug);
    addStudentBatchMetaByKey = {};
    batches.forEach(function (item) {
      const key = String(item.batchKey || "").trim();
      if (!key) return;
      addStudentBatchMetaByKey[key] = {
        paystackAmountMinor: Number(item.paystackAmountMinor || 0),
      };
    });
    const options = batches
      .map(function (item) {
        const key = String(item.batchKey || "").trim();
        const label = String(item.batchLabel || key).trim();
        if (!key) return "";
        return '<option value="' + escapeHtml(key) + '">' + escapeHtml(label) + "</option>";
      })
      .filter(Boolean);
    addStudentBatch.innerHTML = options.join("");
    const preferred = String(preferredBatchKey || "").trim();
    if (preferred) addStudentBatch.value = preferred;
    if (!addStudentBatch.value && options.length) addStudentBatch.selectedIndex = 0;
    syncAddStudentDiscountSummary();
  }

  function formatSummaryCurrency(currency, totalMinor) {
    const code = String(currency || "").toUpperCase();
    if (!code) return "";
    return fmtMoney(totalMinor, code);
  }

  function renderSummary(summary) {
    if (!summary) return;

    const courseName = String(summary.courseName || "Prompt to Profit").trim();
    const batchLabel = String(summary.batchLabel || "Batch 1").trim();
    const registrationStatus = String(summary.registrationStatus || "Closed").trim();
    const totalStudents = Number(summary.totalStudents || 0);
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
    if (summaryStudentsEl) summaryStudentsEl.textContent = String(totalStudents);
    if (summaryTotalEl) summaryTotalEl.textContent = totalAmount;
    if (summarySourcesEl) {
      summarySourcesEl.textContent = `Manual: ${manualCount}, Paystack: ${paystackCount}, PayPal: ${paypalCount} | Approved/Paid: ${paidApprovedCount}`;
    }
  }

  function renderSummaryBatchOptions(summary) {
    if (!summaryBatchFilter) return;

    const summaryCourseSlug = String((summary && summary.courseSlug) || "").trim().toLowerCase();
    const batches = summary && Array.isArray(summary.availableBatches) ? summary.availableBatches : [];
    const shouldDisable = summaryCourseSlug === "all";
    const current = selectedSummaryBatchKey();
    const fallback = String((summary && summary.batchKey) || "all").trim() || "all";

    const options = ['<option value="all">All batches</option>'];
    batches.forEach(function (item) {
      const key = String(item.batchKey || "").trim();
      if (!key) return;
      const label = String(item.batchLabel || key).trim();
      options.push(`<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`);
    });
    summaryBatchFilter.innerHTML = options.join("");
    summaryBatchFilter.disabled = shouldDisable;
    summaryBatchFilter.value = current;
    if (summaryBatchFilter.value !== current) {
      summaryBatchFilter.value = fallback;
    }
    if (summaryBatchFilter.value !== fallback && fallback !== "all") {
      summaryBatchFilter.value = "all";
    }
  }

  async function loadItems(options) {
    setMessage("", "");
    const shouldReconcile = !!(options && options.reconcile);
    const includeSummary = !options || options.includeSummary !== false;
    const redirectOnAuthError = !!(options && options.redirectOnAuthError);

    const status = selectedStatus();
    const requestedCourseSlug = canonicalCourseSlug((options && options.courseSlug) || selectedCourseSlug()) || selectedCourseSlug();
    const requestedBatchKey = String(
      (options && options.batchKey) !== undefined ? options.batchKey : selectedBatchKey()
    ).trim();
    const requestedSummaryCourseSlugRaw = String(
      (options && options.summaryCourseSlug) !== undefined ? options.summaryCourseSlug : selectedSummaryCourseSlug()
    ).trim();
    const requestedSummaryCourseSlug = requestedSummaryCourseSlugRaw === "all"
      ? "all"
      : (canonicalCourseSlug(requestedSummaryCourseSlugRaw) || requestedCourseSlug);
    const requestedSummaryBatchKey = String(
      (options && options.summaryBatchKey) !== undefined ? options.summaryBatchKey : selectedSummaryBatchKey()
    ).trim() || "all";
    const search = searchInput ? searchInput.value.trim() : "";
    const qs = new URLSearchParams({
      course_slug: requestedCourseSlug,
      summary_course_slug: requestedSummaryCourseSlug,
      summary_batch_key: requestedSummaryBatchKey,
      status,
      search,
      limit: "100",
      include_summary: includeSummary ? "1" : "0",
      reconcile: shouldReconcile ? "1" : "0",
      batch_key: requestedBatchKey || "all",
    });

    const res = await fetch(`/.netlify/functions/admin-manual-payments-list?${qs.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });

    if (res.status === 401) {
      if (redirectOnAuthError) {
        redirectToInternalSignIn();
        return;
      }
      throw new Error("Your admin session expired. Refresh this page and sign in again.");
    }

    const json = await res.json().catch(function () {
      return null;
    });

    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load manual payments");
    }

    const items = Array.isArray(json.items) ? json.items : [];
    const summaryObj = json.summary || null;
    if (summaryObj) {
      const summaryBatches = Array.isArray(summaryObj.availableBatches) ? summaryObj.availableBatches : [];
      if (!latestBatches.length && summaryBatches.length) {
        latestBatches = summaryBatches;
      }
      renderSummary(summaryObj);
      renderSummaryBatchOptions(summaryObj);
      renderBatchOptions(summaryObj);
    }
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

    await loadItems({ reconcile: false, includeSummary: false });
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

  async function runAccessCheck() {
    const email = String((accessCheckEmailInput && accessCheckEmailInput.value) || "").trim().toLowerCase();
    if (!email) {
      setMessage("Enter an email to check access.", "error");
      return;
    }
    if (!accessCheckBtn) return;

    accessCheckBtn.disabled = true;
    const prev = accessCheckBtn.textContent;
    accessCheckBtn.textContent = "Checking...";
    setMessage("Checking learning access...", "ok");

    try {
      const res = await fetch(
        "/.netlify/functions/admin-learning-access-check?course_slug=" +
          encodeURIComponent("prompt-to-profit") +
          "&email=" +
          encodeURIComponent(email),
        { method: "GET", headers: { Accept: "application/json" } }
      );
      const json = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !json || !json.ok || !json.audit) {
        throw new Error((json && json.error) || "Could not check course access");
      }
      const access = json.audit.access || {};
      if (access.allowed) {
        setMessage(
          "Access ALLOWED for " + email + " (" + String(access.reason || "allowed") + ").",
          "ok"
        );
      } else {
        const details = access.next_start_at
          ? " Starts at: " + String(access.next_start_at) + "."
          : "";
        setMessage(
          "Access BLOCKED for " +
            email +
            " (" +
            String(access.reason || "blocked") +
            "). " +
            String(access.message || "Not eligible.") +
            details,
          "error"
        );
      }
    } catch (error) {
      setMessage(error.message || "Could not check course access", "error");
    } finally {
      accessCheckBtn.disabled = false;
      accessCheckBtn.textContent = prev || "Check Course Access";
    }
  }

  if (accessCheckBtn) {
    accessCheckBtn.addEventListener("click", function () {
      runAccessCheck().catch(function (error) {
        setMessage(error.message || "Could not check course access", "error");
      });
    });
  }

  if (accessCheckEmailInput) {
    accessCheckEmailInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      runAccessCheck().catch(function (error) {
        setMessage(error.message || "Could not check course access", "error");
      });
    });
  }

  if (addStudentModal) {
    addStudentModal.querySelectorAll("[data-add-student-close]").forEach(function (el) {
      el.addEventListener("click", closeAddStudentModal);
    });
  }

  if (addStudentCourse) {
    addStudentCourse.addEventListener("change", function () {
      syncAddStudentCourseDisplay();
      setAddStudentCouponOptions();
      loadAddStudentBatches(selectedAddStudentCourseSlug(), "").catch(function (error) {
        if (addStudentError) {
          addStudentError.textContent = error.message || "Could not load batches";
          addStudentError.classList.remove("hidden");
        }
      });
    });
  }

  if (addStudentHasDiscount) {
    addStudentHasDiscount.addEventListener("change", function () {
      setAddStudentDiscountVisibility();
      syncAddStudentDiscountSummary();
    });
  }

  if (addStudentCouponCode) {
    addStudentCouponCode.addEventListener("change", function () {
      syncAddStudentDiscountSummary();
    });
  }

  if (addStudentBatch) {
    addStudentBatch.addEventListener("change", function () {
      syncAddStudentDiscountSummary();
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
        brevoListId: String((createBatchForm.brevoListId && createBatchForm.brevoListId.value) || "").trim(),
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
        brevoListId: String((editBatchForm.brevoListId && editBatchForm.brevoListId.value) || "").trim(),
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
        hasDiscount: hasAddStudentDiscount(),
        couponCode: selectedAddStudentCouponCode(),
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
      if (payload.hasDiscount && !payload.couponCode) {
        if (addStudentError) {
          addStudentError.textContent = "Select the exact discount code.";
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
          body: JSON.stringify(Object.assign({}, payload, { courseSlug: selectedAddStudentCourseSlug() })),
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
      const courseSlug = selectedCourseSlug();
      loadCourseBatches(courseSlug)
        .then(function (batches) {
          const preferredBatchKey = resolvePreferredBatchKey(batches, "");
          renderBatchOptions({
            availableBatches: batches,
            batchKey: preferredBatchKey || "all",
          });
          if (summaryCourseFilter) summaryCourseFilter.value = courseSlug;
          return loadItems({
            reconcile: false,
            courseSlug: courseSlug,
            batchKey: preferredBatchKey || "all",
            summaryCourseSlug: courseSlug,
            summaryBatchKey: preferredBatchKey || "all",
          });
        })
        .catch(function (error) {
          setMessage(error.message || "Could not refresh batches for selected course", "error");
        });
    });
  }

  if (summaryCourseFilter) {
    summaryCourseFilter.addEventListener("change", function () {
      if (summaryBatchFilter) summaryBatchFilter.value = "all";
      loadItems({ reconcile: false }).catch(function (error) {
        setMessage(error.message || "Could not refresh summary", "error");
      });
    });
  }

  if (summaryBatchFilter) {
    summaryBatchFilter.addEventListener("change", function () {
      loadItems({ reconcile: false }).catch(function (error) {
        setMessage(error.message || "Could not refresh summary", "error");
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
  Promise.all([
    loadAvailableCourses().catch(function () { return []; }),
    loadAvailableCoupons().catch(function () { return []; }),
  ])
    .then(function () {
      const courseSlug = selectedCourseSlug();
      if (summaryCourseFilter && String(summaryCourseFilter.value || "").trim().toLowerCase() === "all") {
        summaryCourseFilter.value = courseSlug;
      }
      return loadCourseBatches(courseSlug).then(function (batches) {
        const preferredBatchKey = resolvePreferredBatchKey(batches, "");
        renderBatchOptions({
          availableBatches: batches,
          batchKey: preferredBatchKey || "all",
        });
        return loadItems({
          reconcile: false,
          redirectOnAuthError: true,
          courseSlug: courseSlug,
          batchKey: preferredBatchKey || "all",
          summaryCourseSlug: selectedSummaryCourseSlug(),
          summaryBatchKey: preferredBatchKey || "all",
        });
      });
    })
    .catch(function (error) {
      if (appCard) appCard.hidden = false;
      setAuthMode(false);
      setMessage((error && error.message) || "Could not load enrollments. Please refresh.", "error");
    });
})();
