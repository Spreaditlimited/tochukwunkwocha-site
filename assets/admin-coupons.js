(function () {
  var form = document.getElementById("couponForm");
  if (!form) return;

  var messageEl = document.getElementById("couponMessage");
  var rowsEl = document.getElementById("couponRows");
  var saveBtn = document.getElementById("couponSaveBtn");
  var resetBtn = document.getElementById("couponResetBtn");

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

  function parseNumber(value) {
    var raw = String(value || "").trim();
    if (!raw) return null;
    var n = Number(raw);
    return Number.isFinite(n) ? n : null;
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
    if (fields.id) fields.id.value = String(item.id || "");
    if (fields.code) fields.code.value = String(item.code || "");
    if (fields.description) fields.description.value = String(item.description || "");
    if (fields.discountType) fields.discountType.value = String(item.discount_type || "percent");
    if (fields.percentOff) fields.percentOff.value = item.percent_off !== null && item.percent_off !== undefined ? String(item.percent_off) : "";
    if (fields.fixedNgnMinor) fields.fixedNgnMinor.value = item.fixed_ngn_minor !== null && item.fixed_ngn_minor !== undefined ? String(item.fixed_ngn_minor) : "";
    if (fields.fixedGbpMinor) fields.fixedGbpMinor.value = item.fixed_gbp_minor !== null && item.fixed_gbp_minor !== undefined ? String(item.fixed_gbp_minor) : "";
    if (fields.courseSlug) fields.courseSlug.value = String(item.course_slug || "all");
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
        var scope = item.course_slug ? String(item.course_slug) : "All courses";
        var uses = String(item.total_uses || 0) + (item.max_uses ? " / " + String(item.max_uses) : "");
        var active = Number(item.is_active || 0) ? "Active" : "Inactive";
        return (
          '<tr class="border-b border-gray-50">' +
          '<td class="px-3 py-2 text-sm font-semibold text-gray-900">' + esc(item.code) + "</td>" +
          '<td class="px-3 py-2 text-sm text-gray-700">' + esc(discountLabel) + "</td>" +
          '<td class="px-3 py-2 text-sm text-gray-700">' + esc(scope) + "</td>" +
          '<td class="px-3 py-2 text-sm text-gray-700">' + esc(uses) + "</td>" +
          '<td class="px-3 py-2 text-sm text-gray-700">' + esc(active) + "</td>" +
          '<td class="px-3 py-2 text-sm">' +
          '<button type="button" data-coupon-edit="' + String(idx) + '" class="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 ring-1 ring-inset ring-gray-300 hover:bg-gray-50">Edit</button>' +
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
      if (!btn) return;
      var idx = Number(btn.getAttribute("data-coupon-edit"));
      if (!Number.isFinite(idx) || !items[idx]) return;
      fillForm(items[idx]);
      setMessage("Editing " + String(items[idx].code || "") + ".", "ok");
    });
  }

  loadCoupons().catch(function (error) {
    setMessage(error.message || "Could not load coupons.", "error");
  });
})();

