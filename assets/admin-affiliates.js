(function () {
  var messageEl = document.getElementById("affiliateAdminMsg");
  var rulesRows = document.getElementById("affRulesRows");
  var courseSelect = document.getElementById("affRuleCourseSlug");
  var ruleForm = document.getElementById("affiliateRuleForm");
  var payoutForm = document.getElementById("affiliatePayoutRunForm");
  var payoutResult = document.getElementById("affPayoutResult");
  var commissionTotalsEl = document.getElementById("affCommissionTotals");
  var commissionRowsEl = document.getElementById("affCommissionRows");
  var commissionSortEl = document.getElementById("affCommissionSort");
  var auditRows = document.getElementById("affAuditRows");
  var FORM_STATE_KEY = "affiliate_rule_form_state_v1";

  var rules = [];
  var courses = [];
  var audit = [];
  var commissionSummary = { totalsByCurrency: [], affiliates: [] };

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

  function safeDate(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }

  function dateMs(value) {
    if (!value) return 0;
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return 0;
    return d.getTime();
  }

  function formatMoney(minor, currency) {
    var amount = Number(minor || 0) / 100;
    var ccy = String(currency || "NGN").toUpperCase();
    var locale = ccy === "USD" ? "en-US" : "en-NG";
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: ccy }).format(amount);
    } catch (_error) {
      return ccy + " " + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }

  function sortedCommissionRows() {
    var sort = String(commissionSortEl && commissionSortEl.value || "latest_desc");
    var rows = Array.isArray(commissionSummary.affiliates) ? commissionSummary.affiliates.slice() : [];
    rows.sort(function (a, b) {
      if (sort === "latest_asc") return dateMs(a.latestCommissionAt) - dateMs(b.latestCommissionAt);
      if (sort === "earned_desc") return Number(b.earnedMinor || 0) - Number(a.earnedMinor || 0);
      if (sort === "approved_desc") return Number(b.approvedMinor || 0) - Number(a.approvedMinor || 0);
      if (sort === "paid_desc") return Number(b.paidMinor || 0) - Number(a.paidMinor || 0);
      return dateMs(b.latestCommissionAt) - dateMs(a.latestCommissionAt);
    });
    return rows;
  }

  function renderCommissionSummary() {
    if (commissionTotalsEl) {
      var totals = Array.isArray(commissionSummary.totalsByCurrency) ? commissionSummary.totalsByCurrency : [];
      if (!totals.length) {
        commissionTotalsEl.innerHTML = '<div class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-500 sm:col-span-2 xl:col-span-4">No affiliate commissions yet.</div>';
      } else {
        commissionTotalsEl.innerHTML = totals.map(function (item) {
          var currency = String(item.currency || "NGN").toUpperCase();
          return [
            '<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">',
            '<p class="text-xs font-bold uppercase tracking-wide text-gray-500">' + esc(currency) + ' Total Earned</p>',
            '<p class="mt-1 text-2xl font-heading font-extrabold text-gray-900">' + esc(formatMoney(item.earnedMinor, currency)) + '</p>',
            '<p class="mt-2 text-xs font-semibold text-gray-500">Approved ' + esc(formatMoney(item.approvedMinor, currency)) + ' · Paid ' + esc(formatMoney(item.paidMinor, currency)) + '</p>',
            '</div>',
            '<div class="rounded-xl border border-gray-200 bg-gray-50 p-4">',
            '<p class="text-xs font-bold uppercase tracking-wide text-gray-500">' + esc(currency) + ' Pipeline</p>',
            '<p class="mt-1 text-2xl font-heading font-extrabold text-gray-900">' + esc(formatMoney(item.pendingMinor, currency)) + '</p>',
            '<p class="mt-2 text-xs font-semibold text-gray-500">Pending · ' + esc(String(Number(item.totalCount || 0))) + ' commissions</p>',
            '</div>',
          ].join("");
        }).join("");
      }
    }

    if (!commissionRowsEl) return;
    var rows = sortedCommissionRows();
    if (!rows.length) {
      commissionRowsEl.innerHTML = '<tr><td colspan="9" class="py-3 text-gray-500">No affiliate commissions yet.</td></tr>';
      return;
    }
    commissionRowsEl.innerHTML = rows.map(function (item) {
      var currency = String(item.currency || "NGN").toUpperCase();
      var name = String(item.fullName || "").trim() || "Unknown affiliate";
      var email = String(item.email || "").trim();
      return [
        "<tr class='border-b border-gray-100'>",
        "<td class='py-2 pr-3'><div class='font-bold text-gray-900'>" + esc(name) + "</div><div class='text-xs text-gray-500'>" + esc(email || ("Account #" + String(item.accountId || "-"))) + "</div></td>",
        "<td class='py-2 pr-3 font-mono text-xs'>" + esc(item.affiliateCode || "-") + "</td>",
        "<td class='py-2 pr-3 font-semibold text-gray-900'>" + esc(formatMoney(item.earnedMinor, currency)) + "</td>",
        "<td class='py-2 pr-3'>" + esc(formatMoney(item.approvedMinor, currency)) + "</td>",
        "<td class='py-2 pr-3'>" + esc(formatMoney(item.paidMinor, currency)) + "</td>",
        "<td class='py-2 pr-3'>" + esc(formatMoney(item.pendingMinor, currency)) + "</td>",
        "<td class='py-2 pr-3'>" + esc(formatMoney(item.blockedMinor, currency)) + "</td>",
        "<td class='py-2 pr-3'>" + esc(item.totalCount || 0) + "</td>",
        "<td class='py-2 pr-3'>" + esc(safeDate(item.latestCommissionAt)) + "</td>",
        "</tr>",
      ].join("");
    }).join("");
  }

  function renderAudit() {
    if (!auditRows) return;
    if (!Array.isArray(audit) || !audit.length) {
      auditRows.innerHTML = '<tr><td colspan="5" class="py-3 text-gray-500">No affiliate audit entries yet.</td></tr>';
      return;
    }
    auditRows.innerHTML = audit.map(function (item) {
      var metadata = item && item.metadata && typeof item.metadata === "object" ? item.metadata : {};
      var reason = String(metadata.reason || metadata.rejectionReason || metadata.attributionStatus || "").trim();
      var targetType = String(item && item.targetType || "").trim();
      var targetId = String(item && item.targetId || "").trim();
      var target = [targetType, targetId].filter(Boolean).join(": ");
      var details = [
        metadata.courseSlug ? ("course=" + String(metadata.courseSlug)) : "",
        metadata.affiliateCodeResolved ? ("aff=" + String(metadata.affiliateCodeResolved)) : "",
        metadata.affiliateCode ? ("aff=" + String(metadata.affiliateCode)) : "",
        Number(metadata.commissionAmountMinor || 0) > 0 ? ("commission_minor=" + String(Number(metadata.commissionAmountMinor || 0))) : "",
      ].filter(Boolean).join(" | ");
      return [
        "<tr class='border-b border-gray-100'>",
        "<td class='py-2 pr-3'>" + esc(safeDate(item && item.createdAt)) + "</td>",
        "<td class='py-2 pr-3'>" + esc(item && item.eventType) + "</td>",
        "<td class='py-2 pr-3'>" + esc(target || "-") + "</td>",
        "<td class='py-2 pr-3'>" + esc(reason || "-") + "</td>",
        "<td class='py-2 pr-3'>" + esc(details || "-") + "</td>",
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
    audit = Array.isArray(json.audit) ? json.audit : [];
    commissionSummary = json.commissionSummary && typeof json.commissionSummary === "object" ? json.commissionSummary : { totalsByCurrency: [], affiliates: [] };
    courses = mergeCoursesWithRuleSlugs(Array.isArray(json.courses) ? json.courses : [], rules);
    renderCourseOptions();
    syncFormFromSelection(preferred);
    renderRules();
    renderCommissionSummary();
    renderAudit();
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
    await loadRules();
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
  if (commissionSortEl) {
    commissionSortEl.addEventListener("change", renderCommissionSummary);
  }
  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.matches("[data-aff-sort]")) return;
    if (commissionSortEl) {
      commissionSortEl.value = String(target.getAttribute("data-aff-sort") || "latest_desc");
    }
    renderCommissionSummary();
  });

  loadRules().catch(function (error) {
    setMessage(error.message || "Could not load affiliate data", "error");
  });
})();
