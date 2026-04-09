(function () {
  var form = document.getElementById("couponForm");
  if (!form) return;

  var messageEl = document.getElementById("couponMessage");
  var rowsEl = document.getElementById("couponRows");
  var saveBtn = document.getElementById("couponSaveBtn");
  var resetBtn = document.getElementById("couponResetBtn");
  var extendModal = null;
  var extendModalInput = null;
  var extendModalTitle = null;
  var extendModalSaveBtn = null;
  var extendModalCloseBtns = [];
  var extendModalTarget = null;
  var courseOptions = [];
  var courseLabelBySlug = {};

  var COURSE_SLUG_ALIASES = {
    "prompt-to-profit-for-schools": "prompt-to-profit-schools",
    "prompt-to-profit-school": "prompt-to-profit-schools",
  };
  var FALLBACK_COURSES = [
    { slug: "prompt-to-profit", label: "Prompt to Profit" },
    { slug: "prompt-to-production", label: "Prompt to Production" },
    { slug: "prompt-to-profit-schools", label: "Prompt to Profit for Schools" },
  ];

  var fields = {
    id: document.getElementById("couponId"),
    code: document.getElementById("couponCode"),
    description: document.getElementById("couponDescription"),
    discountType: document.getElementById("couponType"),
    percentOff: document.getElementById("couponPercentOff"),
    fixedNgnMinor: document.getElementById("couponFixedNgnMinor"),
    fixedGbpMinor: document.getElementById("couponFixedGbpMinor"),
    courseSlug: document.getElementById("couponCourseSlug"),
    maxUses: document.getElementById("couponMaxUses"),
    maxUsesPerEmail: document.getElementById("couponMaxUsesPerEmail"),
    startsAt: document.getElementById("couponStartsAt"),
    endsAt: document.getElementById("couponEndsAt"),
    isActive: document.getElementById("couponIsActive"),
  };

  var items = [];

  function setMessage(text, type) {
    if (!messageEl) return;
    var msg = String(text || "").trim();
    messageEl.textContent = msg;
    messageEl.classList.toggle("hidden", !msg);
    messageEl.classList.remove("border-rose-200", "bg-rose-50", "text-rose-800", "border-emerald-200", "bg-emerald-50", "text-emerald-800");
    if (!msg) return;
    if (type === "error") {
      messageEl.classList.add("border-rose-200", "bg-rose-50", "text-rose-800");
      return;
    }
    messageEl.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-800");
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toLocalDatetime(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    var d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      return raw.replace(" ", "T").slice(0, 16);
    }
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function validitySummary(item) {
    var starts = toLocalDatetime(item && item.starts_at).replace("T", " ");
    var ends = toLocalDatetime(item && item.ends_at).replace("T", " ");
    if (!starts && !ends) return "No date window";
    if (!starts && ends) return "Ends: " + ends;
    if (starts && !ends) return "Starts: " + starts;
    return starts + " → " + ends;
  }

  function parseDateTimeParts(value) {
    var raw = String(value || "").trim();
    if (!raw) return null;
    var match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6] || "0"),
    };
  }

  function toWallClockMs(parts) {
    if (!parts) return null;
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  }

  function nowInLagosWallClockMs() {
    var now = new Date();
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);
    var lookup = {};
    parts.forEach(function (p) {
      if (p && p.type && p.value) lookup[p.type] = p.value;
    });
    return Date.UTC(
      Number(lookup.year || "0"),
      Number(lookup.month || "1") - 1,
      Number(lookup.day || "1"),
      Number(lookup.hour || "0"),
      Number(lookup.minute || "0"),
      Number(lookup.second || "0")
    );
  }

  function statusLabel(item) {
    var manuallyActive = Boolean(Number(item && item.is_active || 0));
    if (!manuallyActive) return "Inactive";
    var nowMs = nowInLagosWallClockMs();
    var startsMs = toWallClockMs(parseDateTimeParts(item && item.starts_at));
    var endsMs = toWallClockMs(parseDateTimeParts(item && item.ends_at));
    if (startsMs !== null && startsMs > nowMs) return "Not yet active";
    if (endsMs !== null && endsMs < nowMs) return "Expired";
    return "Active";
  }

  function parseNumber(value) {
    var raw = String(value || "").trim();
    if (!raw) return null;
    var n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function canonicalCourseSlug(value) {
    var slug = String(value || "").trim().toLowerCase();
    if (!slug || slug === "all") return "all";
    return COURSE_SLUG_ALIASES[slug] || slug;
  }

  function normalizeCourseItems(items) {
    var merged = {};
    (Array.isArray(items) ? items : []).forEach(function (item) {
      var slug = canonicalCourseSlug(item && item.slug);
      if (!slug || slug === "all") return;
      var label = String((item && item.label) || slug).trim();
      if (!merged[slug]) {
        merged[slug] = { slug: slug, label: label || slug };
      }
    });
    var result = Object.keys(merged)
      .map(function (slug) { return merged[slug]; })
      .sort(function (a, b) { return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0; });
    return result.length ? result : FALLBACK_COURSES.slice();
  }

  function ensureCourseOption(slug) {
    if (!fields.courseSlug) return;
    var value = canonicalCourseSlug(slug);
    if (!value || value === "all") return;
    var has = courseOptions.some(function (item) { return item.slug === value; });
    if (has) return;
    var label = courseLabelBySlug[value] || value;
    courseOptions.push({ slug: value, label: label });
    courseLabelBySlug[value] = label;
    setCourseOptions(fields.courseSlug.value || "all");
  }

  function setCourseOptions(selected) {
    if (!fields.courseSlug) return;
    var current = canonicalCourseSlug(selected || fields.courseSlug.value || "all") || "all";
    var options = ['<option value="all">All Courses</option>'].concat(
      courseOptions.map(function (item) {
        return '<option value="' + esc(item.slug) + '">' + esc(item.label) + "</option>";
      })
    );
    fields.courseSlug.innerHTML = options.join("");
    if (current !== "all") {
      var found = courseOptions.some(function (item) { return item.slug === current; });
      if (!found) ensureCourseOption(current);
    }
    fields.courseSlug.value = current;
  }

  function ensureExtendModal() {
    if (extendModal) return;
    document.body.insertAdjacentHTML(
      "beforeend",
      [
        '<div id="couponExtendModal" class="fixed inset-0 z-[90] hidden" aria-hidden="true">',
        '  <button type="button" class="absolute inset-0 bg-gray-900/70 backdrop-blur-sm" data-coupon-extend-close aria-label="Close"></button>',
        '  <div class="relative z-10 mx-auto flex h-full w-full max-w-2xl items-center justify-center p-4 sm:p-6">',
        '    <div class="w-full rounded-2xl border border-gray-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="couponExtendTitle">',
        '      <div class="flex items-start justify-between border-b border-gray-200 px-5 py-4 sm:px-6">',
        "        <div>",
        '          <p class="text-xs font-semibold uppercase tracking-wider text-brand-600">Coupon Validity</p>',
        '          <h3 id="couponExtendTitle" class="mt-1 text-xl font-heading font-bold text-gray-900">Set end date/time</h3>',
        '          <p class="mt-1 text-sm text-gray-500">Choose the new coupon end date/time (Lagos).</p>',
        "        </div>",
        '        <button type="button" class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700" data-coupon-extend-close aria-label="Close dialog">',
        '          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 6l12 12M6 18L18 6"/></svg>',
        "        </button>",
        "      </div>",
        '      <div class="px-5 py-5 sm:px-6">',
        '        <label class="block">',
        '          <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">Ends At (Lagos)</span>',
        '          <input id="couponExtendEndsAtInput" type="datetime-local" class="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100" />',
        "        </label>",
        '        <p id="couponExtendModalMsg" class="hidden mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"></p>',
        "      </div>",
        '      <div class="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-4 sm:px-6">',
        '        <button type="button" id="couponExtendModalCancel" class="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-800 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors" data-coupon-extend-close>Cancel</button>',
        '        <button type="button" id="couponExtendModalSave" class="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-500 transition-colors">Save</button>',
        "      </div>",
        "    </div>",
        "  </div>",
        "</div>",
      ].join("")
    );

    extendModal = document.getElementById("couponExtendModal");
    extendModalInput = document.getElementById("couponExtendEndsAtInput");
    extendModalTitle = document.getElementById("couponExtendTitle");
    extendModalSaveBtn = document.getElementById("couponExtendModalSave");
    extendModalCloseBtns = Array.prototype.slice.call(document.querySelectorAll("[data-coupon-extend-close]"));

    if (!extendModal) return;
    extendModalCloseBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeExtendModal();
      });
    });
    document.addEventListener("keydown", function (event) {
      if (!extendModal || extendModal.getAttribute("aria-hidden") !== "false") return;
      if (event.key === "Escape") closeExtendModal();
    });
    if (extendModalSaveBtn) {
      extendModalSaveBtn.addEventListener("click", function () {
        submitExtendModal().catch(function () {
          return null;
        });
      });
    }
  }

  function setExtendModalMsg(text) {
    var el = document.getElementById("couponExtendModalMsg");
    if (!el) return;
    var msg = String(text || "").trim();
    el.textContent = msg;
    el.classList.toggle("hidden", !msg);
  }

  function openExtendModal(item) {
    ensureExtendModal();
    if (!extendModal || !extendModalInput) return;
    extendModalTarget = item || null;
    if (extendModalTitle) {
      extendModalTitle.textContent = "Set end date/time" + (item && item.code ? " • " + String(item.code) : "");
    }
    extendModalInput.value = toLocalDatetime(item && item.ends_at) || "";
    setExtendModalMsg("");
    extendModal.classList.remove("hidden");
    extendModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("overflow-hidden");
    window.setTimeout(function () {
      try {
        extendModalInput.focus();
      } catch (_error) {}
    }, 20);
  }

  function closeExtendModal() {
    if (!extendModal) return;
    extendModal.classList.add("hidden");
    extendModal.setAttribute("aria-hidden", "true");
    setExtendModalMsg("");
    extendModalTarget = null;
    document.body.classList.remove("overflow-hidden");
  }

  async function submitExtendModal() {
    if (!extendModalTarget || !extendModalInput || !extendModalSaveBtn) return;
    var trimmed = String(extendModalInput.value || "").trim();
    if (!trimmed) {
      setExtendModalMsg("End date/time is required.");
      return;
    }
    extendModalSaveBtn.disabled = true;
    extendModalSaveBtn.textContent = "Saving...";
    try {
      await extendCoupon({ id: extendModalTarget.id, endsAt: trimmed });
      setMessage("Coupon " + String(extendModalTarget.code || "") + " end date updated.", "ok");
      closeExtendModal();
    } catch (error) {
      setExtendModalMsg(error.message || "Could not set coupon end date.");
    } finally {
      extendModalSaveBtn.disabled = false;
      extendModalSaveBtn.textContent = "Save";
    }
  }

  function resetForm() {
    if (fields.id) fields.id.value = "";
    if (fields.code) fields.code.value = "";
    if (fields.description) fields.description.value = "";
    if (fields.discountType) fields.discountType.value = "percent";
    if (fields.percentOff) fields.percentOff.value = "";
    if (fields.fixedNgnMinor) fields.fixedNgnMinor.value = "";
    if (fields.fixedGbpMinor) fields.fixedGbpMinor.value = "";
    if (fields.courseSlug) fields.courseSlug.value = "all";
    if (fields.maxUses) fields.maxUses.value = "";
    if (fields.maxUsesPerEmail) fields.maxUsesPerEmail.value = "";
    if (fields.startsAt) fields.startsAt.value = "";
    if (fields.endsAt) fields.endsAt.value = "";
    if (fields.isActive) fields.isActive.checked = true;
  }

  function fillForm(item) {
    if (!item) return;
    ensureCourseOption(item.course_slug);
    if (fields.id) fields.id.value = String(item.id || "");
    if (fields.code) fields.code.value = String(item.code || "");
    if (fields.description) fields.description.value = String(item.description || "");
    if (fields.discountType) fields.discountType.value = String(item.discount_type || "percent");
    if (fields.percentOff) fields.percentOff.value = item.percent_off !== null && item.percent_off !== undefined ? String(item.percent_off) : "";
    if (fields.fixedNgnMinor) fields.fixedNgnMinor.value = item.fixed_ngn_minor !== null && item.fixed_ngn_minor !== undefined ? String(item.fixed_ngn_minor) : "";
    if (fields.fixedGbpMinor) fields.fixedGbpMinor.value = item.fixed_gbp_minor !== null && item.fixed_gbp_minor !== undefined ? String(item.fixed_gbp_minor) : "";
    if (fields.courseSlug) fields.courseSlug.value = canonicalCourseSlug(item.course_slug || "all");
    if (fields.maxUses) fields.maxUses.value = item.max_uses !== null && item.max_uses !== undefined ? String(item.max_uses) : "";
    if (fields.maxUsesPerEmail) fields.maxUsesPerEmail.value = item.max_uses_per_email !== null && item.max_uses_per_email !== undefined ? String(item.max_uses_per_email) : "";
    if (fields.startsAt) fields.startsAt.value = toLocalDatetime(item.starts_at);
    if (fields.endsAt) fields.endsAt.value = toLocalDatetime(item.ends_at);
    if (fields.isActive) fields.isActive.checked = Boolean(Number(item.is_active || 0));
    if (fields.code) fields.code.focus();
  }

  function renderRows() {
    if (!rowsEl) return;
    if (!items.length) {
      rowsEl.innerHTML = '<tr><td colspan="6" class="px-3 py-4 text-sm text-gray-500">No coupons yet.</td></tr>';
      return;
    }

    rowsEl.innerHTML = items
      .map(function (item, idx) {
        var type = String(item.discount_type || "percent");
        var discountLabel = type === "percent"
          ? (String(item.percent_off || "0") + "%")
          : ("NGN " + String(item.fixed_ngn_minor || "-") + " / GBP " + String(item.fixed_gbp_minor || "-"));
        var scopeSlug = canonicalCourseSlug(item.course_slug || "");
        var scope = scopeSlug && scopeSlug !== "all" ? String(courseLabelBySlug[scopeSlug] || scopeSlug) : "All courses";
        var uses = String(item.total_uses || 0) + (item.max_uses ? " / " + String(item.max_uses) : "");
        var active = statusLabel(item);
        return (
          '<tr class="border-b border-gray-50">' +
          '<td class="px-3 py-2 text-sm font-semibold text-gray-900">' + esc(item.code) + "</td>" +
          '<td class="px-3 py-2 text-sm text-gray-700">' + esc(discountLabel) + "</td>" +
          '<td class="px-3 py-2 text-sm text-gray-700">' + esc(scope) + "</td>" +
          '<td class="px-3 py-2 text-sm text-gray-700">' + esc(uses) + "</td>" +
          '<td class="px-3 py-2 text-sm text-gray-700">' + esc(active) + '<div class="text-[11px] text-gray-500 mt-0.5">' + esc(validitySummary(item)) + "</div></td>" +
          '<td class="px-3 py-2 text-sm">' +
          '<button type="button" data-coupon-edit="' + String(idx) + '" class="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 ring-1 ring-inset ring-gray-300 hover:bg-gray-50">Edit</button>' +
          '<button type="button" data-coupon-extend="' + String(idx) + '" data-minutes="1440" class="ml-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 ring-1 ring-inset ring-gray-300 hover:bg-gray-50">+24h</button>' +
          '<button type="button" data-coupon-extend="' + String(idx) + '" data-minutes="10080" class="ml-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 ring-1 ring-inset ring-gray-300 hover:bg-gray-50">+7d</button>' +
          '<button type="button" data-coupon-extend-date="' + String(idx) + '" class="ml-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-100">Set date/time</button>' +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function loadCoupons() {
    var res = await fetch("/.netlify/functions/admin-coupons-list", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (res.status === 401) {
      var next = window.location.pathname + (window.location.search || "");
      window.location.href = "/internal/?next=" + encodeURIComponent(next);
      return;
    }
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not load coupons.");
    courseOptions = normalizeCourseItems(json.courses);
    courseLabelBySlug = {};
    courseOptions.forEach(function (item) {
      courseLabelBySlug[item.slug] = String(item.label || item.slug);
    });
    setCourseOptions(fields.courseSlug && fields.courseSlug.value ? fields.courseSlug.value : "all");
    items = Array.isArray(json.items) ? json.items : [];
    renderRows();
  }

  async function saveCoupon() {
    var payload = {
      id: parseNumber(fields.id && fields.id.value),
      code: fields.code ? String(fields.code.value || "").trim() : "",
      description: fields.description ? String(fields.description.value || "").trim() : "",
      discountType: fields.discountType ? String(fields.discountType.value || "percent") : "percent",
      percentOff: parseNumber(fields.percentOff && fields.percentOff.value),
      fixedNgnMinor: parseNumber(fields.fixedNgnMinor && fields.fixedNgnMinor.value),
      fixedGbpMinor: parseNumber(fields.fixedGbpMinor && fields.fixedGbpMinor.value),
      courseSlug: fields.courseSlug ? String(fields.courseSlug.value || "all") : "all",
      maxUses: parseNumber(fields.maxUses && fields.maxUses.value),
      maxUsesPerEmail: parseNumber(fields.maxUsesPerEmail && fields.maxUsesPerEmail.value),
      startsAt: fields.startsAt ? String(fields.startsAt.value || "") : "",
      endsAt: fields.endsAt ? String(fields.endsAt.value || "") : "",
      isActive: fields.isActive ? Boolean(fields.isActive.checked) : true,
    };

    if (!payload.code) throw new Error("Coupon code is required.");

    var res = await fetch("/.netlify/functions/admin-coupons-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      var next = window.location.pathname + (window.location.search || "");
      window.location.href = "/internal/?next=" + encodeURIComponent(next);
      return;
    }
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not save coupon.");
    await loadCoupons();
    setMessage("Coupon saved.", "ok");
    resetForm();
  }

  async function extendCoupon(payload) {
    var res = await fetch("/.netlify/functions/admin-coupons-extend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload || {}),
    });
    if (res.status === 401) {
      var next = window.location.pathname + (window.location.search || "");
      window.location.href = "/internal/?next=" + encodeURIComponent(next);
      return;
    }
    var json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not extend coupon.");
    await loadCoupons();
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
    }
    saveCoupon()
      .catch(function (error) {
        setMessage(error.message || "Could not save coupon.", "error");
      })
      .finally(function () {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Save Coupon";
        }
      });
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      resetForm();
      setMessage("", "");
    });
  }

  if (rowsEl) {
    rowsEl.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-coupon-edit]");
      if (btn) {
        var idx = Number(btn.getAttribute("data-coupon-edit"));
        if (!Number.isFinite(idx) || !items[idx]) return;
        fillForm(items[idx]);
        setMessage("Editing " + String(items[idx].code || "") + ".", "ok");
        return;
      }

      var extendBtn = event.target.closest("[data-coupon-extend]");
      if (extendBtn) {
        var extIdx = Number(extendBtn.getAttribute("data-coupon-extend"));
        var minutes = Number(extendBtn.getAttribute("data-minutes") || 0);
        if (!Number.isFinite(extIdx) || !items[extIdx]) return;
        if (!Number.isFinite(minutes) || minutes <= 0) return;
        var coupon = items[extIdx];
        extendBtn.disabled = true;
        extendBtn.textContent = "Extending...";
        extendCoupon({ id: coupon.id, extendMinutes: minutes })
          .then(function () {
            setMessage("Coupon " + String(coupon.code || "") + " validity extended.", "ok");
          })
          .catch(function (error) {
            setMessage(error.message || "Could not extend coupon.", "error");
          })
          .finally(function () {
            extendBtn.disabled = false;
            extendBtn.textContent = minutes === 1440 ? "+24h" : "+7d";
          });
        return;
      }

      var dateBtn = event.target.closest("[data-coupon-extend-date]");
      if (dateBtn) {
        var dateIdx = Number(dateBtn.getAttribute("data-coupon-extend-date"));
        if (!Number.isFinite(dateIdx) || !items[dateIdx]) return;
        openExtendModal(items[dateIdx]);
      }
    });
  }

  loadCoupons().catch(function (error) {
    if (!courseOptions.length) {
      courseOptions = FALLBACK_COURSES.slice();
      courseLabelBySlug = {};
      courseOptions.forEach(function (item) {
        courseLabelBySlug[item.slug] = item.label;
      });
      setCourseOptions("all");
    }
    setMessage(error.message || "Could not load coupons.", "error");
  });
})();
