(function () {
  var form = document.getElementById("schoolRegisterForm");
  var schoolNameEl = document.getElementById("schoolName");
  var adminNameEl = document.getElementById("adminName");
  var adminEmailEl = document.getElementById("adminEmail");
  var adminPhoneEl = document.getElementById("adminPhone");
  var countryEl = document.getElementById("schoolCountry");
  var providerEl = document.getElementById("schoolPaymentProvider");
  var paymentOptionsEl = document.getElementById("schoolPaymentOptions");
  var seatCountEl = document.getElementById("seatCount");
  var subtotalEl = document.getElementById("priceSubtotal");
  var vatEl = document.getElementById("priceVat");
  var processingFeeEl = document.getElementById("priceProcessingFee");
  var totalEl = document.getElementById("priceTotal");
  var statusEl = document.getElementById("schoolRegisterStatus");
  var btn = document.getElementById("schoolRegisterBtn");
  var introEl = document.getElementById("schoolsPricingIntro");
  var seatCountLabelEl = document.querySelector('label[for="seatCount"] span, label[for="seatCount"]');

  var MIN_SEATS = null;
  var PRICE_PER_STUDENT_MINOR = 850000;
  var VAT_PERCENT = 7.5;
  var AFFILIATE_REF_KEY = "tn_affiliate_ref_code_v1";
  var STRIPE_VAT_PERCENT = 20;
  var STRIPE_PRICE_PER_STUDENT_MINOR = {
    GBP: 2000,
    USD: 2500,
    EUR: 2000,
  };
  var STRIPE_FEE_BPS = 150;
  var STRIPE_FIXED_FEE_MINOR = {
    GBP: 20,
    USD: 30,
    EUR: 25,
  };

  function clean(value) {
    return String(value || "").trim();
  }

  function naira(minor) {
    var amount = Math.max(0, Number(minor || 0)) / 100;
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function selectedCountry() {
    return clean(countryEl && countryEl.value);
  }

  function isNigeriaCountry(value) {
    var text = clean(value).toLowerCase();
    return text === "ng" || text === "nga" || text === "nigeria";
  }

  function normalizeSchoolCountry(value) {
    var text = clean(value).toLowerCase();
    if (!text) return "Other";
    if (text === "ng" || text === "nga" || text === "nigeria") return "Nigeria";
    if (text === "gb" || text === "gbr" || text === "uk" || text === "united kingdom" || text === "england" || text === "scotland" || text === "wales") return "United Kingdom";
    if (text === "us" || text === "usa" || text === "united states" || text === "united states of america") return "United States";
    var euCountries = [
      "at", "austria", "be", "belgium", "cy", "cyprus", "ee", "estonia", "fi", "finland", "fr", "france",
      "de", "germany", "gr", "greece", "ie", "ireland", "it", "italy", "lv", "latvia", "lt", "lithuania",
      "lu", "luxembourg", "mt", "malta", "nl", "netherlands", "pt", "portugal", "sk", "slovakia",
      "si", "slovenia", "es", "spain", "eu", "european union"
    ];
    return euCountries.indexOf(text) !== -1 ? "European Union" : "Other";
  }

  function phoneDialingCodeForCountry(value) {
    var country = normalizeSchoolCountry(value);
    if (country === "Nigeria") return "+234";
    if (country === "United States") return "+1";
    return "+44";
  }

  function phoneExampleForCountry(value) {
    var country = normalizeSchoolCountry(value);
    if (country === "Nigeria") return "+2348012345678";
    if (country === "United States") return "+12025550123";
    return "+447911123456";
  }

  function updateAdminPhoneHelper() {
    if (!adminPhoneEl) return;
    var country = normalizeSchoolCountry(selectedCountry());
    var code = phoneDialingCodeForCountry(country);
    var example = phoneExampleForCountry(country);
    adminPhoneEl.placeholder = "e.g. " + example;
    var helper = document.getElementById("adminPhoneHelper");
    if (!helper) {
      var wrap = adminPhoneEl.closest ? adminPhoneEl.closest("label, div") : null;
      if (!wrap) return;
      helper = document.createElement("p");
      helper.id = "adminPhoneHelper";
      helper.className = "mt-1 text-xs text-slate-500";
      wrap.appendChild(helper);
    }
    var suffix = country === "European Union" || country === "Other" ? " We use the UK code by default for this option." : "";
    helper.textContent = "Start the admin phone number with " + code + ". Example: " + example + "." + suffix;
  }

  function stripeCurrencyForCountry(value) {
    var text = clean(value).toLowerCase();
    if (text === "united kingdom" || text === "uk" || text === "gb" || text === "gbr") return "GBP";
    if (text === "european union" || text === "eu") return "EUR";
    if (text === "united states" || text === "us" || text === "usa") return "USD";
    return "USD";
  }

  function money(minor, currency) {
    var cur = clean(currency).toUpperCase() || "NGN";
    var locale = cur === "NGN" ? "en-NG" : (cur === "GBP" ? "en-GB" : (cur === "EUR" ? "en-IE" : "en-US"));
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cur,
      maximumFractionDigits: cur === "NGN" ? 0 : 2,
    }).format(Math.max(0, Number(minor || 0)) / 100);
  }

  function currentProvider() {
    return clean(providerEl && providerEl.value).toLowerCase() || "paystack";
  }

  function setActiveProvider(provider) {
    var target = clean(provider).toLowerCase() === "stripe" ? "stripe" : "paystack";
    if (providerEl) providerEl.value = target;
    if (!paymentOptionsEl) return;
    var darkOptions = paymentOptionsEl.classList && paymentOptionsEl.classList.contains("payment-options--dark");
    Array.prototype.slice.call(paymentOptionsEl.querySelectorAll(".payment-option")).forEach(function (option) {
      var active = clean(option.getAttribute("data-provider")).toLowerCase() === target;
      option.classList.toggle("is-active", active);
      option.classList.toggle("border-brand-200", !darkOptions && active);
      option.classList.toggle("bg-brand-50", !darkOptions && active);
      option.classList.toggle("border-gray-200", !darkOptions && !active);
      option.classList.toggle("bg-white", !darkOptions && !active);
      option.classList.toggle("border-amber-500/40", darkOptions && active);
      option.classList.toggle("bg-amber-500/10", darkOptions && active);
      option.classList.toggle("border-white/10", darkOptions && !active);
      option.classList.toggle("bg-white/5", darkOptions && !active);
      option.setAttribute("aria-checked", active ? "true" : "false");
    });
  }

  function syncPaymentMethodsForCountry() {
    var country = selectedCountry();
    if (!country) {
      if (providerEl) providerEl.value = "";
      if (paymentOptionsEl) {
        Array.prototype.slice.call(paymentOptionsEl.querySelectorAll(".payment-option")).forEach(function (option) {
          option.hidden = true;
          option.classList.add("hidden");
          option.style.display = "none";
          option.disabled = true;
          option.setAttribute("aria-checked", "false");
        });
      }
      updatePricing();
      return;
    }
    var nigeria = isNigeriaCountry(selectedCountry());
    var targetProvider = nigeria ? "paystack" : "stripe";
    if (paymentOptionsEl) {
      Array.prototype.slice.call(paymentOptionsEl.querySelectorAll(".payment-option")).forEach(function (option) {
        var provider = clean(option.getAttribute("data-provider")).toLowerCase();
        var show = nigeria ? provider === "paystack" : provider === "stripe";
        option.hidden = !show;
        option.classList.toggle("hidden", !show);
        option.style.display = show ? "" : "none";
        option.disabled = !show;
      });
    }
    setActiveProvider(targetProvider);
    updateAdminPhoneHelper();
    updatePricing();
  }

  function setStatus(text, bad) {
    if (!statusEl) return;
    statusEl.textContent = clean(text);
    statusEl.className = "text-sm " + (bad ? "text-red-600" : "text-slate-600");
  }

  function resolveAffiliateCode() {
    var fromQuery = "";
    try {
      var search = new URLSearchParams(window.location.search || "");
      fromQuery = clean(search.get("ref") || search.get("affiliate")).toUpperCase();
    } catch (_error) {
      fromQuery = "";
    }
    if (fromQuery) {
      try { window.localStorage.setItem(AFFILIATE_REF_KEY, fromQuery); } catch (_error) {}
      return fromQuery;
    }
    try {
      return clean(window.localStorage.getItem(AFFILIATE_REF_KEY)).toUpperCase();
    } catch (_error) {
      return "";
    }
  }

  function pricingForSeats(seatsInput) {
    var seats = Math.max(0, Math.trunc(Number(seatsInput || 0)));
    var provider = currentProvider();
    var currency = "NGN";
    var unit = PRICE_PER_STUDENT_MINOR;
    var vatPercent = VAT_PERCENT;
    if (provider === "stripe") {
      currency = stripeCurrencyForCountry(selectedCountry());
      unit = Number(STRIPE_PRICE_PER_STUDENT_MINOR[currency] || STRIPE_PRICE_PER_STUDENT_MINOR.USD);
      vatPercent = STRIPE_VAT_PERCENT;
    }
    var subtotal = seats * unit;
    var vat = Math.round((subtotal * vatPercent) / 100);
    var beforeFees = subtotal + vat;
    var total = provider === "stripe"
      ? grossUpStripeAmount(beforeFees, currency)
      : grossUpPaystackAmount(beforeFees);
    var processingFee = Math.max(0, total - beforeFees);
    return {
      seats: seats,
      subtotal: subtotal,
      vat: vat,
      processingFee: processingFee,
      total: total,
      currency: currency,
      vatPercent: vatPercent,
    };
  }

  function grossUpPaystackAmount(netMinor) {
    var net = Math.max(0, Math.round(Number(netMinor || 0)));
    var applicableAtPrice = Math.round(net * 0.015) + (net < 250000 ? 0 : 10000);
    if (applicableAtPrice > 200000) return net + 200000;
    return Math.ceil(((net + (net < 250000 ? 0 : 10000)) / (1 - 0.015)) + 1);
  }

  function grossUpStripeAmount(netMinor, currency) {
    var net = Math.max(0, Math.round(Number(netMinor || 0)));
    var bps = Math.max(0, Math.round(Number(STRIPE_FEE_BPS || 0)));
    var fixed = Math.max(0, Math.round(Number(STRIPE_FIXED_FEE_MINOR[currency] || STRIPE_FIXED_FEE_MINOR.USD || 0)));
    if (bps >= 10000) return net + fixed;
    return Math.ceil(((net + fixed) / (1 - bps / 10000)) + 1);
  }

  function hasMinSeatsConfigured() {
    return Number.isFinite(Number(MIN_SEATS)) && Number(MIN_SEATS) > 0;
  }

  function updatePricing() {
    var p = pricingForSeats(seatCountEl && seatCountEl.value);
    if (subtotalEl) subtotalEl.textContent = "Subtotal: " + money(p.subtotal, p.currency);
    if (vatEl) vatEl.textContent = "VAT (" + String(p.vatPercent) + "%): " + money(p.vat, p.currency);
    if (processingFeeEl) processingFeeEl.textContent = "Processing fee: " + money(p.processingFee, p.currency);
    if (totalEl) totalEl.textContent = "Total: " + money(p.total, p.currency);
    updatePricingIntro();
  }

  function selectedUnitPricing() {
    var provider = currentProvider();
    if (provider === "stripe") {
      var stripeCurrency = stripeCurrencyForCountry(selectedCountry());
      return {
        currency: stripeCurrency,
        unitMinor: Number(STRIPE_PRICE_PER_STUDENT_MINOR[stripeCurrency] || STRIPE_PRICE_PER_STUDENT_MINOR.USD || 0),
      };
    }
    return {
      currency: "NGN",
      unitMinor: Number(PRICE_PER_STUDENT_MINOR || 0),
    };
  }

  function updatePricingIntro() {
    if (!introEl) return;
    if (!hasMinSeatsConfigured()) {
      introEl.textContent = "Loading school pricing...";
      return;
    }
    var unit = selectedUnitPricing();
    introEl.textContent =
      "Bulk school access starts at " +
      String(MIN_SEATS) +
      " students. Price is " +
      money(unit.unitMinor, unit.currency) +
      " per student + VAT.";
  }

  function updateSeatLabel() {
    if (!seatCountLabelEl) return;
    if (!hasMinSeatsConfigured()) {
      seatCountLabelEl.textContent = "Number of Students";
      return;
    }
    seatCountLabelEl.textContent = "Number of Students (min " + String(MIN_SEATS) + ")";
  }

  function applySeatConstraints() {
    if (!seatCountEl) return;
    if (!hasMinSeatsConfigured()) {
      seatCountEl.removeAttribute("min");
      return;
    }
    seatCountEl.min = String(MIN_SEATS);
    if (Number(seatCountEl.value || 0) < MIN_SEATS) seatCountEl.value = String(MIN_SEATS);
  }

  if (seatCountEl) {
    seatCountEl.addEventListener("input", updatePricing);
    seatCountEl.addEventListener("change", updatePricing);
  }

  updateSeatLabel();
  applySeatConstraints();

  if (btn) {
    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");
    btn.textContent = "Loading pricing...";
    btn.title = "Loading school pricing configuration";
  }

  async function loadConfig() {
    try {
      var configUrl = "/.netlify/functions/school-pricing-config?ts=" + encodeURIComponent(String(Date.now()));
      var response = await fetch(configUrl, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-store",
        },
      });
      var data = await response.json().catch(function () {
        return null;
      });
      if (!response.ok || !data || data.ok !== true) return false;
      var cfg = data.config || {};
      var stripeQuotes = data.stripeQuotes && typeof data.stripeQuotes === "object" ? data.stripeQuotes : {};
      var feeConfig = data.feeConfig && typeof data.feeConfig === "object" ? data.feeConfig : {};
      var minSeats = Number(cfg.minSeats || 0);
      var fee = Number(cfg.pricePerStudentMinor || 0);
      var vatPercent = Number(cfg.vatPercent || 0);
      if (!Number.isFinite(minSeats) || minSeats <= 0) return false;
      MIN_SEATS = Math.trunc(minSeats);
      if (Number.isFinite(fee) && fee > 0) PRICE_PER_STUDENT_MINOR = Math.trunc(fee);
      if (Number.isFinite(vatPercent) && vatPercent >= 0) VAT_PERCENT = vatPercent;
      ["GBP", "USD", "EUR"].forEach(function (currency) {
        var quote = stripeQuotes[currency] || {};
        var unit = Number(quote.pricePerSeatMinor || 0);
        var intlVat = Number(quote.vatPercent);
        if (Number.isFinite(unit) && unit > 0) STRIPE_PRICE_PER_STUDENT_MINOR[currency] = Math.trunc(unit);
        if (Number.isFinite(intlVat) && intlVat >= 0) STRIPE_VAT_PERCENT = intlVat;
      });
      var stripeFeeBps = Number(feeConfig.stripeFeeBps);
      if (Number.isFinite(stripeFeeBps) && stripeFeeBps >= 0) STRIPE_FEE_BPS = Math.round(stripeFeeBps);
      var stripeFixed = feeConfig.stripeFixedFeeMinor && typeof feeConfig.stripeFixedFeeMinor === "object"
        ? feeConfig.stripeFixedFeeMinor
        : {};
      ["GBP", "USD", "EUR"].forEach(function (currency) {
        var fixed = Number(stripeFixed[currency]);
        if (Number.isFinite(fixed) && fixed >= 0) STRIPE_FIXED_FEE_MINOR[currency] = Math.round(fixed);
      });
      updateSeatLabel();
      applySeatConstraints();
      updateAdminPhoneHelper();
      updatePricing();
      return true;
    } catch (_error) {
      return false;
    }
  }
  loadConfig()
    .then(function (ok) {
      if (ok) {
        if (btn) {
          btn.disabled = false;
          btn.removeAttribute("aria-disabled");
          btn.removeAttribute("title");
          btn.textContent = "Continue to Payment";
        }
        return;
      }
      if (introEl) introEl.textContent = "School pricing is temporarily unavailable. Please refresh to try again.";
      setStatus("Could not load school pricing configuration. Please refresh and try again.", true);
      if (btn) {
        btn.disabled = true;
        btn.setAttribute("aria-disabled", "true");
        btn.title = "Pricing configuration unavailable";
        btn.textContent = "Pricing Unavailable";
      }
    })
    .finally(updatePricing);

  if (countryEl) {
    countryEl.addEventListener("change", syncPaymentMethodsForCountry);
    countryEl.addEventListener("input", syncPaymentMethodsForCountry);
  }

  if (paymentOptionsEl) {
    paymentOptionsEl.addEventListener("click", function (event) {
      var option = event.target && event.target.closest ? event.target.closest(".payment-option") : null;
      if (!option || !paymentOptionsEl.contains(option) || option.disabled || option.hidden) return;
      setActiveProvider(option.getAttribute("data-provider"));
      updatePricing();
    });
  }

  async function detectCountry() {
    if (!countryEl || countryEl.value) return;
    try {
      var response = await fetch("/.netlify/functions/payment-locale", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      var data = await response.json().catch(function () { return null; });
      if (!response.ok || !data || data.ok !== true || !data.country) return;
      var detected = normalizeSchoolCountry(data.country || data.countryCode);
      var allowed = Array.prototype.slice.call(countryEl.options || []).some(function (option) {
        return clean(option.value).toLowerCase() === detected.toLowerCase();
      });
      countryEl.value = allowed ? detected : "Other";
    } catch (_error) {
      return;
    } finally {
      if (countryEl && !countryEl.value) countryEl.value = "Other";
      syncPaymentMethodsForCountry();
    }
  }
  detectCountry().catch(function () { return null; });
  syncPaymentMethodsForCountry();
  updateAdminPhoneHelper();

  if (!form) return;

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setStatus("", false);
    if (!hasMinSeatsConfigured()) {
      setStatus("School pricing is not loaded yet. Please refresh and try again.", true);
      return;
    }
    var seatCount = Math.trunc(Number(seatCountEl && seatCountEl.value || 0));
    if (!Number.isFinite(seatCount) || seatCount < MIN_SEATS) {
      setStatus("Minimum seat count is " + String(MIN_SEATS) + ".", true);
      return;
    }

    var payload = {
      schoolName: clean(schoolNameEl && schoolNameEl.value),
      adminName: clean(adminNameEl && adminNameEl.value),
      adminEmail: clean(adminEmailEl && adminEmailEl.value),
      adminPhone: clean(adminPhoneEl && adminPhoneEl.value),
      country: selectedCountry(),
      provider: currentProvider(),
      seatCount: seatCount,
      courseSlug: "prompt-to-profit",
      affiliateCode: resolveAffiliateCode(),
    };
    if (!payload.country) {
      setStatus("Select your country before continuing.", true);
      return;
    }
    if (!payload.schoolName || !payload.adminName || !payload.adminEmail || !payload.adminPhone) {
      setStatus("All fields are required.", true);
      return;
    }

    btn.disabled = true;
    btn.textContent = "Preparing payment...";
    try {
      payload.recaptchaToken = await window.recaptchaHelper.getToken("school_create_payment");
      var response = await fetch("/.netlify/functions/school-create-payment", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      var data = await response.json().catch(function () {
        return null;
      });
      if (!response.ok || !data || data.ok !== true) {
        throw new Error((data && data.error) || "Could not create school payment.");
      }
      if (!data.checkoutUrl) throw new Error("Missing payment checkout URL.");
      window.location.href = String(data.checkoutUrl);
    } catch (error) {
      setStatus(error.message || "Could not continue to payment.", true);
      btn.disabled = false;
      btn.textContent = "Continue to Payment";
    }
  });
})();
