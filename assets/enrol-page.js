(function () {
  var form = document.getElementById("enrolPageForm");
  if (!form) return;

  var submitBtn = document.getElementById("enrolSubmit");
  var errorEl = document.getElementById("enrolError");
  var successEl = document.getElementById("enrolSuccess");
  var providerInput = document.getElementById("enrolProvider");
  var paymentOptions = Array.prototype.slice.call(document.querySelectorAll(".payment-option"));
  var manualTransferBlock = document.getElementById("manualTransferBlock");
  var manualBankDetails = document.getElementById("manualBankDetails");
  var manualProofFileInput = document.getElementById("manualProofFile");
  var batchEl = document.getElementById("enrolActiveBatch");
  var introEl = document.getElementById("enrolIntro");
  var paystackOptionMeta = document.getElementById("paystackOptionMeta");
  var manualOptionMeta = document.getElementById("manualOptionMeta");
  var paypalOptionMeta = document.getElementById("paypalOptionMeta");
  var paystackBreakdown = document.getElementById("paystackBreakdown");
  var breakdownCoursePrice = document.getElementById("breakdownCoursePrice");
  var breakdownVat = document.getElementById("breakdownVat");
  var breakdownPaystackFee = document.getElementById("breakdownPaystackFee");
  var breakdownTotal = document.getElementById("breakdownTotal");
  var couponCodeInput = document.getElementById("couponCodeInput");
  var applyCouponBtn = document.getElementById("applyCouponBtn");
  var couponStatusEl = document.getElementById("couponStatus");
  var couponSummaryEl = document.getElementById("couponSummary");
  var holidayBatchPickerWrap = document.getElementById("holidayBatchPickerWrap");
  var holidayBatchSelect = document.getElementById("holidayBatchSelect");
  var holidayBatchMeta = document.getElementById("holidayBatchMeta");
  var holidayWaitlistTableWrap = document.getElementById("holidayWaitlistTableWrap");
  var holidayWaitlistRows = document.getElementById("holidayWaitlistRows");

  var courseSlug = String(form.getAttribute("data-course-slug") || "prompt-to-profit").trim();
  var pageFamilyToggle = String(form.getAttribute("data-family-enrollment") || "").trim().toLowerCase();
  var familyEnrollmentEnabled = pageFamilyToggle === "true" || pageFamilyToggle === "1" || pageFamilyToggle === "yes";
  var familyMaxChildren = 500;
  var familySection = null;
  var familyEnabledInput = null;
  var familySeatCountInput = null;
  var familyChildrenWrap = null;
  var familyAddChildBtn = null;
  var activeCourseBatchKey = "";
  var activeCourseBatchStartAt = "";
  var activeCoursePricing = null;
  var holidayBatchMap = {};
  var manualConfigLoadedKey = "";
  var manualPaymentDetails = null;
  var appliedCoupon = null;
  var couponPricingByProvider = { paystack: null };
  var basePricingByProvider = { paystack: null };
  var enabledPaymentMethods = { paystack: true, manual_transfer: true };
  var enrollmentLocked = false;
  var AFFILIATE_REF_KEY = "tn_affiliate_ref_code_v1";

  var COURSE_CONFIGS = {
    "prompt-to-profit": {
      name: "Prompt to Profit",
      intro:
        "Lock in your seat today. We will set up the learning account instantly, giving you (or your child) full access to every live class and video module as soon as the bootcamp kicks off.",
    },
    "prompt-to-production": {
      name: "Prompt to Profit Advanced",
      intro:
        "Secure your seat for the next quarterly cohort. Once payment is confirmed, you will be added to the onboarding list immediately.",
    },
    "ai-for-everyday-business-owners": {
      name: "AI for Everyday Business Owners",
      intro:
        "Complete payment to enrol now. Once payment is confirmed, you will have immediate access to the course.",
    },
  };

  function courseConfig() {
    return COURSE_CONFIGS[courseSlug] || COURSE_CONFIGS["prompt-to-profit"];
  }

  function setError(text) {
    if (!errorEl) return;
    errorEl.textContent = String(text || "");
    errorEl.classList.toggle("hidden", !text);
  }

  function resolveAffiliateCode() {
    var fromQuery = "";
    try {
      var search = new URLSearchParams(window.location.search || "");
      fromQuery = String(search.get("ref") || search.get("affiliate") || "").trim().toUpperCase();
    } catch (_error) {
      fromQuery = "";
    }
    if (fromQuery) {
      try { window.localStorage.setItem(AFFILIATE_REF_KEY, fromQuery); } catch (_error) {}
      return fromQuery;
    }
    try {
      return String(window.localStorage.getItem(AFFILIATE_REF_KEY) || "").trim().toUpperCase();
    } catch (_error) {
      return "";
    }
  }

  function setSuccess(text) {
    if (!successEl) return;
    successEl.textContent = String(text || "");
    successEl.classList.toggle("hidden", !text);
  }

  function setCouponStatus(text, type) {
    if (!couponStatusEl) return;
    var msg = String(text || "").trim();
    couponStatusEl.textContent = msg;
    couponStatusEl.classList.toggle("hidden", !msg);
    couponStatusEl.classList.remove("text-red-600", "text-emerald-700", "text-gray-600");
    if (!msg) return;
    if (type === "error") {
      couponStatusEl.classList.add("text-red-600");
      return;
    }
    if (type === "ok") {
      couponStatusEl.classList.add("text-emerald-700");
      return;
    }
    couponStatusEl.classList.add("text-gray-600");
  }

  function formatNgnMinor(minor) {
    var amount = Number(minor || 0) / 100;
    if (!Number.isFinite(amount)) return "";
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);
  }

  function formatCurrencyMinor(currency, minor) {
    var cur = String(currency || "").toUpperCase();
    if (cur === "NGN") return formatNgnMinor(minor);
    return formatGbpMinor(minor);
  }

  function familySeatCount() {
    if (!familyEnabledInput || !familyEnabledInput.checked) return 1;
    if (!familySeatCountInput) return 2;
    var seats = Math.round(Number(familySeatCountInput.value || 2));
    return Math.max(2, Math.min(familyMaxChildren, Number.isFinite(seats) ? seats : 2));
  }

  function familyChildren() {
    if (!familyChildrenWrap || !familyEnabledInput || !familyEnabledInput.checked) return [];
    return Array.prototype.slice.call(familyChildrenWrap.querySelectorAll("[data-family-child-row]")).map(function (row) {
      return {
        fullName: String((row.querySelector("[data-family-child-name]") || {}).value || "").trim(),
        age: String((row.querySelector("[data-family-child-age]") || {}).value || "").trim(),
        classLevel: String((row.querySelector("[data-family-child-class]") || {}).value || "").trim(),
      };
    }).filter(function (item) {
      return !!item.fullName;
    });
  }

  function pricingForSeats(pricing) {
    if (!pricing) return null;
    var seats = familySeatCount();
    return Object.assign({}, pricing, {
      baseAmountMinor: Number(pricing.baseAmountMinor || 0) * seats,
      discountMinor: Number(pricing.discountMinor || 0) * seats,
      finalAmountMinor: Number(pricing.finalAmountMinor || 0) * seats,
    });
  }

  function currentPaystackPricing() {
    return couponPricingByProvider.paystack || pricingForSeats(basePricingByProvider.paystack);
  }

  function renderFamilyPaymentSummary() {
    var summaryEl = document.getElementById("familyPaymentSummary");
    if (!summaryEl) return;
    if (!familyEnabledInput || !familyEnabledInput.checked) {
      summaryEl.textContent = "Turn this on to enrol siblings under one parent account.";
      return;
    }
    var seats = familySeatCount();
    var provider = providerInput ? providerInput.value : "paystack";
    if (provider === "manual_transfer" && manualPaymentDetails && Number.isFinite(Number(manualPaymentDetails.amountMinor))) {
      summaryEl.textContent = String(seats) + " seat" + (seats === 1 ? "" : "s") + " selected • Total (Direct Bank Transfer): " + formatCurrencyMinor("NGN", Number(manualPaymentDetails.amountMinor || 0));
      return;
    }
    var pricing = currentPaystackPricing();
    if (!pricing || !Number.isFinite(Number(pricing.finalAmountMinor))) {
      summaryEl.textContent = String(seats) + " seat" + (seats === 1 ? "" : "s") + " selected. Total updates when pricing loads.";
      return;
    }
    var breakdown = paystackBreakdownForTotal(pricing.finalAmountMinor, pricing.currency || "NGN");
    var totalMinor = breakdown ? breakdown.totalMinor : pricing.finalAmountMinor;
    summaryEl.textContent = String(seats) + " seat" + (seats === 1 ? "" : "s") + " selected • Total (Paystack): " + formatCurrencyMinor("NGN", totalMinor);
  }

  function clearCouponForSeatChange() {
    if (!appliedCoupon) return;
    appliedCoupon = null;
    couponPricingByProvider = { paystack: null };
    renderCouponSummary();
    setCouponStatus("Coupon removed because the number of children changed.", "info");
  }

  function renderCouponSummary() {
    if (!couponSummaryEl) return;
    var provider = providerInput ? providerInput.value : "paystack";
    var pricing = null;
    if (provider === "manual_transfer") {
      pricing = currentPaystackPricing();
    } else {
      pricing = currentPaystackPricing();
    }
    if (!appliedCoupon || !pricing) {
      couponSummaryEl.classList.add("hidden");
      couponSummaryEl.textContent = "";
      return;
    }
    var currency = String(pricing.currency || "").toUpperCase();
    var baseText = formatCurrencyMinor(currency, pricing.baseAmountMinor);
    var discountText = formatCurrencyMinor(currency, pricing.discountMinor);
    var finalText = formatCurrencyMinor(currency, pricing.finalAmountMinor);
    couponSummaryEl.textContent = "Original: " + baseText + " • Discount: -" + discountText + " • New total: " + finalText;
    couponSummaryEl.classList.remove("hidden");
  }

  function paystackBreakdownForTotal(totalMinor, currency) {
    var cur = String(currency || "NGN").toUpperCase();
    var total = Math.max(0, Number(totalMinor || 0));
    if (cur !== "NGN") {
      return {
        courseMinor: total,
        vatMinor: 0,
        paystackFeeMinor: 0,
        totalMinor: total,
        currency: cur,
      };
    }
    var configuredCourseMinor = Number(activeCoursePricing && activeCoursePricing.priceNgnMinor || 0) * familySeatCount();
    var vatPercent = Number(activeCoursePricing && activeCoursePricing.vatPercent || 7.5);
    var safeVatPercent = Number.isFinite(vatPercent) && vatPercent >= 0 ? vatPercent : 7.5;
    var courseMinor = configuredCourseMinor > 0 ? Math.round(configuredCourseMinor) : 0;
    var vatMinor = Math.round((courseMinor * safeVatPercent) / 100);
    var targetMinor = courseMinor + vatMinor;

    function paystackFeeOnFinal(finalMinor) {
      var safeFinal = Math.max(0, Number(finalMinor || 0));
      var pctMinor = Math.round(safeFinal * 0.015);
      var fixedMinor = safeFinal < 250000 ? 0 : 10000;
      var feeMinor = pctMinor + fixedMinor;
      return Math.min(feeMinor, 200000);
    }

    // Paystack pass-fee formula (NGN): when uncapped -> ((Price + Flat)/(1 - Decimal Fee)) + 0.01
    var applicableAtPrice = Math.round(targetMinor * 0.015) + (targetMinor < 250000 ? 0 : 10000);
    var computedTotalMinor = applicableAtPrice > 200000
      ? (targetMinor + 200000)
      : Math.ceil(((targetMinor + (targetMinor < 250000 ? 0 : 10000)) / (1 - 0.015)) + 1);
    var paystackFeeMinor = paystackFeeOnFinal(computedTotalMinor);

    if (courseMinor <= 0) {
      var fallbackVatRate = 0.075;
      vatMinor = Math.round((total * fallbackVatRate) / (1 + fallbackVatRate));
      courseMinor = Math.max(0, total - vatMinor);
      computedTotalMinor = total;
      paystackFeeMinor = paystackFeeOnFinal(total);
    }
    return {
      courseMinor: courseMinor,
      vatMinor: vatMinor,
      paystackFeeMinor: paystackFeeMinor,
      totalMinor: courseMinor > 0 ? computedTotalMinor : total,
      currency: "NGN",
    };
  }

  function renderPaystackBreakdown() {
    if (!paystackBreakdown) return;
    var provider = providerInput ? providerInput.value : "paystack";
    if (provider !== "paystack") {
      paystackBreakdown.classList.add("hidden");
      return;
    }
    var pricing = currentPaystackPricing();
    if (!pricing || !Number.isFinite(Number(pricing.finalAmountMinor))) {
      paystackBreakdown.classList.add("hidden");
      return;
    }
    var breakdown = paystackBreakdownForTotal(pricing.finalAmountMinor, pricing.currency || "NGN");
    if (breakdownCoursePrice) breakdownCoursePrice.textContent = formatCurrencyMinor(breakdown.currency, breakdown.courseMinor);
    if (breakdownVat) breakdownVat.textContent = formatCurrencyMinor(breakdown.currency, breakdown.vatMinor);
    if (breakdownPaystackFee) breakdownPaystackFee.textContent = formatCurrencyMinor(breakdown.currency, breakdown.paystackFeeMinor);
    if (breakdownTotal) breakdownTotal.textContent = formatCurrencyMinor(breakdown.currency, breakdown.totalMinor);
    paystackBreakdown.hidden = false;
    paystackBreakdown.classList.remove("hidden");
  }

  function clearAppliedCoupon(message) {
    appliedCoupon = null;
    couponPricingByProvider = { paystack: null };
    renderCouponSummary();
    updatePaymentOptionMetas();
    renderPaystackBreakdown();
    if (message) setCouponStatus(message, "info");
    if (providerInput && providerInput.value === "manual_transfer") {
      ensureManualConfigLoaded().catch(function () { return null; });
    }
  }

  function refreshPaymentCalculations() {
    updatePaymentOptionMetas();
    ensureManualConfigLoaded()
      .then(function () { renderFamilyPaymentSummary(); })
      .catch(function () { return null; });
  }

  function updatePaymentOptionMetas() {
    var paystackPricing = currentPaystackPricing();
    var paystackOption = findOption("paystack");
    if (paystackOptionMeta && !isOptionDisabled(paystackOption)) {
      var paystackBreakdown = paystackPricing ? paystackBreakdownForTotal(paystackPricing.finalAmountMinor, paystackPricing.currency || "NGN") : null;
      paystackOptionMeta.textContent = paystackPricing
        ? "Pay in full (" + formatCurrencyMinor("NGN", paystackBreakdown ? paystackBreakdown.totalMinor : paystackPricing.finalAmountMinor) + ")"
        : "Pay in full";
    }
    if (paypalOptionMeta) paypalOptionMeta.textContent = "Unavailable";
    renderPaystackBreakdown();
    renderFamilyPaymentSummary();
  }

  function parseBatchStart(value) {
    var raw = String(value || "").trim();
    if (!raw) return null;
    var m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) - 1, Number(m[5]), Number(m[6] || "0")));
    var d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  function formatDayTime(date, timeZone) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }

  function compareBatchStart(a, b) {
    var ad = parseBatchStart(a && a.batchStartAt);
    var bd = parseBatchStart(b && b.batchStartAt);
    var at = ad ? ad.getTime() : Number.POSITIVE_INFINITY;
    var bt = bd ? bd.getTime() : Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    return String((a && a.batchKey) || "").localeCompare(String((b && b.batchKey) || ""));
  }

  function displayBatchLabel(_item, index) {
    return "Batch " + String(index + 1);
  }

  function formatGbpMinor(minor) {
    var amount = Number(minor || 0) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return "";
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
  }

  function launchScheduleText() {
    var startDate = parseBatchStart(activeCourseBatchStartAt);
    if (!startDate) return "";
    return "Classes begin " + formatDayTime(startDate, "Africa/Lagos") + " WAT.";
  }

  function updateIntro() {
    if (!introEl) return;
    var intro = courseConfig().intro;
    var schedule = launchScheduleText();
    introEl.textContent = schedule ? intro + " " + schedule : intro;
  }

  function isHolidayMultiBatchCourse() {
    return String(courseSlug || "").trim().toLowerCase() === "prompt-to-profit-holiday";
  }

  function setElementVisible(el, visible) {
    if (!el) return;
    el.hidden = !visible;
    el.classList.toggle("hidden", !visible);
  }

  function normalizeBooleanFlag(value) {
    if (value === true) return true;
    if (value === false) return false;
    if (typeof value === "number") return value === 1;
    var text = String(value || "").trim().toLowerCase();
    if (!text) return false;
    if (text === "true" || text === "1" || text === "yes") return true;
    if (text === "false" || text === "0" || text === "no") return false;
    return false;
  }

  function normalizePositiveInt(value) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed);
  }

  function normalizeNonNegativeInt(value) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed);
  }

  function isBatchFull(item) {
    if (!item || typeof item !== "object") return false;
    var seatLimit = normalizePositiveInt(item.seatLimit);
    var remainingSeats = normalizeNonNegativeInt(item.remainingSeats);
    if (seatLimit !== null && remainingSeats !== null) {
      return remainingSeats <= 0;
    }
    return normalizeBooleanFlag(item.isFull);
  }

  function applyHolidayBatchSelection(batchKey) {
    var chosen = batchKey ? holidayBatchMap[batchKey] : null;
    activeCourseBatchKey = chosen ? String(chosen.batchKey || "") : "";
    activeCourseBatchStartAt = chosen ? String(chosen.batchStartAt || "") : "";
    var paystackMinor = chosen ? Number(chosen.paystackAmountMinor || 0) : 0;
    basePricingByProvider.paystack = {
      currency: "NGN",
      baseAmountMinor: paystackMinor,
      discountMinor: 0,
      finalAmountMinor: paystackMinor,
    };
    if (holidayBatchMeta) {
      if (!chosen) {
        holidayBatchMeta.textContent = "Select one of the available holiday batches.";
        holidayBatchMeta.hidden = false;
        holidayBatchMeta.classList.remove("hidden");
      } else {
        holidayBatchMeta.textContent = "";
        holidayBatchMeta.hidden = true;
        holidayBatchMeta.classList.add("hidden");
      }
    }
    updatePaymentOptionMetas();
    updateIntro();
    manualConfigLoadedKey = "";
    if (providerInput && providerInput.value === "manual_transfer" && chosen) {
      ensureManualConfigLoaded().catch(function () { return null; });
    }
  }

  function isOptionDisabled(optionEl) {
    if (!optionEl) return false;
    if (optionEl.hasAttribute("disabled")) return true;
    return optionEl.getAttribute("data-disabled") === "true";
  }

  function findOption(provider) {
    return paymentOptions.find(function (el) {
      return el.getAttribute("data-provider") === provider;
    });
  }

  function renderEnrollmentClosedPill() {
    if (!batchEl) return;
    batchEl.innerHTML = [
      '<span class="status-pill status-pending_verification">',
      "Enrollment Closed",
      "</span>",
    ].join("");
  }

  function applyEnrollmentLock(locked) {
    enrollmentLocked = !!locked;
    paymentOptions.forEach(function (el) {
      var provider = String(el.getAttribute("data-provider") || "").trim().toLowerCase();
      var allowedByMethod = !!enabledPaymentMethods[provider];
      var disabled = enrollmentLocked || !allowedByMethod;
      if (disabled) {
        el.setAttribute("disabled", "disabled");
        el.setAttribute("data-disabled", "true");
      } else {
        el.removeAttribute("disabled");
        el.removeAttribute("data-disabled");
      }
      el.classList.toggle("opacity-50", disabled);
      el.classList.toggle("cursor-not-allowed", disabled);
    });
    if (submitBtn) {
      submitBtn.disabled = enrollmentLocked;
      submitBtn.classList.toggle("opacity-50", enrollmentLocked);
      submitBtn.classList.toggle("cursor-not-allowed", enrollmentLocked);
      submitBtn.setAttribute("aria-disabled", enrollmentLocked ? "true" : "false");
      submitBtn.style.opacity = enrollmentLocked ? "0.65" : "";
      submitBtn.style.cursor = enrollmentLocked ? "not-allowed" : "";
      submitBtn.style.pointerEvents = enrollmentLocked ? "none" : "";
      if (!enrollmentLocked) {
        submitBtn.textContent = (providerInput && providerInput.value) === "manual_transfer" ? "Upload proof and confirm" : "Proceed to Payment";
      }
    }
    if (enrollmentLocked) renderEnrollmentClosedPill();
  }

  function applyEnabledPaymentMethods(methods) {
    enabledPaymentMethods = { paystack: false, manual_transfer: false };
    (Array.isArray(methods) ? methods : []).forEach(function (method) {
      var key = String(method || "").trim().toLowerCase();
      if (key === "paystack" || key === "manual_transfer") {
        enabledPaymentMethods[key] = true;
      }
    });
    if (!enabledPaymentMethods.paystack && !enabledPaymentMethods.manual_transfer) {
      enabledPaymentMethods = { paystack: true, manual_transfer: true };
    }
    applyEnrollmentLock(enrollmentLocked);
    setActiveProvider(providerInput ? providerInput.value : firstEnabledProvider());
  }

  function firstEnabledProvider() {
    var fallback = "paystack";
    for (var i = 0; i < paymentOptions.length; i += 1) {
      var el = paymentOptions[i];
      if (!isOptionDisabled(el)) {
        return el.getAttribute("data-provider") || fallback;
      }
    }
    return fallback;
  }

  function setActiveProvider(provider) {
    if (!providerInput) return;
    var optionEl = findOption(provider);
    if (optionEl && isOptionDisabled(optionEl)) {
      provider = firstEnabledProvider();
    }
    providerInput.value = provider;
    paymentOptions.forEach(function (el) {
      var active = el.getAttribute("data-provider") === provider;
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-checked", active ? "true" : "false");
    });
    var isManual = provider === "manual_transfer";
    if (manualTransferBlock) {
      manualTransferBlock.hidden = !isManual;
      manualTransferBlock.classList.toggle("hidden", !isManual);
    }
    if (paystackBreakdown) {
      var showPaystackBreakdown = !isManual;
      paystackBreakdown.hidden = !showPaystackBreakdown;
      paystackBreakdown.classList.toggle("hidden", !showPaystackBreakdown);
    }
    if (submitBtn) submitBtn.textContent = isManual ? "Upload proof and confirm" : "Proceed to Payment";
    renderCouponSummary();
    renderPaystackBreakdown();
    renderFamilyPaymentSummary();
    if (isManual) {
      ensureManualConfigLoaded()
        .then(function () { renderFamilyPaymentSummary(); })
        .catch(function () { return null; });
    }
  }

  async function loadHolidayBatches() {
    var res = await fetch("/.netlify/functions/course-open-batches?course_slug=" + encodeURIComponent(courseSlug), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok || !Array.isArray(json.batches)) {
      if (batchEl) {
        batchEl.innerHTML = [
          '<span class="status-pill status-pending_verification">',
          "Holiday Batches: Unavailable",
          "</span>",
        ].join("");
      }
      return;
    }
    applyEnrollmentLock(json && json.isEnrollmentLocked === true);
    applyEnabledPaymentMethods(Array.isArray(json.enabledPaymentMethods) ? json.enabledPaymentMethods : []);
    applyFamilySettings(json.familyEnrollment);
    activeCoursePricing = json.coursePricing && typeof json.coursePricing === "object" ? json.coursePricing : null;
    var allBatches = Array.isArray(json.batches) ? json.batches : [];
    var fullBatches = allBatches.filter(function (item) { return isBatchFull(item); });
    var batches = allBatches.filter(function (item) { return !isBatchFull(item); }).sort(compareBatchStart);
    holidayBatchMap = {};
    batches.forEach(function (item) {
      var key = String(item.batchKey || "").trim();
      if (!key) return;
      holidayBatchMap[key] = item;
    });
    if (batchEl) {
      batchEl.innerHTML = [
        '<span class="status-pill status-approved">',
        "Open Holiday Batches: " + String(batches.length),
        "</span>",
      ].join("");
    }
    if (enrollmentLocked) renderEnrollmentClosedPill();
    setElementVisible(holidayBatchPickerWrap, true);
    if (holidayBatchSelect) {
      var options = ['<option value="">Select a batch</option>'];
      batches.forEach(function (item, index) {
        var startText = "";
        var parsedStart = parseBatchStart(item.batchStartAt);
        if (parsedStart) {
          startText = " • Starts " + formatDayTime(parsedStart, "Africa/Lagos") + " WAT";
        }
        options.push(
          '<option value="' +
            String(item.batchKey || "") +
            '">' +
            displayBatchLabel(item, index) +
            startText +
            "</option>"
        );
      });
      holidayBatchSelect.innerHTML = options.join("");
      holidayBatchSelect.value = batches.length ? String(batches[0].batchKey || "") : "";
      applyHolidayBatchSelection(holidayBatchSelect.value);
    }
    if (holidayWaitlistTableWrap && holidayWaitlistRows) {
      var waitlistCopyEl = document.getElementById("holidayWaitlistCopy");
      if (!fullBatches.length) {
        setElementVisible(holidayWaitlistTableWrap, false);
        holidayWaitlistRows.innerHTML = "";
      } else {
        if (waitlistCopyEl) {
          waitlistCopyEl.textContent = !batches.length
            ? "All holiday batches are currently full. Join a waitlist below to get priority when a seat opens."
            : "Only the batches listed below are full. Join a waitlist to get priority when a seat opens.";
        }
        holidayWaitlistRows.innerHTML = fullBatches.map(function (item) {
          var startText = "-";
          var parsed = parseBatchStart(item.batchStartAt);
          if (parsed) startText = formatDayTime(parsed, "Africa/Lagos");
          var batchKey = String(item.batchKey || "").trim();
          var waitlistHref = "/join-holiday-waitlist/?batch=" + encodeURIComponent(batchKey);
          return [
            "<tr>",
            '<td class="py-1 pr-3 font-semibold">' + String(item.batchLabel || batchKey || "Batch") + "</td>",
            '<td class="py-1 pr-3">' + startText + "</td>",
            '<td class="py-1 pr-3"><span class="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">Full</span></td>',
            '<td class="py-1 text-right"><a href="' + waitlistHref + '" class="inline-flex rounded-md border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-800 hover:bg-amber-100">Join Waitlist</a></td>',
            "</tr>",
          ].join("");
        }).join("");
        setElementVisible(holidayWaitlistTableWrap, true);
      }
    }
    if (!batches.length && submitBtn) {
      submitBtn.disabled = true;
      setError("All holiday batches are currently full. Join the waitlist below.");
    }
  }

  async function loadActiveBatch() {
    if (isHolidayMultiBatchCourse()) {
      await loadHolidayBatches();
      return;
    }
    var res = await fetch("/.netlify/functions/course-active-batch?course_slug=" + encodeURIComponent(courseSlug), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok || !json.activeBatch) {
      if (batchEl) {
        batchEl.innerHTML = [
          '<span class="status-pill status-pending_verification">',
          "Active Batch: Unavailable",
          "</span>",
        ].join("");
      }
      return;
    }
    applyEnrollmentLock(json && json.isEnrollmentLocked === true);
    var active = json.activeBatch;
    activeCoursePricing = json.coursePricing && typeof json.coursePricing === "object" ? json.coursePricing : null;
    applyEnabledPaymentMethods(Array.isArray(json.enabledPaymentMethods) ? json.enabledPaymentMethods : []);
    applyFamilySettings(json.familyEnrollment);
    activeCourseBatchKey = String(active.batchKey || "");
    activeCourseBatchStartAt = String(active.batchStartAt || "");
    var paystackMinor = Number(active.paystackAmountMinor || 0);
    basePricingByProvider.paystack = {
      currency: "NGN",
      baseAmountMinor: paystackMinor,
      discountMinor: 0,
      finalAmountMinor: paystackMinor,
    };
    if (batchEl) {
      batchEl.innerHTML = [
        '<span class="status-pill status-approved">',
        "Active Batch: " + String(active.batchLabel || "Current Batch"),
        "</span>",
      ].join("");
    }
    if (enrollmentLocked) renderEnrollmentClosedPill();
    updatePaymentOptionMetas();
    updateIntro();
  }

  async function ensureManualConfigLoaded() {
    var couponForManual = appliedCoupon ? String(appliedCoupon.code || "").trim() : String((couponCodeInput && couponCodeInput.value) || "").trim();
    var cacheKey = courseSlug + ":" + (activeCourseBatchKey || "") + ":" + couponForManual + ":" + familySeatCount();
    if (manualConfigLoadedKey === cacheKey) return;
    manualConfigLoadedKey = cacheKey;
    var params = new URLSearchParams({
      course_slug: courseSlug,
      batch_key: activeCourseBatchKey || "",
    });
    if (couponForManual) params.set("coupon_code", couponForManual);
    params.set("seat_count", String(familySeatCount()));
    var emailForManual = String((form.email && form.email.value) || "").trim();
    if (emailForManual) params.set("email", emailForManual);
    var res = await fetch("/.netlify/functions/manual-payment-config?" + params.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok || !json.details) throw new Error((json && json.error) || "Could not load bank details");
    var details = json.details || {};
    manualPaymentDetails = details;
    if (details.couponError) {
      setCouponStatus(String(details.couponError), "error");
    }
    var amountLabel = String(details.amountLabel || "N10,750").trim();
    if (manualBankDetails) {
      var manualDetailRows = [
        '<p class="manual-transfer__title">Bank details</p>',
        "<p><strong>Bank:</strong> " + String(details.bankName || "-") + "</p>",
        "<p><strong>Account name:</strong> " + String(details.accountName || "-") + "</p>",
        "<p><strong>Account number:</strong> " + String(details.accountNumber || "-") + "</p>",
      ];
      if (details.coursePriceLabel) {
        manualDetailRows.push("<p><strong>Course price:</strong> " + String(details.coursePriceLabel || "-") + "</p>");
      }
      if (details.vatLabel) {
        manualDetailRows.push("<p><strong>VAT:</strong> " + String(details.vatLabel || "-") + "</p>");
      }
      manualDetailRows.push("<p><strong>Amount:</strong> " + amountLabel + "</p>");
      manualBankDetails.innerHTML = manualDetailRows.join("");
    }
    if (manualOptionMeta) manualOptionMeta.textContent = "Transfer " + amountLabel + " and upload proof";
    renderFamilyPaymentSummary();
  }

  async function getUploadSignature() {
    var res = await fetch("/.netlify/functions/upload-signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "manual_payment" }),
    });
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not prepare upload");
    return json;
  }

  async function uploadProofToCloudinary(file) {
    var uploadConfig = await getUploadSignature();
    var fd = new FormData();
    fd.append("file", file);
    fd.append("api_key", uploadConfig.apiKey);
    fd.append("timestamp", String(uploadConfig.timestamp));
    fd.append("folder", uploadConfig.folder);
    fd.append("signature", uploadConfig.signature);
    var endpoint = "https://api.cloudinary.com/v1_1/" + encodeURIComponent(uploadConfig.cloudName) + "/auto/upload";
    var res = await fetch(endpoint, { method: "POST", body: fd });
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.secure_url) {
      var msg = (json && json.error && json.error.message) || "Could not upload proof";
      throw new Error(msg);
    }
    return {
      proofUrl: String(json.secure_url || ""),
      proofPublicId: String(json.public_id || ""),
    };
  }

  function childRowHtml(index) {
    return [
      '<div class="family-child-row" data-family-child-row>',
      '<div class="family-child-row__header">',
      '<p class="family-child-row__title">Child ' + String(Number(index || 0) + 1) + "</p>",
      '<button type="button" class="family-child-row__remove" data-family-remove-child>Remove</button>',
      "</div>",
      '<div class="family-child-grid">',
      '<div class="family-field family-field--name"><label class="form-label">Child full name</label><input class="form-input family-input" data-family-child-name placeholder="E.g. Ada Johnson" /></div>',
      '<div class="family-field family-field--age"><label class="form-label">Age</label><input class="form-input family-input" data-family-child-age inputmode="numeric" placeholder="10" /></div>',
      '<div class="family-field family-field--class"><label class="form-label">Class / level</label><input class="form-input family-input" data-family-child-class placeholder="Primary 5, JSS 1, beginner" /></div>',
      "</div>",
      "</div>",
    ].join("");
  }

  function renumberFamilyRows() {
    if (!familyChildrenWrap) return;
    Array.prototype.slice.call(familyChildrenWrap.querySelectorAll("[data-family-child-row]")).forEach(function (row, index) {
      var label = row.querySelector("p");
      if (label) label.textContent = "Child " + String(index + 1);
      var remove = row.querySelector("[data-family-remove-child]");
      if (remove) remove.hidden = index === 0;
    });
  }

  function addFamilyChildRow() {
    if (!familyChildrenWrap) return;
    var count = familyChildrenWrap.querySelectorAll("[data-family-child-row]").length;
    if (count >= familyMaxChildren) return;
    familyChildrenWrap.insertAdjacentHTML("beforeend", childRowHtml(count));
    renumberFamilyRows();
    clearCouponForSeatChange();
    manualConfigLoadedKey = "";
    manualPaymentDetails = null;
    updatePaymentOptionMetas();
  }

  function buildFamilySection() {
    if (familySection || !familyEnrollmentEnabled) return;
    var section = document.createElement("section");
    section.id = "familyEnrollmentBlock";
    section.className = "family-enrollment";
    section.innerHTML = [
      '<label class="family-toggle">',
      '<input id="familyEnrollmentEnabled" type="checkbox" class="family-toggle__input" />',
      '<span class="family-toggle__copy"><strong>Enrolling more than one person?</strong><span>Buy seats now, then assign them from your dashboard.</span></span>',
      "</label>",
      '<div id="familyChildrenPanel" class="family-children-panel hidden" hidden>',
      '<p id="familyPaymentSummary" class="family-payment-summary">Turn this on to buy multiple family seats under one parent account.</p>',
      '<label class="family-seat-count"><span class="form-label">Number of seats</span><input id="familySeatCountInput" type="number" min="2" step="1" value="2" class="form-input family-input" /></label>',
      '<p class="family-payment-summary">After payment, seats become available in your dashboard. You can assign them to the right learners there.</p>',
      '<div id="familyChildrenWrap" class="family-children-wrap hidden" hidden></div>',
      "</div>",
    ].join("");
    if (form.parentNode) form.parentNode.insertBefore(section, form);
    else form.insertBefore(section, form.firstChild);
    familySection = section;
    familyEnabledInput = document.getElementById("familyEnrollmentEnabled");
    familySeatCountInput = document.getElementById("familySeatCountInput");
    familyChildrenWrap = document.getElementById("familyChildrenWrap");
    familyAddChildBtn = document.getElementById("familyAddChildBtn");
    if (familyEnabledInput) {
      familyEnabledInput.addEventListener("change", function () {
        var panel = document.getElementById("familyChildrenPanel");
        if (panel) {
          panel.hidden = !familyEnabledInput.checked;
          panel.classList.toggle("hidden", !familyEnabledInput.checked);
        }
        clearCouponForSeatChange();
        manualConfigLoadedKey = "";
        manualPaymentDetails = null;
        refreshPaymentCalculations();
      });
    }
    if (familySeatCountInput) {
      familySeatCountInput.setAttribute("max", String(familyMaxChildren));
      familySeatCountInput.addEventListener("input", function () {
        var seats = familySeatCount();
        familySeatCountInput.value = String(seats);
        clearCouponForSeatChange();
        manualConfigLoadedKey = "";
        manualPaymentDetails = null;
        refreshPaymentCalculations();
      });
    }
    if (familyAddChildBtn) {
      familyAddChildBtn.addEventListener("click", function () {
        addFamilyChildRow();
        if (providerInput && providerInput.value === "manual_transfer") ensureManualConfigLoaded().catch(function () { return null; });
      });
    }
    if (familyChildrenWrap) {
      familyChildrenWrap.addEventListener("click", function (event) {
        var target = event.target;
        if (!target || !target.matches("[data-family-remove-child]")) return;
        var row = target.closest("[data-family-child-row]");
        if (row) row.remove();
        if (!familyChildrenWrap.querySelector("[data-family-child-row]")) addFamilyChildRow();
        renumberFamilyRows();
        clearCouponForSeatChange();
        manualConfigLoadedKey = "";
        manualPaymentDetails = null;
        updatePaymentOptionMetas();
        if (providerInput && providerInput.value === "manual_transfer") ensureManualConfigLoaded().catch(function () { return null; });
      });
      familyChildrenWrap.addEventListener("input", function () {
        manualConfigLoadedKey = "";
        renderFamilyPaymentSummary();
      });
    }
  }

  function applyFamilySettings(settings) {
    var cfg = settings && typeof settings === "object" ? settings : {};
    if (pageFamilyToggle === "false" || pageFamilyToggle === "0" || pageFamilyToggle === "no") {
      familyEnrollmentEnabled = false;
      if (familySection) familySection.hidden = true;
      return;
    }
    if (cfg.enabled === false) {
      familyEnrollmentEnabled = false;
      if (familySection) familySection.hidden = true;
      return;
    }
    if (cfg.enabled === true) familyEnrollmentEnabled = true;
    familyMaxChildren = Math.max(1, Number(cfg.maxChildren || familyMaxChildren || 500));
    buildFamilySection();
    if (familySeatCountInput) familySeatCountInput.setAttribute("max", String(familyMaxChildren));
  }

  paymentOptions.forEach(function (option) {
    option.addEventListener("click", function () {
      var provider = option.getAttribute("data-provider");
      if (isOptionDisabled(option)) return;
      if (!provider) return;
      setActiveProvider(provider);
    });
  });

  async function applyCoupon() {
    var provider = providerInput ? providerInput.value : "paystack";
    var code = String((couponCodeInput && couponCodeInput.value) || "").trim();
    if (isHolidayMultiBatchCourse() && !activeCourseBatchKey) {
      setCouponStatus("Please choose a batch first.", "error");
      return;
    }
    if (!code) {
      clearAppliedCoupon("");
      setCouponStatus("Enter a coupon code.", "error");
      return;
    }
    if (applyCouponBtn) {
      applyCouponBtn.disabled = true;
      applyCouponBtn.textContent = "Applying...";
    }
    setCouponStatus("", "");
    try {
      var emailValue = String((form.email && form.email.value) || "").trim();
      async function fetchCouponForProvider(targetProvider) {
        var res = await fetch("/.netlify/functions/coupon-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            couponCode: code,
            courseSlug: courseSlug,
            batchKey: activeCourseBatchKey,
            provider: targetProvider,
            email: emailValue,
            seatCount: familySeatCount(),
          }),
        });
        var json = await res.json().catch(function () { return null; });
        return { ok: !!(res.ok && json && json.ok && json.pricing), res: res, json: json };
      }

      var previewPaystack = await fetchCouponForProvider("paystack");
      if (!previewPaystack.ok) {
        throw new Error(
          (previewPaystack.json && previewPaystack.json.error) || "Could not apply coupon."
        );
      }
      couponPricingByProvider = {
        paystack: previewPaystack.ok ? previewPaystack.json.pricing : null,
      };
      var winner = previewPaystack.json;
      appliedCoupon = {
        code: String((winner.coupon && winner.coupon.code) || code).toUpperCase(),
      };
      if (couponCodeInput) couponCodeInput.value = appliedCoupon.code;
      updatePaymentOptionMetas();
      renderCouponSummary();
      renderPaystackBreakdown();
      setCouponStatus("Coupon applied successfully.", "ok");
      if (provider === "manual_transfer") {
        manualConfigLoadedKey = "";
        await ensureManualConfigLoaded();
      }
    } catch (error) {
      clearAppliedCoupon("");
      setCouponStatus(error.message || "Could not apply coupon.", "error");
    } finally {
      if (applyCouponBtn) {
        applyCouponBtn.disabled = false;
        applyCouponBtn.textContent = "Apply";
      }
    }
  }

  if (applyCouponBtn) {
    applyCouponBtn.addEventListener("click", function () {
      applyCoupon().catch(function () { return null; });
    });
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    var firstName = String(form.firstName.value || "").trim();
    var email = String(form.email.value || "").trim();
    var phone = String((form.phone && form.phone.value) || "").trim();
    var whatsappOptIn = !!(form.whatsappOptIn && form.whatsappOptIn.checked);
    var country = "";
    var provider = providerInput ? providerInput.value : "paystack";
    var affiliateCode = resolveAffiliateCode();
    var familyMode = !!(familyEnabledInput && familyEnabledInput.checked);
    var children = familyChildren();
    if (!firstName || !email || !phone) {
      setError("Please enter your full name, phone number, and email address.");
      return;
    }
    if (familyMode && familySeatCount() < 2) {
      setError("Please choose at least two seats for family enrollment.");
      return;
    }
    if (enrollmentLocked) {
      return;
    }
    if (isHolidayMultiBatchCourse() && !activeCourseBatchKey) {
      setError("Please choose a holiday batch before continuing.");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = provider === "manual_transfer" ? "Uploading proof..." : "Submitting...";
    }

    try {
      if (provider === "manual_transfer") {
        var proofFile = manualProofFileInput && manualProofFileInput.files ? manualProofFileInput.files[0] : null;
        if (!proofFile) throw new Error("Please attach your payment proof file.");
        var uploaded = await uploadProofToCloudinary(proofFile);
        var manualRes = await fetch("/.netlify/functions/manual-payment-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: firstName,
            email: email,
            phone: phone,
            whatsappOptIn: whatsappOptIn,
            optInTextVersion: "enrollment_whatsapp_v1",
            courseSlug: courseSlug,
            batchKey: activeCourseBatchKey,
            couponCode: appliedCoupon ? appliedCoupon.code : String((couponCodeInput && couponCodeInput.value) || "").trim(),
            affiliateCode: affiliateCode,
            familyEnrollment: familyMode,
            seatCount: familySeatCount(),
            children: children,
            proofUrl: uploaded.proofUrl,
            proofPublicId: uploaded.proofPublicId,
          }),
        });
        var manualJson = await manualRes.json().catch(function () { return null; });
        if (!manualRes.ok || !manualJson || !manualJson.ok) {
          throw new Error((manualJson && manualJson.error) || "Could not submit manual payment.");
        }
        setSuccess("Payment proof submitted. Redirecting you to your dashboard...");
        form.reset();
        setActiveProvider("paystack");
        window.location.href = "/dashboard/";
        return;
      }

      var recaptchaToken = await window.recaptchaHelper.getToken("course_order_create");
      var res = await fetch("/.netlify/functions/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName,
          email: email,
          phone: phone,
          whatsappOptIn: whatsappOptIn,
          optInTextVersion: "enrollment_whatsapp_v1",
          provider: provider,
          courseSlug: courseSlug,
          batchKey: activeCourseBatchKey,
          couponCode: appliedCoupon ? appliedCoupon.code : String((couponCodeInput && couponCodeInput.value) || "").trim(),
          affiliateCode: affiliateCode,
          familyEnrollment: familyMode,
          seatCount: familySeatCount(),
          children: children,
          recaptchaToken: recaptchaToken,
        }),
      });
      var json = await res.json().catch(function () { return null; });
      if (!res.ok || !json || !json.ok || !json.checkoutUrl) {
        throw new Error((json && json.error) || "Could not start payment. Please try again.");
      }
      window.location.href = json.checkoutUrl;
    } catch (error) {
      setError(error.message || "Something went wrong. Please try again.");
      if (submitBtn) submitBtn.disabled = false;
    } finally {
      if (submitBtn && !submitBtn.disabled) {
        submitBtn.textContent = (providerInput && providerInput.value) === "manual_transfer" ? "Upload proof and confirm" : "Proceed to Payment";
      }
    }
  });

  updateIntro();
  setActiveProvider((providerInput && providerInput.value) || "paystack");
  if (holidayBatchSelect) {
    holidayBatchSelect.addEventListener("change", function () {
      applyHolidayBatchSelection(String(holidayBatchSelect.value || ""));
    });
  }
  loadActiveBatch()
    .then(function () {
      if (isHolidayMultiBatchCourse() && !activeCourseBatchKey) return null;
      return ensureManualConfigLoaded();
    })
    .catch(function () { return null; });
})();
