(function () {
  var messageEl = document.getElementById("affiliateAdminMsg");
  var rulesRows = document.getElementById("affRulesRows");
  var courseSelect = document.getElementById("affRuleCourseSlug");
  var ruleForm = document.getElementById("affiliateRuleForm");
  var payoutForm = document.getElementById("affiliatePayoutRunForm");
  var payoutResult = document.getElementById("affPayoutResult");
  var FORM_STATE_KEY = "affiliate_rule_form_state_v1";

  var rules = [];
  var courses = [];

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setMessage(text, type) {
    if (!messageEl) return;
    var hasText = Boolean(text);
    messageEl.classList.toggle("hidden", !hasText);
    messageEl.textContent = String(text || "");
    messageEl.classList.remove("border-rose-200", "bg-rose-50", "text-rose-800", "border-emerald-200", "bg-emerald-50", "text-emerald-800");
    if (!hasText) return;
    if (type === "error") {
      messageEl.classList.add("border-rose-200", "bg-rose-50", "text-rose-800");
      return;
    }
    messageEl.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-800");
  }

  function renderCourseOptions() {
    if (!courseSelect) return;
    var selected = String(courseSelect.value || "").trim();
    courseSelect.innerHTML = courses
      .map(function (item) {
        return '<option value="' + esc(item.slug) + '">' + esc(item.label || item.slug) + "</option>";
      })
      .join("");
    if (selected) {
      courseSelect.value = selected;
    }
    if (!courseSelect.value && courses.length) {
      courseSelect.value = String(courses[0].slug || "");
    }
  }

  function renderRules() {
    if (!rulesRows) return;
    if (!Array.isArray(rules) || !rules.length) {
      rulesRows.innerHTML = '<tr><td colspan="6" class="py-3 text-gray-500">No affiliate rules yet.</td></tr>';
      return;
    }
    rulesRows.innerHTML = rules.map(function (item) {
      return [
        "<tr class='border-b border-gray-100'>",
        "<td class='py-2 pr-3'>" + esc(item.course_slug) + "</td>",
        "<td class='py-2 pr-3'>" + (Number(item.is_affiliate_eligible || 0) ? "Yes" : "No") + "</td>",
        "<td class='py-2 pr-3'>" + esc(item.commission_type) + "</td>",
        "<td class='py-2 pr-3'>" + esc(item.commission_value) + "</td>",
        "<td class='py-2 pr-3'>" + esc(item.commission_currency) + "</td>",
        "<td class='py-2 pr-3'>" + esc(item.hold_days) + "</td>",
        "</tr>",
      ].join("");
    }).join("");
  }

  function mergeCoursesWithRuleSlugs(courseList, ruleList) {
    var merged = {};
    (Array.isArray(courseList) ? courseList : []).forEach(function (item) {
      var slug = String(item && item.slug || "").trim().toLowerCase();
      if (!slug) return;
      merged[slug] = {
        slug: slug,
        label: String(item && item.label || slug),
      };
    });
    (Array.isArray(ruleList) ? ruleList : []).forEach(function (item) {
      var slug = String(item && item.course_slug || "").trim().toLowerCase();
      if (!slug) return;
      if (!merged[slug]) {
        merged[slug] = { slug: slug, label: slug };
      }
    });
    return Object.keys(merged)
      .map(function (slug) { return merged[slug]; })
      .sort(function (a, b) { return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0; });
  }

  function findRuleBySlug(slugInput) {
    var slug = String(slugInput || "").trim().toLowerCase();
    if (!slug) return null;
    for (var i = 0; i < rules.length; i += 1) {
      var item = rules[i];
      if (String(item && item.course_slug || "").trim().toLowerCase() === slug) return item;
    }
    return null;
  }

  function applyRuleToForm(rule) {
    if (!rule) return;
    var eligibleEl = document.getElementById("affRuleEligible");
    var typeEl = document.getElementById("affRuleType");
    var valueEl = document.getElementById("affRuleValue");
    var currencyEl = document.getElementById("affRuleCurrency");
    var minOrderEl = document.getElementById("affRuleMinOrder");
    var holdDaysEl = document.getElementById("affRuleHoldDays");

    if (eligibleEl) eligibleEl.value = Number(rule.is_affiliate_eligible || 0) ? "1" : "0";
    if (typeEl) typeEl.value = String(rule.commission_type || "percentage");
    if (valueEl) valueEl.value = String(Number(rule.commission_value || 0));
    if (currencyEl) currencyEl.value = String(rule.commission_currency || "NGN");
    if (minOrderEl) minOrderEl.value = String(Number(rule.min_order_amount_minor || 0));
    if (holdDaysEl) holdDaysEl.value = String(Number(rule.hold_days || 0));
  }

  function readFormState() {
    try {
      var raw = localStorage.getItem(FORM_STATE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  function writeFormState() {
    try {
      var state = {
        courseSlug: courseSelect ? String(courseSelect.value || "") : "",
      };
      localStorage.setItem(FORM_STATE_KEY, JSON.stringify(state));
    } catch (_error) {}
  }

  function syncFormFromSelection(preferredSlug) {
    var chosen = String(preferredSlug || (courseSelect && courseSelect.value) || "").trim().toLowerCase();
    if (!chosen) return;
    if (courseSelect) courseSelect.value = chosen;
    var matchingRule = findRuleBySlug(chosen);
    if (matchingRule) applyRuleToForm(matchingRule);
    writeFormState();
  }

  async function loadRules() {
    var state = readFormState();
    var preferred = String(state && state.courseSlug || "").trim().toLowerCase();
    var res = await fetch("/.netlify/functions/admin-affiliate-course-rules-list", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (res.status === 401) {
      window.location.href = "/internal/";
      return;
    }
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load affiliate rules");
    }
    rules = Array.isArray(json.rules) ? json.rules : [];
    courses = mergeCoursesWithRuleSlugs(Array.isArray(json.courses) ? json.courses : [], rules);
    renderCourseOptions();
    syncFormFromSelection(preferred);
    renderRules();
  }

  async function saveRule(event) {
    event.preventDefault();
    var payload = {
      courseSlug: document.getElementById("affRuleCourseSlug") && document.getElementById("affRuleCourseSlug").value,
      isAffiliateEligible: String(document.getElementById("affRuleEligible") && document.getElementById("affRuleEligible").value) === "1",
      commissionType: document.getElementById("affRuleType") && document.getElementById("affRuleType").value,
      commissionValue: Number(document.getElementById("affRuleValue") && document.getElementById("affRuleValue").value || 0),
      commissionCurrency: document.getElementById("affRuleCurrency") && document.getElementById("affRuleCurrency").value,
      minOrderAmountMinor: Number(document.getElementById("affRuleMinOrder") && document.getElementById("affRuleMinOrder").value || 0),
      holdDays: Number(document.getElementById("affRuleHoldDays") && document.getElementById("affRuleHoldDays").value || 0),
    };

    var res = await fetch("/.netlify/functions/admin-affiliate-course-rules-save", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      window.location.href = "/internal/";
      return;
    }
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not save affiliate rule");
    }

    setMessage("Affiliate rule saved.", "ok");
    writeFormState();
    await loadRules();
  }

  async function runPayoutBatch(event) {
    event.preventDefault();
    var payload = {
      periodMode: document.getElementById("affPayoutMode") && document.getElementById("affPayoutMode").value,
      periodStart: document.getElementById("affPayoutStart") && document.getElementById("affPayoutStart").value,
      periodEnd: document.getElementById("affPayoutEnd") && document.getElementById("affPayoutEnd").value,
      scheduledFor: document.getElementById("affPayoutScheduledFor") && document.getElementById("affPayoutScheduledFor").value,
      countryCode: document.getElementById("affPayoutCountry") && document.getElementById("affPayoutCountry").value,
      currency: document.getElementById("affPayoutCurrency") && document.getElementById("affPayoutCurrency").value,
      payoutProvider: document.getElementById("affPayoutProvider") && document.getElementById("affPayoutProvider").value,
    };

    var res = await fetch("/.netlify/functions/admin-affiliate-payout-batch-run", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      window.location.href = "/internal/";
      return;
    }
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not run payout batch");
    }

    if (payoutResult) {
      payoutResult.textContent = JSON.stringify(json.result || {}, null, 2);
      payoutResult.classList.remove("hidden");
    }
    setMessage("Payout batch completed.", "ok");
  }

  if (ruleForm) {
    ruleForm.addEventListener("submit", function (event) {
      saveRule(event).catch(function (error) {
        setMessage(error.message || "Could not save affiliate rule", "error");
      });
    });
  }
  if (courseSelect) {
    courseSelect.addEventListener("change", function () {
      syncFormFromSelection(courseSelect.value);
    });
  }

  if (payoutForm) {
    payoutForm.addEventListener("submit", function (event) {
      runPayoutBatch(event).catch(function (error) {
        setMessage(error.message || "Could not run payout batch", "error");
      });
    });
  }

  loadRules().catch(function (error) {
    setMessage(error.message || "Could not load affiliate data", "error");
  });
})();
