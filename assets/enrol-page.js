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
  var couponCodeInput = document.getElementById("couponCodeInput");
  var applyCouponBtn = document.getElementById("applyCouponBtn");
  var couponStatusEl = document.getElementById("couponStatus");
  var couponSummaryEl = document.getElementById("couponSummary");

  var courseSlug = String(form.getAttribute("data-course-slug") || "prompt-to-profit").trim();
  var activeCourseBatchKey = "";
  var activeCourseBatchStartAt = "";
  var manualConfigLoadedKey = "";
  var appliedCoupon = null;
  var couponPricingByProvider = { paystack: null, paypal: null };
  var basePricingByProvider = { paystack: null, paypal: null };

  var COURSE_CONFIGS = {
    "prompt-to-profit": {
      name: "Prompt to Profit",
      intro:
        "Pay now to reserve your place. You will be added to the enrolment list and onboarded before launch.",
    },
    "prompt-to-production": {
      name: "Prompt to Profit Advanced",
      intro:
        "Secure your seat for the next quarterly cohort. Once payment is confirmed, you will be added to the onboarding list immediately.",
    },
    "ai-for-everyday-business-owners": {
      name: "AI for Everyday Business Owners",
      intro:
        "Secure your seat for the next intake. Once payment is confirmed, you will be added to the onboarding list immediately.",
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

  function renderCouponSummary() {
    if (!couponSummaryEl) return;
    var provider = providerInput ? providerInput.value : "paypal";
    var pricing = null;
    if (provider === "manual_transfer") {
      pricing = couponPricingByProvider.paystack;
    } else {
      pricing = couponPricingByProvider[provider] || null;
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

  function clearAppliedCoupon(message) {
    appliedCoupon = null;
    couponPricingByProvider = { paystack: null, paypal: null };
    renderCouponSummary();
    updatePaymentOptionMetas();
    if (message) setCouponStatus(message, "info");
    if (providerInput && providerInput.value === "manual_transfer") {
      ensureManualConfigLoaded().catch(function () { return null; });
    }
  }

  function updatePaymentOptionMetas() {
    var paystackPricing = couponPricingByProvider.paystack || basePricingByProvider.paystack;
    var paypalPricing = couponPricingByProvider.paypal || basePricingByProvider.paypal;
    var paystackOption = findOption("paystack");
    if (paystackOptionMeta && !isOptionDisabled(paystackOption)) {
      paystackOptionMeta.textContent = paystackPricing
        ? "Pay in full (" + formatCurrencyMinor("NGN", paystackPricing.finalAmountMinor) + ")"
        : "Pay in full";
    }
    if (paypalOptionMeta) {
      paypalOptionMeta.textContent = paypalPricing
        ? "Pay online (" + formatCurrencyMinor("GBP", paypalPricing.finalAmountMinor) + ")"
        : "International checkout (PayPal)";
    }
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

  function formatGbpMinor(minor) {
    var amount = Number(minor || 0) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return "";
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
  }

  function launchScheduleText() {
    var startDate = parseBatchStart(activeCourseBatchStartAt);
    if (!startDate) return "";
    return "Launch is " + formatDayTime(startDate, "Africa/Lagos") + " WAT.";
  }

  function updateIntro() {
    if (!introEl) return;
    var intro = courseConfig().intro;
    var schedule = launchScheduleText();
    introEl.textContent = schedule ? intro + " " + schedule : intro;
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
    if (manualTransferBlock) manualTransferBlock.hidden = !isManual;
    if (submitBtn) submitBtn.textContent = isManual ? "Upload proof and confirm" : "Proceed to Payment";
    renderCouponSummary();
    if (isManual) ensureManualConfigLoaded().catch(function () { return null; });
  }

  async function loadActiveBatch() {
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
    var active = json.activeBatch;
    activeCourseBatchKey = String(active.batchKey || "");
    activeCourseBatchStartAt = String(active.batchStartAt || "");
    var paystackMinor = Number(active.paystackAmountMinor || 0);
    var paypalMinor = Number(active.paypalAmountMinor || 0);
    basePricingByProvider.paystack = {
      currency: "NGN",
      baseAmountMinor: paystackMinor,
      discountMinor: 0,
      finalAmountMinor: paystackMinor,
    };
    basePricingByProvider.paypal = {
      currency: "GBP",
      baseAmountMinor: paypalMinor,
      discountMinor: 0,
      finalAmountMinor: paypalMinor,
    };
    if (batchEl) {
      batchEl.innerHTML = [
        '<span class="status-pill status-approved">',
        "Active Batch: " + String(active.batchLabel || "Current Batch"),
        "</span>",
      ].join("");
    }
    updatePaymentOptionMetas();
    updateIntro();
  }

  async function ensureManualConfigLoaded() {
    var couponForManual = appliedCoupon ? String(appliedCoupon.code || "").trim() : String((couponCodeInput && couponCodeInput.value) || "").trim();
    var cacheKey = courseSlug + ":" + (activeCourseBatchKey || "") + ":" + couponForManual;
    if (manualConfigLoadedKey === cacheKey) return;
    manualConfigLoadedKey = cacheKey;
    var params = new URLSearchParams({
      course_slug: courseSlug,
      batch_key: activeCourseBatchKey || "",
    });
    if (couponForManual) params.set("coupon_code", couponForManual);
    var emailForManual = String((form.email && form.email.value) || "").trim();
    if (emailForManual) params.set("email", emailForManual);
    var res = await fetch("/.netlify/functions/manual-payment-config?" + params.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok || !json.details) throw new Error((json && json.error) || "Could not load bank details");
    var details = json.details || {};
    if (details.couponError) {
      setCouponStatus(String(details.couponError), "error");
    }
    var amountLabel = String(details.amountLabel || "N10,750").trim();
    if (manualBankDetails) {
      manualBankDetails.innerHTML = [
        '<p class="manual-transfer__title">Bank details</p>',
        "<p><strong>Bank:</strong> " + String(details.bankName || "-") + "</p>",
        "<p><strong>Account name:</strong> " + String(details.accountName || "-") + "</p>",
        "<p><strong>Account number:</strong> " + String(details.accountNumber || "-") + "</p>",
        "<p><strong>Amount:</strong> " + amountLabel + "</p>",
      ].join("");
    }
    if (manualOptionMeta) manualOptionMeta.textContent = "Transfer " + amountLabel + " and upload proof";
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

  paymentOptions.forEach(function (option) {
    option.addEventListener("click", function () {
      var provider = option.getAttribute("data-provider");
      if (isOptionDisabled(option)) return;
      if (!provider) return;
      setActiveProvider(provider);
    });
  });

  async function applyCoupon() {
    var provider = providerInput ? providerInput.value : "paypal";
    var code = String((couponCodeInput && couponCodeInput.value) || "").trim();
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
          }),
        });
        var json = await res.json().catch(function () { return null; });
        return { ok: !!(res.ok && json && json.ok && json.pricing), res: res, json: json };
      }

      var previewPaystack = await fetchCouponForProvider("paystack");
      var previewPaypal = await fetchCouponForProvider("paypal");
      if (!previewPaystack.ok && !previewPaypal.ok) {
        throw new Error(
          (previewPaypal.json && previewPaypal.json.error) ||
            (previewPaystack.json && previewPaystack.json.error) ||
            "Could not apply coupon."
        );
      }
      couponPricingByProvider = {
        paystack: previewPaystack.ok ? previewPaystack.json.pricing : null,
        paypal: previewPaypal.ok ? previewPaypal.json.pricing : null,
      };
      var winner = previewPaypal.ok ? previewPaypal.json : previewPaystack.json;
      appliedCoupon = {
        code: String((winner.coupon && winner.coupon.code) || code).toUpperCase(),
      };
      if (couponCodeInput) couponCodeInput.value = appliedCoupon.code;
      updatePaymentOptionMetas();
      renderCouponSummary();
      if (previewPaystack.ok && previewPaypal.ok) {
        setCouponStatus("Coupon applied successfully.", "ok");
      } else if (previewPaystack.ok) {
        setCouponStatus("Coupon applied for NGN checkout only.", "info");
      } else {
        setCouponStatus("Coupon applied for GBP checkout only.", "info");
      }
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
    var country = "";
    var provider = providerInput ? providerInput.value : "paystack";
    if (!firstName || !email) {
      setError("Please enter your full name and email address.");
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
            courseSlug: courseSlug,
            batchKey: activeCourseBatchKey,
            couponCode: appliedCoupon ? appliedCoupon.code : String((couponCodeInput && couponCodeInput.value) || "").trim(),
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

      var res = await fetch("/.netlify/functions/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName,
          email: email,
          provider: provider,
          courseSlug: courseSlug,
          batchKey: activeCourseBatchKey,
          couponCode: appliedCoupon ? appliedCoupon.code : String((couponCodeInput && couponCodeInput.value) || "").trim(),
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
  loadActiveBatch()
    .then(function () {
      return ensureManualConfigLoaded();
    })
    .catch(function () { return null; });
})();
