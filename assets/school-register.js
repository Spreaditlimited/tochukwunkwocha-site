(function () {
  var form = document.getElementById("schoolRegisterForm");
  var schoolNameEl = document.getElementById("schoolName");
  var adminNameEl = document.getElementById("adminName");
  var adminEmailEl = document.getElementById("adminEmail");
  var adminPhoneEl = document.getElementById("adminPhone");
  var seatCountEl = document.getElementById("seatCount");
  var subtotalEl = document.getElementById("priceSubtotal");
  var vatEl = document.getElementById("priceVat");
  var totalEl = document.getElementById("priceTotal");
  var statusEl = document.getElementById("schoolRegisterStatus");
  var btn = document.getElementById("schoolRegisterBtn");
  var introEl = document.getElementById("schoolsPricingIntro");

  var MIN_SEATS = 50;
  var PRICE_PER_STUDENT_MINOR = 850000;
  var VAT_PERCENT = 7.5;
  var AFFILIATE_REF_KEY = "tn_affiliate_ref_code_v1";

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
    var subtotal = seats * PRICE_PER_STUDENT_MINOR;
    var vat = Math.round((subtotal * VAT_PERCENT) / 100);
    var total = subtotal + vat;
    return { seats: seats, subtotal: subtotal, vat: vat, total: total };
  }

  function updatePricing() {
    var p = pricingForSeats(seatCountEl && seatCountEl.value);
    if (subtotalEl) subtotalEl.textContent = "Subtotal: " + naira(p.subtotal);
    if (vatEl) vatEl.textContent = "VAT (" + String(VAT_PERCENT) + "%): " + naira(p.vat);
    if (totalEl) totalEl.textContent = "Total: " + naira(p.total);
  }

  if (seatCountEl) {
    seatCountEl.addEventListener("input", updatePricing);
    seatCountEl.addEventListener("change", updatePricing);
  }

  async function loadConfig() {
    try {
      var response = await fetch("/.netlify/functions/school-pricing-config", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      var data = await response.json().catch(function () {
        return null;
      });
      if (!response.ok || !data || data.ok !== true) return;
      var cfg = data.config || {};
      var minSeats = Number(cfg.minSeats || 0);
      var fee = Number(cfg.pricePerStudentMinor || 0);
      var vatPercent = Number(cfg.vatPercent || 0);
      if (Number.isFinite(minSeats) && minSeats > 0) MIN_SEATS = Math.trunc(minSeats);
      if (Number.isFinite(fee) && fee > 0) PRICE_PER_STUDENT_MINOR = Math.trunc(fee);
      if (Number.isFinite(vatPercent) && vatPercent >= 0) VAT_PERCENT = vatPercent;
      if (introEl) {
        introEl.textContent =
          "Bulk school access starts at " +
          String(MIN_SEATS) +
          " students. Price is " +
          naira(PRICE_PER_STUDENT_MINOR) +
          " per student + VAT.";
      }
      if (seatCountEl) {
        seatCountEl.min = String(MIN_SEATS);
        if (Number(seatCountEl.value || 0) < MIN_SEATS) seatCountEl.value = String(MIN_SEATS);
      }
      updatePricing();
    } catch (_error) {}
  }
  loadConfig().finally(updatePricing);

  if (!form) return;

  if (btn) {
    btn.disabled = false;
    btn.removeAttribute("aria-disabled");
    btn.removeAttribute("title");
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setStatus("", false);
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
      seatCount: seatCount,
      courseSlug: "prompt-to-profit",
      affiliateCode: resolveAffiliateCode(),
    };
    if (!payload.schoolName || !payload.adminName || !payload.adminEmail || !payload.adminPhone) {
      setStatus("All fields are required.", true);
      return;
    }

    btn.disabled = true;
    btn.textContent = "Preparing payment...";
    try {
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
