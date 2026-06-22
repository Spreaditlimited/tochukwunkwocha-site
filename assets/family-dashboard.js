(function () {
  var loadingEl = document.getElementById("familyLoading");
  var errorEl = document.getElementById("familyError");
  var contentEl = document.getElementById("familyContent");
  var gridEl = document.getElementById("familyChildrenGrid");
  var emptyEl = document.getElementById("familyEmpty");
  var seatSummaryEl = document.getElementById("familySeatSummary");
  var accountNameEl = document.getElementById("familyAccountName");
  var accountEmailEl = document.getElementById("familyAccountEmail");
  var enrollToggleEl = document.getElementById("familyEnrollToggle");
  var enrollPanelEl = document.getElementById("familyEnrollPanel");
  var enrollCloseEl = document.getElementById("familyEnrollClose");
  var enrollFormEl = document.getElementById("familyEnrollForm");
  var enrollCourseFieldEl = document.getElementById("familyEnrollCourseField");
  var enrollCourseEl = document.getElementById("familyEnrollCourse");
  var enrollBatchFieldEl = document.getElementById("familyEnrollBatchField");
  var enrollBatchEl = document.getElementById("familyEnrollBatch");
  var enrollCountryEl = document.getElementById("familyEnrollCountry");
  var enrollChildrenEl = document.getElementById("familyEnrollChildren");
  var enrollAddChildEl = document.getElementById("familyEnrollAddChild");
  var enrollSummaryEl = document.getElementById("familyEnrollSummary");
  var enrollPaymentMethodEl = document.getElementById("familyEnrollPaymentMethod");
  var enrollSubmitEl = document.getElementById("familyEnrollSubmit");
  var enrollMessageEl = document.getElementById("familyEnrollMessage");
  var maxChildren = 5;
  var selectedCourseData = null;
  var loadingEnrollmentOptions = false;
  var familySeatBalances = [];
  var preferredSeatBalance = null;
  var batchSwitchEnrollments = [];

  var dashboardCourses = [
    { slug: "prompt-to-profit-holiday", label: "Prompt to Profit Holiday", explicitBatch: true },
    { slug: "prompt-to-profit", label: "Prompt to Profit", explicitBatch: false },
    { slug: "prompt-to-production", label: "Prompt to Profit Advanced", explicitBatch: false },
  ];

  function setVisible(el, visible) {
    if (!el) return;
    el.hidden = !visible;
    el.classList.toggle("hidden", !visible);
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] || ch;
    });
  }

  function courseName(slug) {
    var map = {
      "prompt-to-profit": "Prompt to Profit",
      "prompt-to-production": "Prompt to Profit Advanced",
      "prompt-to-profit-holiday": "Prompt to Profit Holiday",
      "ai-for-everyday-business-owners": "AI for Everyday Business Owners",
    };
    return map[String(slug || "").toLowerCase()] || String(slug || "Course");
  }

  function formatNgnMinor(minor) {
    var amount = Number(minor || 0) / 100;
    if (!Number.isFinite(amount)) return "";
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);
  }

  function selectedCountry() {
    return String((enrollCountryEl && enrollCountryEl.value) || "Nigeria").trim() || "Nigeria";
  }

  function isNigeriaCountry(value) {
    var text = String(value || "").trim().toLowerCase();
    return text === "ng" || text === "nga" || text === "nigeria";
  }

  function selectedPurchaseProvider() {
    return isNigeriaCountry(selectedCountry()) ? "paystack" : "stripe";
  }

  function paymentProviderLabel(provider) {
    var key = String(provider || "").trim().toLowerCase();
    if (key === "stripe") return "Stripe";
    if (key === "manual_transfer" || key === "manual" || key === "bank_transfer") return "Bank Transfer";
    if (key === "paypal") return "PayPal";
    return "Paystack";
  }

  function selectedPaymentProvider() {
    var balance = selectedSeatBalance() || preferredBalanceForCourse();
    if (!balance || selectedAvailableSeats() < enrollmentSeatCount()) return selectedPurchaseProvider();
    if (balance && balance.paymentProvider) return String(balance.paymentProvider || "");
    return "paystack";
  }

  function updateEnrollmentPaymentMethod() {
    if (!enrollPaymentMethodEl) return;
    enrollPaymentMethodEl.textContent = "Payment method: " + paymentProviderLabel(selectedPaymentProvider());
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

  function displayBatchLabel(_batch, index) {
    return "Batch " + String(index + 1);
  }

  function switchOptionForSeat(row) {
    var courseSlug = String(row && row.courseSlug || "").trim().toLowerCase();
    var batchKey = String(row && row.batchKey || "").trim().toLowerCase();
    return (batchSwitchEnrollments || []).find(function (item) {
      return (
        String(item && item.sourceType || "").trim().toLowerCase() === "family" &&
        String(item && item.courseSlug || "").trim().toLowerCase() === courseSlug &&
        String(item && item.batchKey || "").trim().toLowerCase() === batchKey &&
        item &&
        item.canSwitch &&
        Array.isArray(item.options) &&
        item.options.length > 0
      );
    }) || null;
  }

  function safeId(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function renderBatchSwitchControl(row) {
    var sw = switchOptionForSeat(row);
    if (!sw) return "";
    var id = "familyBatchSwitch_" + safeId(sw.sourceId || sw.batchKey);
    var options = sw.options.map(function (option) {
      var remaining = option.remainingSeats !== null && option.remainingSeats !== undefined
        ? " - " + String(option.remainingSeats) + " seat" + (Number(option.remainingSeats) === 1 ? "" : "s") + " left"
        : "";
      return '<option value="' + escapeHtml(option.batchKey) + '">' + escapeHtml(option.batchLabel || option.batchKey) + (option.batchStartText ? " - Starts " + escapeHtml(option.batchStartText) : "") + escapeHtml(remaining) + "</option>";
    }).join("");
    return [
      '<div class="family-batch-switch-panel mt-3 rounded-lg border border-amber-400/25 bg-amber-500/10 p-3" data-family-batch-switch-wrap>',
      '<p class="text-xs font-bold uppercase tracking-wide text-amber-100">Change Batch</p>',
      '<div class="mt-2 flex flex-col gap-2 sm:flex-row">',
      '<select id="' + escapeHtml(id) + '" data-family-batch-switch-select class="picker-select family-batch-switch-select text-xs">' + options + "</select>",
      '<button type="button" data-family-batch-switch-submit data-source-type="' + escapeHtml(sw.sourceType) + '" data-source-id="' + escapeHtml(sw.sourceId) + '" data-select-id="' + escapeHtml(id) + '" class="batch-switch-button">Change</button>',
      "</div>",
      '<p data-family-batch-switch-status class="mt-2 text-xs text-amber-100/80"></p>',
      "</div>",
    ].join("");
  }

  function loadBatchSwitchOptions() {
    return fetch("/.netlify/functions/user-batch-switch-options", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          if (!res.ok || !json || !json.ok) return [];
          return Array.isArray(json.enrollments) ? json.enrollments : [];
        });
      })
      .catch(function () {
        return [];
      });
  }

  function submitBatchSwitch(sourceType, sourceId, targetBatchKey) {
    return fetch("/.netlify/functions/user-batch-switch", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sourceType: sourceType, sourceId: sourceId, targetBatchKey: targetBatchKey }),
    })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not change batch.");
          return json;
        });
      });
  }

  function setEnrollmentMessage(message, tone) {
    if (!enrollMessageEl) return;
    enrollMessageEl.textContent = message || "";
    enrollMessageEl.className = "text-sm font-semibold";
    if (!message) {
      enrollMessageEl.classList.add("hidden");
      return;
    }
    enrollMessageEl.classList.remove("hidden");
    enrollMessageEl.classList.add(tone === "error" ? "text-red-700" : "text-brand-700");
  }

  function paystackTotalForBase(baseMinor) {
    var courseMinor = Math.max(0, Math.round(Number(baseMinor || 0)));
    var vatPercent = Number(selectedCourseData && selectedCourseData.coursePricing && selectedCourseData.coursePricing.vatPercent);
    var safeVatPercent = Number.isFinite(vatPercent) && vatPercent >= 0 ? vatPercent : 7.5;
    var vatMinor = Math.round((courseMinor * safeVatPercent) / 100);
    var targetMinor = courseMinor + vatMinor;
    var applicableAtPrice = Math.round(targetMinor * 0.015) + (targetMinor < 250000 ? 0 : 10000);
    if (applicableAtPrice > 200000) return targetMinor + 200000;
    return Math.ceil(((targetMinor + (targetMinor < 250000 ? 0 : 10000)) / (1 - 0.015)) + 1);
  }

  function groupEnrollmentUnitPriceMinor(courseSlug, standardUnitMinor, seats) {
    var slug = String(courseSlug || "").trim().toLowerCase();
    var count = Math.max(1, Math.round(Number(seats || 1)));
    if (slug === "prompt-to-profit-holiday" && count >= 10) return 900000;
    return Math.max(0, Math.round(Number(standardUnitMinor || 0)));
  }

  function groupEnrollmentBaseAmountMinor(courseSlug, standardUnitMinor, seats) {
    var count = Math.max(1, Math.round(Number(seats || 1)));
    return groupEnrollmentUnitPriceMinor(courseSlug, standardUnitMinor, count) * count;
  }

  function groupDiscountText(courseSlug, standardUnitMinor, seats) {
    var count = Math.max(1, Math.round(Number(seats || 1)));
    var standard = Math.max(0, Math.round(Number(standardUnitMinor || 0)));
    var discounted = groupEnrollmentUnitPriceMinor(courseSlug, standard, count);
    if (String(courseSlug || "").trim().toLowerCase() !== "prompt-to-profit-holiday" || count < 10 || discounted >= standard) return "";
    var savings = (standard - discounted) * count;
    return " Group discount applied: " + formatNgnMinor(discounted) + " per seat. You save " + formatNgnMinor(savings) + ".";
  }

  function firstAvailableSeatBalance() {
    for (var i = 0; i < familySeatBalances.length; i += 1) {
      var row = familySeatBalances[i] || {};
      if (Math.max(0, Number(row.seatsAvailable || 0)) > 0) return row;
    }
    return null;
  }

  function preferredBalanceForCourse() {
    var courseSlug = String((enrollCourseEl && enrollCourseEl.value) || "").trim().toLowerCase();
    if (preferredSeatBalance && String(preferredSeatBalance.courseSlug || "").trim().toLowerCase() === courseSlug) {
      return preferredSeatBalance;
    }
    for (var i = 0; i < familySeatBalances.length; i += 1) {
      var row = familySeatBalances[i] || {};
      if (String(row.courseSlug || "").trim().toLowerCase() !== courseSlug) continue;
      if (Math.max(0, Number(row.seatsAvailable || 0)) > 0) return row;
    }
    return null;
  }

  function selectedBatchKey() {
    return String((enrollBatchEl && enrollBatchEl.value) || "").trim();
  }

  function selectedBatch() {
    if (!selectedCourseData || !enrollBatchEl) return null;
    var batchKey = selectedBatchKey();
    var batches = Array.isArray(selectedCourseData.batches) ? selectedCourseData.batches : [];
    for (var i = 0; i < batches.length; i += 1) {
      if (String(batches[i].batchKey || "") === batchKey) return batches[i];
    }
    if (batchKey) {
      var courseSlug = String((enrollCourseEl && enrollCourseEl.value) || "").trim().toLowerCase();
      for (var j = 0; j < familySeatBalances.length; j += 1) {
        var row = familySeatBalances[j] || {};
        if (String(row.courseSlug || "").trim().toLowerCase() !== courseSlug) continue;
        if (String(row.batchKey || "").trim() !== batchKey) continue;
        return {
          batchKey: row.batchKey,
          batchLabel: row.batchLabel || row.batchKey,
          paystackAmountMinor: selectedCourseData.coursePricing && selectedCourseData.coursePricing.priceNgnMinor,
        };
      }
    }
    return selectedCourseData.activeBatch || null;
  }

  function selectedSeatBalance() {
    var courseSlug = String((enrollCourseEl && enrollCourseEl.value) || "").trim().toLowerCase();
    var batchKey = selectedBatchKey();
    for (var i = 0; i < familySeatBalances.length; i += 1) {
      var row = familySeatBalances[i] || {};
      if (String(row.courseSlug || "").trim().toLowerCase() !== courseSlug) continue;
      if (String(row.batchKey || "").trim() !== batchKey) continue;
      return row;
    }
    return null;
  }

  function selectedAvailableSeats() {
    var balance = selectedSeatBalance();
    return Math.max(0, Number(balance && balance.seatsAvailable || 0));
  }

  function selectedLearnersFitPurchasedSeats() {
    return selectedAvailableSeats() >= enrollmentSeatCount();
  }

  function updateEnrollmentPickerVisibility() {
    var shouldShow = !selectedLearnersFitPurchasedSeats();
    if (shouldShow && enrollBatchEl) {
      var selectedOption = enrollBatchEl.options[enrollBatchEl.selectedIndex];
      if (selectedOption && selectedOption.getAttribute("data-purchased-seat-only") === "true") {
        for (var i = 0; i < enrollBatchEl.options.length; i += 1) {
          if (enrollBatchEl.options[i].getAttribute("data-purchased-seat-only") !== "true") {
            enrollBatchEl.value = enrollBatchEl.options[i].value;
            break;
          }
        }
      }
    }
    setVisible(enrollCourseFieldEl, shouldShow);
    setVisible(enrollBatchFieldEl, shouldShow);
  }

  function updateSubmitLabel() {
    if (!enrollSubmitEl || enrollSubmitEl.disabled) return;
    enrollSubmitEl.textContent = selectedLearnersFitPurchasedSeats() ? "Assign Learners" : "Purchase Seats";
  }

  function seatTotals() {
    return familySeatBalances.reduce(function (totals, row) {
      var purchased = Math.max(0, Number(row && row.seatsPurchased || 0));
      var used = Math.max(0, Number(row && row.seatsUsed || 0));
      var available = Math.max(0, Number(row && row.seatsAvailable || 0));
      totals.purchased += purchased;
      totals.used += used;
      totals.available += available;
      return totals;
    }, { purchased: 0, used: 0, available: 0 });
  }

  function renderSeatSummary() {
    if (!seatSummaryEl) return;
    var totals = seatTotals();
    var hasSeats = totals.purchased > 0 || totals.used > 0 || totals.available > 0;
    var programRows = familySeatBalances.filter(function (row) {
      return Math.max(0, Number(row && row.seatsPurchased || 0)) > 0 || Math.max(0, Number(row && row.seatsAvailable || 0)) > 0;
    });
    var programHtml = programRows.length
      ? [
          '<div class="mt-4 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">',
          programRows.map(function (row) {
            var purchased = Math.max(0, Number(row && row.seatsPurchased || 0));
            var used = Math.max(0, Number(row && row.seatsUsed || 0));
            var available = Math.max(0, Number(row && row.seatsAvailable || 0));
            var batch = row.batchLabel || row.batchKey || "Current batch";
            return [
              '<div class="flex flex-col gap-1 border-b border-white/10 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">',
              '<div><p class="text-sm font-bold text-white">' + escapeHtml(courseName(row.courseSlug)) + '</p><p class="text-xs font-medium text-slate-400">' + escapeHtml(batch) + "</p></div>",
              '<p class="text-sm font-semibold text-slate-300"><span class="text-emerald-200">' + String(available) + " available</span> <span class=\"text-slate-500\">/</span> " + String(used) + " assigned <span class=\"text-slate-500\">/</span> " + String(purchased) + " purchased</p>",
              renderBatchSwitchControl(row),
              "</div>",
            ].join("");
          }).join(""),
          "</div>",
        ].join("")
      : "";
    seatSummaryEl.innerHTML = [
      '<div class="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-[#0d1117]/80 px-6 py-6 text-center shadow-[0_20px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-7 sm:text-left">',
      '<div class="flex-1">',
      '<p class="text-xs font-bold uppercase tracking-wide text-indigo-300">Seat Balance</p>',
      '<h1 class="mt-1 font-heading text-2xl font-extrabold text-white">Your learners</h1>',
      '<p class="mt-1 text-sm text-slate-300">' + (hasSeats ? "Seats reduce automatically as you assign learners." : "Purchase seats from the enrollment page, then assign learners here.") + "</p>",
      "</div>",
      '<div class="flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row sm:items-center">',
      '<button type="button" data-family-seat-assign class="inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-500 sm:w-auto">Assign Learners</button>',
      '<a href="/dashboard/courses/" class="inline-flex w-full items-center justify-center rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-100 hover:bg-emerald-500/20 sm:w-auto">My own courses</a>',
      "</div>",
      "</div>",
      '<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">',
      '<article class="rounded-xl border border-blue-400/25 bg-blue-500/10 p-4"><p class="text-xs font-bold uppercase tracking-wide text-blue-200">Purchased</p><p class="mt-1 text-2xl font-extrabold text-white">' + String(totals.purchased) + "</p></article>",
      '<article class="rounded-xl border border-amber-400/25 bg-amber-500/10 p-4"><p class="text-xs font-bold uppercase tracking-wide text-amber-200">Assigned</p><p class="mt-1 text-2xl font-extrabold text-white">' + String(totals.used) + "</p></article>",
      '<article class="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-4"><p class="text-xs font-bold uppercase tracking-wide text-emerald-200">Available</p><p class="mt-1 text-2xl font-extrabold text-white">' + String(totals.available) + "</p></article>",
      "</div>",
      programHtml,
    ].join("");
    setVisible(seatSummaryEl, true);
    var assignBtn = seatSummaryEl.querySelector("[data-family-seat-assign]");
    if (assignBtn) {
      assignBtn.addEventListener("click", function () {
        setEnrollmentPanelOpen(true);
      });
    }
  }

  function enrollmentSeatCount() {
    if (!enrollChildrenEl) return 1;
    return Math.max(1, enrollChildrenEl.querySelectorAll("[data-family-enroll-child]").length || 1);
  }

  function enrollmentChildren() {
    if (!enrollChildrenEl) return [];
    return Array.prototype.slice.call(enrollChildrenEl.querySelectorAll("[data-family-enroll-child]")).map(function (row) {
      return {
        fullName: String((row.querySelector("[data-family-enroll-name]") || {}).value || "").trim(),
        age: String((row.querySelector("[data-family-enroll-age]") || {}).value || "").trim(),
        classLevel: String((row.querySelector("[data-family-enroll-class]") || {}).value || "").trim(),
      };
    });
  }

  function updateEnrollmentSummary() {
    if (!enrollSummaryEl) return;
    if (loadingEnrollmentOptions) {
      enrollSummaryEl.textContent = "Loading program pricing...";
      updateEnrollmentPaymentMethod();
      setVisible(enrollCourseFieldEl, false);
      setVisible(enrollBatchFieldEl, false);
      return;
    }
    var batch = selectedBatch();
    if (!batch) {
      enrollSummaryEl.textContent = "Choose an available batch to see the total.";
      updateEnrollmentPaymentMethod();
      setVisible(enrollCourseFieldEl, true);
      setVisible(enrollBatchFieldEl, true);
      return;
    }
    var coursePricing = selectedCourseData && selectedCourseData.coursePricing ? selectedCourseData.coursePricing : {};
    var basePerChild = Number(coursePricing.priceNgnMinor || 0) > 0
      ? Number(coursePricing.priceNgnMinor || 0)
      : Number(batch.paystackAmountMinor || 0);
    var seats = enrollmentSeatCount();
    var available = selectedAvailableSeats();
    updateEnrollmentPickerVisibility();
    if (available >= seats) {
      enrollSummaryEl.textContent = String(available) + " purchased seat" + (available === 1 ? "" : "s") + " available. This will assign " + String(seats) + " learner" + (seats === 1 ? "" : "s") + " without another payment.";
      updateEnrollmentPaymentMethod();
      if (enrollSubmitEl && !enrollSubmitEl.disabled) enrollSubmitEl.textContent = "Assign Learners";
      return;
    }
    var selectedCourseSlug = enrollCourseEl && enrollCourseEl.value;
    var provider = selectedPurchaseProvider();
    var totalMinor = paystackTotalForBase(groupEnrollmentBaseAmountMinor(selectedCourseSlug, basePerChild, seats));
    var discountText = groupDiscountText(selectedCourseSlug, basePerChild, seats);
    var totalLabel = provider === "stripe" ? "Checkout via Stripe" : "Total (Paystack): " + formatNgnMinor(totalMinor);
    enrollSummaryEl.textContent = available > 0
      ? String(available) + " purchased seat" + (available === 1 ? "" : "s") + " available. " + String(seats) + " learner" + (seats === 1 ? "" : "s") + " selected - " + totalLabel + discountText
      : String(seats) + " learner" + (seats === 1 ? "" : "s") + " selected - " + totalLabel + discountText;
    updateEnrollmentPaymentMethod();
    if (enrollSubmitEl && !enrollSubmitEl.disabled) enrollSubmitEl.textContent = "Purchase Seats";
  }

  function updateAddChildState() {
    if (!enrollAddChildEl) return;
    var seats = enrollmentSeatCount();
    enrollAddChildEl.disabled = seats >= maxChildren;
    enrollAddChildEl.classList.toggle("opacity-60", seats >= maxChildren);
  }

  function addEnrollmentChildRow() {
    if (!enrollChildrenEl) return;
    var nextIndex = enrollmentSeatCount() + 1;
    if (nextIndex > maxChildren) return;
    var row = document.createElement("div");
    row.className = "rounded-xl border border-white/10 bg-white/[0.04] p-4";
    row.setAttribute("data-family-enroll-child", "true");
    row.innerHTML = [
      '<div class="flex items-center justify-between gap-3">',
      '<h4 class="text-sm font-bold text-white">Learner ' + String(nextIndex) + "</h4>",
      '<button type="button" data-family-enroll-remove class="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10">Remove</button>',
      "</div>",
      '<div class="mt-3 grid gap-3 md:grid-cols-3">',
      '<label class="block md:col-span-1"><span class="text-xs font-bold text-slate-300">Learner full name</span><input data-family-enroll-name class="mt-1 w-full rounded-lg border border-white/15 bg-[#060b14]/70 px-3 py-2.5 text-sm font-semibold text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" autocomplete="off" placeholder="E.g. Ada Johnson" /></label>',
      '<label class="block"><span class="text-xs font-bold text-slate-300">Age</span><input data-family-enroll-age class="mt-1 w-full rounded-lg border border-white/15 bg-[#060b14]/70 px-3 py-2.5 text-sm font-semibold text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" inputmode="numeric" placeholder="10" /></label>',
      '<label class="block"><span class="text-xs font-bold text-slate-300">Class / level</span><input data-family-enroll-class class="mt-1 w-full rounded-lg border border-white/15 bg-[#060b14]/70 px-3 py-2.5 text-sm font-semibold text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" autocomplete="off" placeholder="Primary 5, JSS 1" /></label>',
      "</div>",
    ].join("");
    enrollChildrenEl.appendChild(row);
    renumberEnrollmentRows();
    updateAddChildState();
    updateEnrollmentSummary();
  }

  function renumberEnrollmentRows() {
    if (!enrollChildrenEl) return;
    Array.prototype.slice.call(enrollChildrenEl.querySelectorAll("[data-family-enroll-child]")).forEach(function (row, index) {
      var title = row.querySelector("h4");
      var remove = row.querySelector("[data-family-enroll-remove]");
      if (title) title.textContent = "Learner " + String(index + 1);
      if (remove) {
        remove.hidden = enrollmentSeatCount() <= 1;
        remove.classList.toggle("hidden", enrollmentSeatCount() <= 1);
      }
    });
  }

  function resetEnrollmentChildren() {
    if (enrollChildrenEl) enrollChildrenEl.innerHTML = "";
    addEnrollmentChildRow();
  }

  function populateBatchOptions(data) {
    if (!enrollBatchEl) return;
    enrollBatchEl.innerHTML = "";
    var batches = Array.isArray(data.batches) ? data.batches : [];
    if (data.activeBatch && !batches.length) batches = [data.activeBatch];
    batches = batches.filter(function (batch) { return batch && !batch.isFull; }).sort(compareBatchStart);
    var preferredBalance = preferredBalanceForCourse();
    if (preferredBalance && preferredBalance.batchKey) {
      var hasPreferredBatch = batches.some(function (batch) {
        return String(batch && batch.batchKey || "").trim() === String(preferredBalance.batchKey || "").trim();
      });
      if (!hasPreferredBatch) {
        batches.unshift({
          batchKey: preferredBalance.batchKey,
          batchLabel: preferredBalance.batchLabel || preferredBalance.batchKey,
          paystackAmountMinor: data.coursePricing && data.coursePricing.priceNgnMinor,
          purchasedSeatOnly: true,
        });
      }
    }
    if (!batches.length) {
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = data.isEnrollmentLocked ? "Enrollment is locked" : "No open batch available";
      enrollBatchEl.appendChild(empty);
      enrollBatchEl.disabled = true;
      if (enrollSubmitEl) enrollSubmitEl.disabled = true;
      return;
    }
    batches.forEach(function (batch, index) {
      var option = document.createElement("option");
      option.value = batch.batchKey || "";
      if (batch.purchasedSeatOnly) option.setAttribute("data-purchased-seat-only", "true");
      option.textContent = displayBatchLabel(batch, index);
      var parsedStart = parseBatchStart(batch.batchStartAt);
      if (parsedStart) {
        option.textContent += " - Starts " + formatDayTime(parsedStart, "Africa/Lagos") + " WAT";
      }
      var remainingSeats = batch.remainingSeats;
      if (remainingSeats !== null && remainingSeats !== undefined && remainingSeats !== "" && Number.isFinite(Number(remainingSeats))) {
        option.textContent += " - " + String(remainingSeats) + " seat" + (Number(remainingSeats) === 1 ? "" : "s") + " left";
      }
      enrollBatchEl.appendChild(option);
    });
    if (preferredBalance && preferredBalance.batchKey) enrollBatchEl.value = preferredBalance.batchKey;
    enrollBatchEl.disabled = batches.length <= 1;
    if (enrollSubmitEl) enrollSubmitEl.disabled = !!data.isEnrollmentLocked || !(data.familyEnrollment && data.familyEnrollment.enabled);
  }

  function loadEnrollmentOptions() {
    if (!enrollCourseEl) return Promise.resolve();
    var courseSlug = String(enrollCourseEl.value || "prompt-to-profit-holiday");
    var course = dashboardCourses.find(function (item) { return item.slug === courseSlug; }) || dashboardCourses[0];
    loadingEnrollmentOptions = true;
    selectedCourseData = null;
    setEnrollmentMessage("", "info");
    updateEnrollmentSummary();
    var url = course.explicitBatch
      ? "/.netlify/functions/course-open-batches?course_slug=" + encodeURIComponent(course.slug)
      : "/.netlify/functions/course-active-batch?course_slug=" + encodeURIComponent(course.slug);
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not load program options.");
          return json;
        });
      })
      .then(function (json) {
        maxChildren = Number(json.familyEnrollment && json.familyEnrollment.maxChildren) || maxChildren;
        selectedCourseData = json;
        populateBatchOptions(json);
        if (!(json.familyEnrollment && json.familyEnrollment.enabled)) {
          setEnrollmentMessage("Group enrollment is not available for this program.", "error");
        }
      })
      .catch(function (error) {
        selectedCourseData = null;
        populateBatchOptions({ batches: [] });
        setEnrollmentMessage(error.message || "Could not load program options.", "error");
      })
      .then(function () {
        loadingEnrollmentOptions = false;
        updateAddChildState();
        updateEnrollmentSummary();
      });
  }

  function setEnrollmentPanelOpen(open) {
    setVisible(enrollPanelEl, open);
    if (!open) return;
    preferredSeatBalance = firstAvailableSeatBalance();
    if (preferredSeatBalance && enrollCourseEl) enrollCourseEl.value = preferredSeatBalance.courseSlug || enrollCourseEl.value;
    loadEnrollmentOptions();
  }

  function statusLabel(value) {
    var status = String(value || "").replace(/_/g, " ");
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Pending";
  }

  function childCard(child) {
    var name = escapeHtml(child.fullName || "Learner");
    var accessCode = escapeHtml(child.accessCode || "Pending");
    var course = escapeHtml(courseName(child.courseSlug));
    var batch = escapeHtml(child.batchLabel || child.batchKey || "Current program");
    var enrollmentStatus = escapeHtml(statusLabel(child.enrollmentStatus || child.status));
    var age = child.age ? '<span class="rounded-full border border-indigo-400/25 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-100">Age ' + escapeHtml(child.age) + "</span>" : "";
    var classLevel = child.classLevel ? '<span class="rounded-full border border-indigo-400/25 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-100">' + escapeHtml(child.classLevel) + "</span>" : "";
    return [
      '<article class="rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-sm">',
      '<div class="flex items-start justify-between gap-3">',
      "<div>",
      '<h2 class="font-heading text-lg font-bold text-white">' + name + "</h2>",
      '<p class="mt-1 text-sm text-slate-300">' + course + "</p>",
      "</div>",
      '<span class="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-100">' + enrollmentStatus + "</span>",
      "</div>",
      '<div class="mt-3 flex flex-wrap gap-2">' + age + classLevel + "</div>",
      '<div class="mt-5 rounded-lg border border-indigo-400/25 bg-indigo-500/10 p-4">',
      '<p class="text-xs font-bold uppercase tracking-wide text-indigo-200">Learner Access Code</p>',
      '<p class="mt-1 font-mono text-2xl font-extrabold tracking-wide text-white">' + accessCode + "</p>",
      "</div>",
      '<dl class="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">',
      "<div><dt class=\"font-semibold text-slate-400\">Batch</dt><dd class=\"mt-1 text-slate-100\">" + batch + "</dd></div>",
      "<div><dt class=\"font-semibold text-slate-400\">Progress</dt><dd class=\"mt-1 text-slate-100\">Available soon</dd></div>",
      "</dl>",
      "</article>",
    ].join("");
  }

  function render(data) {
    var account = data.account || {};
    var family = data.family || null;
    var children = Array.isArray(data.children) ? data.children : [];
    familySeatBalances = Array.isArray(data.seats) ? data.seats : [];
    if (accountNameEl) accountNameEl.textContent = account.fullName || "";
    if (accountEmailEl) accountEmailEl.textContent = account.email || "";
    if (enrollToggleEl) enrollToggleEl.textContent = "Assign Learners";
    renderSeatSummary();
    if (gridEl) gridEl.innerHTML = children.map(childCard).join("");
    setVisible(emptyEl, !children.length);
    setVisible(contentEl, true);
  }

  if (enrollToggleEl) {
    enrollToggleEl.addEventListener("click", function () {
      var isOpen = !!(enrollPanelEl && !enrollPanelEl.hidden && !enrollPanelEl.classList.contains("hidden"));
      setEnrollmentPanelOpen(!isOpen);
    });
  }

  if (enrollCloseEl) {
    enrollCloseEl.addEventListener("click", function () {
      setEnrollmentPanelOpen(false);
    });
  }

  if (enrollCourseEl) {
    enrollCourseEl.addEventListener("change", function () {
      loadEnrollmentOptions();
    });
  }

  if (enrollBatchEl) {
    enrollBatchEl.addEventListener("change", updateEnrollmentSummary);
  }

  if (enrollCountryEl) {
    enrollCountryEl.addEventListener("change", updateEnrollmentSummary);
  }

  if (enrollAddChildEl) {
    enrollAddChildEl.addEventListener("click", function () {
      addEnrollmentChildRow();
    });
  }

  if (enrollChildrenEl) {
    enrollChildrenEl.addEventListener("input", updateEnrollmentSummary);
    enrollChildrenEl.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var button = target.closest("[data-family-enroll-remove]");
      if (!button) return;
      var row = button.closest("[data-family-enroll-child]");
      if (row && enrollmentSeatCount() > 1) row.remove();
      renumberEnrollmentRows();
      updateAddChildState();
      updateEnrollmentSummary();
    });
  }

  if (enrollFormEl) {
    enrollFormEl.addEventListener("submit", function (event) {
      event.preventDefault();
      setEnrollmentMessage("", "info");
      var children = enrollmentChildren();
      if (!children.length || children.some(function (child) { return !child.fullName; })) {
        setEnrollmentMessage("Add each learner's full name before continuing.", "error");
        return;
      }
      var batch = selectedBatch();
      if (!batch) {
        setEnrollmentMessage("Choose an available batch before continuing.", "error");
        return;
      }
      if (enrollSubmitEl) {
        enrollSubmitEl.disabled = true;
        enrollSubmitEl.textContent = selectedLearnersFitPurchasedSeats() ? "Assigning..." : "Creating checkout...";
      }
      fetch("/.netlify/functions/family-enrollment-create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          courseSlug: enrollCourseEl ? enrollCourseEl.value : "prompt-to-profit-holiday",
          batchKey: batch.batchKey || null,
          country: selectedCountry(),
          children: children,
        }),
      })
        .then(function (res) {
          return res.json().catch(function () { return null; }).then(function (json) {
            if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not create checkout.");
            return json;
          });
        })
        .then(function (json) {
          if (json.usedExistingSeats) {
            setEnrollmentMessage("Learner access assigned from your purchased seats.", "ok");
            resetEnrollmentChildren();
            return fetch("/.netlify/functions/family-dashboard", { headers: { Accept: "application/json" } })
              .then(function (res) { return res.json().catch(function () { return null; }); })
              .then(function (fresh) {
                if (fresh && fresh.ok) render(fresh);
                setEnrollmentPanelOpen(false);
              });
          }
          if (json.checkoutUrl) {
            window.location.href = json.checkoutUrl;
            return;
          }
          throw new Error("Checkout link was not returned.");
        })
        .catch(function (error) {
          setEnrollmentMessage(error.message || "Could not create checkout.", "error");
          if (enrollSubmitEl) {
            enrollSubmitEl.disabled = false;
            updateSubmitLabel();
          }
        });
    });
  }

  resetEnrollmentChildren();

  if (contentEl) {
    contentEl.addEventListener("click", function (event) {
      var button = event.target && event.target.closest ? event.target.closest("[data-family-batch-switch-submit]") : null;
      if (!button) return;
      var wrap = button.closest("[data-family-batch-switch-wrap]");
      var status = wrap ? wrap.querySelector("[data-family-batch-switch-status]") : null;
      var selectId = String(button.getAttribute("data-select-id") || "");
      var select = selectId ? document.getElementById(selectId) : null;
      var targetBatchKey = String(select && select.value || "").trim();
      if (!targetBatchKey) {
        if (status) status.textContent = "Choose a batch.";
        return;
      }
      button.disabled = true;
      var previous = button.textContent;
      button.textContent = "Changing...";
      if (status) {
        status.textContent = "";
        status.className = "mt-2 text-xs text-amber-800/80";
      }
      submitBatchSwitch(button.getAttribute("data-source-type"), button.getAttribute("data-source-id"), targetBatchKey)
        .then(function (json) {
          if (status) {
            var label = json && json.newBatch && json.newBatch.batchLabel ? json.newBatch.batchLabel : "new batch";
            status.textContent = "Batch changed to " + label + ". Refreshing...";
            status.className = "mt-2 text-xs text-emerald-700";
          }
          return Promise.all([
            fetch("/.netlify/functions/family-dashboard", { headers: { Accept: "application/json" } }).then(function (res) { return res.json().catch(function () { return null; }); }),
            loadBatchSwitchOptions(),
          ]);
        })
        .then(function (results) {
          var fresh = results[0];
          batchSwitchEnrollments = results[1] || [];
          if (fresh && fresh.ok) render(fresh);
        })
        .catch(function (error) {
          if (status) {
            status.textContent = error.message || "Could not change batch.";
            status.className = "mt-2 text-xs text-red-700";
          }
        })
        .finally(function () {
          button.disabled = false;
          button.textContent = previous || "Change";
        });
    });
  }

  Promise.all([
    fetch("/.netlify/functions/family-dashboard", { headers: { Accept: "application/json" } })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
        if (!res.ok || !json || !json.ok) {
          var error = new Error((json && json.error) || "Could not load group enrollment dashboard.");
          error.status = res.status;
          throw error;
        }
        return json;
        });
      }),
    loadBatchSwitchOptions(),
  ])
    .then(function (results) {
      var json = results[0];
      batchSwitchEnrollments = results[1] || [];
      setVisible(loadingEl, false);
      render(json);
    })
    .catch(function (error) {
      setVisible(loadingEl, false);
      if (error && error.status === 401) {
        window.location.href = "/dashboard/login/?next=" + encodeURIComponent("/dashboard/family/");
        return;
      }
      if (errorEl) {
        errorEl.textContent = error.message || "Could not load group enrollment dashboard.";
        setVisible(errorEl, true);
      }
    });
})();
