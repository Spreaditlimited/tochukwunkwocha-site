(function () {
  var messageEl = document.getElementById("affiliateAdminMsg");
  var rulesRows = document.getElementById("affRulesRows");
  var courseSelect = document.getElementById("affRuleCourseSlug");
  var ruleForm = document.getElementById("affiliateRuleForm");
  var payoutForm = document.getElementById("affiliatePayoutRunForm");
  var payoutResult = document.getElementById("affPayoutResult");

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
    courseSelect.innerHTML = courses
      .map(function (item) {
        return '<option value="' + esc(item.slug) + '">' + esc(item.label || item.slug) + "</option>";
      })
      .join("");
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

  async function loadRules() {
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
    courses = Array.isArray(json.courses) ? json.courses : [];
    renderCourseOptions();
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
