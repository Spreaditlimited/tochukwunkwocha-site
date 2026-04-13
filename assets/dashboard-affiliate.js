(function () {
  var metaEl = document.getElementById("affiliateMeta");
  var ineligibleEl = document.getElementById("affiliateIneligibleNotice");
  var linkInput = document.getElementById("affiliateLinkInput");
  var copyBtn = document.getElementById("affiliateCopyLinkBtn");
  var copyMsg = document.getElementById("affiliateCopyMsg");
  var pendingEl = document.getElementById("affPending");
  var approvedEl = document.getElementById("affApproved");
  var paidEl = document.getElementById("affPaid");
  var blockedEl = document.getElementById("affBlocked");
  var referralsRows = document.getElementById("affiliateReferralsRows");
  var payoutRows = document.getElementById("affiliatePayoutRows");
  var payoutForm = document.getElementById("affiliatePayoutForm");
  var payoutMsg = document.getElementById("affiliatePayoutMsg");
  var payoutSaveBtn = document.getElementById("affiliatePayoutSaveBtn");
  var helpWarningEl = document.getElementById("affiliateHelpWarning");
  var policyHoldEl = document.getElementById("affiliatePolicyHold");
  var policyMinPayoutEl = document.getElementById("affiliatePolicyMinPayout");
  var policyProviderEl = document.getElementById("affiliatePolicyProvider");
  var eligibleCoursesRows = document.getElementById("affiliateEligibleCoursesRows");
  var bankPickerEl = document.getElementById("affBankPicker");
  var bankPickerToggleEl = document.getElementById("affBankPickerToggle");
  var bankPickerLabelEl = document.getElementById("affBankPickerLabel");
  var bankPickerPanelEl = document.getElementById("affBankPickerPanel");
  var bankPickerSearchEl = document.getElementById("affBankPickerSearch");
  var bankPickerListEl = document.getElementById("affBankPickerList");
  var bankSelectEl = document.getElementById("affBankCode");
  var accountNumberEl = document.getElementById("affAccountNumber");
  var accountNameEl = document.getElementById("affAccountName");
  var payoutOtpCodeEl = document.getElementById("affPayoutOtpCode");
  var sendPayoutOtpBtn = document.getElementById("affSendPayoutOtpBtn");
  var schoolTieNoteEl = document.getElementById("affiliateSchoolTieNote");
  var holdExplainEl = document.getElementById("affiliatePolicyHoldExplain");
  var resolveTimer = null;
  var banksLoaded = false;
  var banksLoading = false;
  var bankPickerOpen = false;
  var allBanks = [];

  function formatMoney(minor, currency) {
    var amount = Number(minor || 0) / 100;
    var ccy = String(currency || "NGN").toUpperCase();
    var locale = ccy === "USD" ? "en-US" : "en-NG";
    return new Intl.NumberFormat(locale, { style: "currency", currency: ccy }).format(amount);
  }

  function setPayoutMsg(text, type) {
    if (!payoutMsg) return;
    payoutMsg.textContent = String(text || "");
    payoutMsg.className = "mt-2 text-sm " + (type === "error" ? "text-rose-700" : "text-emerald-700");
  }

  function clearPayoutSuccessMsg() {
    if (!payoutMsg) return;
    var klass = String(payoutMsg.className || "");
    if (klass.indexOf("text-emerald-700") !== -1) {
      setPayoutMsg("", "ok");
    }
  }

  function safeDate(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }

  function humanizeCourseSlug(value) {
    return String(value || "")
      .trim()
      .split(/[-_]/g)
      .filter(Boolean)
      .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); })
      .join(" ");
  }

  function formatCommission(type, value, currency) {
    var lowerType = String(type || "").toLowerCase();
    var num = Number(value || 0);
    if (lowerType === "percentage") return (num / 100).toFixed(2).replace(/\.00$/, "") + "%";
    return formatMoney(num, currency || "NGN");
  }

  function formatCommissionForRow(item) {
    var base = formatCommission(item && item.commissionType, item && item.commissionValue, item && item.commissionCurrency);
    var slug = String(item && item.courseSlug || "").toLowerCase();
    var seats = Number(item && item.projectedMinSeats || 0);
    var projected = Number(item && item.projectedMinCommissionMinor || 0);
    if (slug === "prompt-to-profit-schools" && seats > 0 && projected > 0) {
      return base + " per student (" + formatMoney(projected, item.commissionCurrency || "NGN") + " at " + String(seats) + " students min)";
    }
    return base;
  }

  function renderRows(rows, target, renderItem, emptyText, colSpan) {
    if (!target) return;
    var items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      target.innerHTML = '<tr><td class="py-3 text-gray-500" colspan="' + String(colSpan || 1) + '">' + String(emptyText || "No data") + "</td></tr>";
      return;
    }
    target.innerHTML = items.map(renderItem).join("");
  }

  function selectedBankName() {
    if (!bankSelectEl) return "";
    var code = String(bankSelectEl.value || "").trim();
    if (!code) return "";
    var row = (Array.isArray(allBanks) ? allBanks : []).find(function (item) {
      return String(item && item.code || "") === code;
    });
    return row ? String(row.name || "") : "";
  }

  function getBankList(query) {
    var q = String(query || "").trim().toLowerCase();
    return (Array.isArray(allBanks) ? allBanks : []).filter(function (item) {
      var name = String(item && item.name || "").toLowerCase();
      var code = String(item && item.code || "").toLowerCase();
      if (!q) return true;
      return name.indexOf(q) !== -1 || code.indexOf(q) !== -1;
    });
  }

  function setBankPickerOpen(nextOpen) {
    bankPickerOpen = !!nextOpen;
    if (bankPickerPanelEl) bankPickerPanelEl.hidden = !bankPickerOpen;
    if (bankPickerToggleEl) bankPickerToggleEl.setAttribute("aria-expanded", bankPickerOpen ? "true" : "false");
    if (bankPickerOpen && bankPickerSearchEl) {
      bankPickerSearchEl.focus();
      bankPickerSearchEl.select();
    }
  }

  function updateBankPickerLabel() {
    if (!bankPickerLabelEl) return;
    var name = selectedBankName();
    bankPickerLabelEl.textContent = name || "Select Bank (Nigeria)";
  }

  function renderBankOptions(query, preferredCode) {
    if (!bankSelectEl) return;
    var keepCode = String(preferredCode || bankSelectEl.value || "").trim();
    var options = ['<option value="">Select Bank (Nigeria)</option>'];
    (Array.isArray(allBanks) ? allBanks : []).forEach(function (item) {
      var code = String(item && item.code || "").trim();
      var name = String(item && item.name || "").trim();
      if (!code || !name) return;
      options.push('<option value="' + code.replace(/"/g, "&quot;") + '">' + name.replace(/</g, "&lt;") + "</option>");
    });
    bankSelectEl.innerHTML = options.join("");
    if (keepCode) bankSelectEl.value = keepCode;
    if (bankPickerListEl) {
      var list = getBankList(query);
      if (!list.length) {
        bankPickerListEl.innerHTML = '<div class="bank-combobox-empty">No bank matched your search.</div>';
      } else {
        bankPickerListEl.innerHTML = list.map(function (item) {
          var code = String(item && item.code || "").trim();
          var name = String(item && item.name || "").trim();
          if (!code || !name) return "";
          var selected = String(bankSelectEl.value || "") === code ? "true" : "false";
          return '<button type="button" class="bank-combobox-option" data-bank-code="' + code.replace(/"/g, "&quot;") + '" data-bank-name="' + name.replace(/"/g, "&quot;") + '" aria-selected="' + selected + '">' + name.replace(/</g, "&lt;") + "</button>";
        }).join("");
      }
    }
    updateBankPickerLabel();
  }

  async function loadBanks(force) {
    if (!bankSelectEl) return;
    if (banksLoaded && !force) return;
    if (banksLoading) return;
    banksLoading = true;
    if (bankPickerLabelEl) bankPickerLabelEl.textContent = "Loading banks...";
    try {
      var res = await fetch("/.netlify/functions/affiliate-payout-banks-list", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      var json = await res.json().catch(function () { return null; });
      if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not load banks");
      var banks = Array.isArray(json.banks) ? json.banks : [];
      if (!banks.length) {
        var fallbackMessage = json && json.meta && json.meta.userMessage
          ? String(json.meta.userMessage)
          : "Bank list is temporarily unavailable. Click the bank field to retry.";
        throw new Error(fallbackMessage);
      }
      allBanks = banks.map(function (item) {
        return {
          code: String(item && item.code || "").trim(),
          name: String(item && item.name || "").trim(),
        };
      }).filter(function (item) { return item.code && item.name; });
      renderBankOptions(bankPickerSearchEl && bankPickerSearchEl.value || "", bankSelectEl && bankSelectEl.value || "");
      banksLoaded = true;
      setPayoutMsg("", "ok");
    } finally {
      banksLoading = false;
    }
  }

  async function resolveAccountName() {
    if (!bankSelectEl || !accountNumberEl || !accountNameEl) return { resolved: false };
    var bankCode = String(bankSelectEl.value || "").trim();
    var accountNumber = String(accountNumberEl.value || "").replace(/\D/g, "");
    accountNumberEl.value = accountNumber;
    if (!bankCode || accountNumber.length < 10) {
      accountNameEl.value = "";
      return { resolved: false };
    }

    accountNameEl.value = "Resolving...";
    var res = await fetch("/.netlify/functions/affiliate-payout-account-resolve", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        bankCode: bankCode,
        accountNumber: accountNumber,
      }),
    });
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok) {
      accountNameEl.value = "";
      throw new Error((json && json.error) || "Could not resolve account name");
    }
    var result = json.result || {};
    accountNameEl.value = String(result.accountName || "");
    return { resolved: !!String(accountNameEl.value || "").trim() };
  }

  function scheduleResolve() {
    if (resolveTimer) clearTimeout(resolveTimer);
    resolveTimer = setTimeout(function () {
      resolveAccountName().then(function (result) {
        if (result && result.resolved) {
          setPayoutMsg("Account name verified via Paystack.", "ok");
          return;
        }
        clearPayoutSuccessMsg();
      }).catch(function (error) {
        setPayoutMsg(error.message || "Could not resolve account name", "error");
      });
    }, 250);
  }

  async function loadDashboard() {
    var res = await fetch("/.netlify/functions/affiliate-dashboard", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    var json = await res.json().catch(function () { return null; });
    if (res.status === 401) {
      window.location.href = "/dashboard/";
      return;
    }
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load affiliate dashboard");
    }

    var affiliate = json.affiliate || {};
    var profile = affiliate.profile || {};
    var earnings = affiliate.earnings || {};
    var referrals = affiliate.referrals || [];
    var payouts = affiliate.payouts || [];
    var policy = affiliate.policy || {};
    var eligibleCourses = affiliate.eligibleCourses || [];

    if (metaEl) metaEl.textContent = "Affiliate code: " + String(profile.affiliateCode || "--");
    if (linkInput) linkInput.value = String(profile.affiliateLink || "");
    if (accountNameEl) accountNameEl.value = String(profile.payoutAccount && profile.payoutAccount.accountName || "");
    if (accountNumberEl) {
      var maskedAccountNumber = String(profile.payoutAccount && profile.payoutAccount.accountNumberMasked || "");
      var currentAccountDigits = String(accountNumberEl.value || "").replace(/\D/g, "");
      if (!currentAccountDigits || currentAccountDigits.length < 10) {
        accountNumberEl.value = maskedAccountNumber;
      }
    }
    if (bankSelectEl) {
      var selectedCode = String(profile.payoutAccount && profile.payoutAccount.bankCode || "");
      if (selectedCode) bankSelectEl.value = selectedCode;
      if (selectedCode && banksLoaded) {
        renderBankOptions(bankPickerSearchEl && bankPickerSearchEl.value || "", selectedCode);
      }
    }

    if (pendingEl) pendingEl.textContent = formatMoney(earnings.pendingMinor, profile.payoutCurrency || "NGN");
    if (approvedEl) approvedEl.textContent = formatMoney(earnings.approvedMinor, profile.payoutCurrency || "NGN");
    if (paidEl) paidEl.textContent = formatMoney(earnings.paidMinor, profile.payoutCurrency || "NGN");
    if (blockedEl) blockedEl.textContent = formatMoney(earnings.blockedMinor, profile.payoutCurrency || "NGN");

    if (String(profile.eligibilityStatus || "") !== "eligible" && ineligibleEl) {
      ineligibleEl.classList.remove("hidden");
      ineligibleEl.textContent = String(profile.eligibilityReason || "You are not eligible for affiliate access.");
      if (payoutForm) payoutForm.hidden = true;
    }

    if (policyHoldEl) {
      var holdDays = Number(policy.defaultHoldDays || 0);
      policyHoldEl.textContent = holdDays > 0 ? holdDays + " days before commission matures" : "No hold period configured";
      if (holdExplainEl) {
        holdExplainEl.textContent = holdDays > 0
          ? "Hold days means each new commission stays pending for " + holdDays + " days before it can move to approved and become eligible for payout."
          : "Hold days means commissions can move to approved status immediately when risk checks pass.";
      }
    }
    if (policyMinPayoutEl) policyMinPayoutEl.textContent = formatMoney(policy.minPayoutMinor, policy.payoutCurrency || profile.payoutCurrency || "NGN");
    if (policyProviderEl) {
      var provider = String(profile.payoutProvider || "paystack").trim().toLowerCase();
      policyProviderEl.textContent = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "Paystack";
    }
    if (helpWarningEl) {
      helpWarningEl.textContent = String(policy.antiAbuseSummary || "Attempts to game the system will lead to withheld or reversed commissions and may result in account restriction.");
    }
    if (schoolTieNoteEl) {
      var note = String(policy.schoolReferralNote || "").trim();
      if (note) {
        schoolTieNoteEl.classList.remove("hidden");
        schoolTieNoteEl.textContent = note;
      } else {
        schoolTieNoteEl.classList.add("hidden");
        schoolTieNoteEl.textContent = "";
      }
    }

    renderRows(
      eligibleCourses,
      eligibleCoursesRows,
      function (item) {
        var label = humanizeCourseSlug(item.courseSlug);
        return [
          "<tr class='border-b border-gray-100'>",
          "<td class='py-2 pr-3'>" + String(label || item.courseSlug || "") + "</td>",
          "<td class='py-2 pr-3'>" + formatCommissionForRow(item) + "</td>",
          "<td class='py-2 pr-3'>" + formatMoney(item.minOrderAmountMinor || 0, item.commissionCurrency || "NGN") + "</td>",
          "<td class='py-2 pr-3'>" + String(Number(item.holdDays || 0)) + "</td>",
          "</tr>",
        ].join("");
      },
      "No eligible courses are currently available.",
      4
    );

    renderRows(
      referrals,
      referralsRows,
      function (item) {
        return [
          "<tr class='border-b border-gray-100'>",
          "<td class='py-2 pr-3'>" + safeDate(item.createdAt) + "</td>",
          "<td class='py-2 pr-3'>" + String(humanizeCourseSlug(item.courseSlug) || item.courseSlug || "") + "</td>",
          "<td class='py-2 pr-3'>" + String(item.buyerEmailMasked || "") + "</td>",
          "<td class='py-2 pr-3'>" + formatMoney(item.orderAmountMinor, item.currency) + "</td>",
          "<td class='py-2 pr-3'>" + formatMoney(item.commissionAmountMinor, item.currency) + "</td>",
          "<td class='py-2 pr-3'>" + String(item.status || "") + "</td>",
          "</tr>",
        ].join("");
      },
      "No referrals yet.",
      6
    );

    renderRows(
      payouts,
      payoutRows,
      function (item) {
        return [
          "<tr class='border-b border-gray-100'>",
          "<td class='py-2 pr-3'>" + String(item.batchUuid || "") + "</td>",
          "<td class='py-2 pr-3'>" + safeDate(item.periodStart) + " - " + safeDate(item.periodEnd) + "</td>",
          "<td class='py-2 pr-3'>" + formatMoney(item.totalAmountMinor, item.currency) + "</td>",
          "<td class='py-2 pr-3'>" + String(item.status || "") + "</td>",
          "</tr>",
        ].join("");
      },
      "No payout history yet.",
      4
    );
  }

  async function savePayout(event) {
    event.preventDefault();
    if (!payoutSaveBtn) return;
    payoutSaveBtn.disabled = true;
    payoutSaveBtn.textContent = "Saving...";
    setPayoutMsg("", "ok");

    try {
      var payload = {
        countryCode: "NG",
        currency: "NGN",
        accountName: accountNameEl && accountNameEl.value,
        bankCode: bankSelectEl && bankSelectEl.value,
        bankName: selectedBankName(),
        accountNumber: accountNumberEl && accountNumberEl.value,
        otpCode: payoutOtpCodeEl && String(payoutOtpCodeEl.value || "").replace(/\D/g, ""),
      };
      if (!payload.bankCode) throw new Error("Select a bank");
      if (!payload.accountNumber || String(payload.accountNumber).replace(/\D/g, "").length < 10) {
        throw new Error("Enter a valid account number");
      }
      if (!payload.accountName) {
        await resolveAccountName();
        payload.accountName = accountNameEl && accountNameEl.value;
      }
      if (!payload.accountName) throw new Error("Account name could not be resolved from Paystack");

      var res = await fetch("/.netlify/functions/affiliate-payout-account-save", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      var json = await res.json().catch(function () { return null; });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not save payout account");
      }
      if (accountNameEl && json.result && json.result.resolvedAccountName) {
        accountNameEl.value = String(json.result.resolvedAccountName);
      }
      if (payoutOtpCodeEl) payoutOtpCodeEl.value = "";
      setPayoutMsg("Payout account saved successfully.", "ok");
      await loadDashboard();
    } catch (error) {
      setPayoutMsg(error.message || "Could not save payout account", "error");
    } finally {
      payoutSaveBtn.disabled = false;
      payoutSaveBtn.textContent = "Save Account";
    }
  }

  async function sendPayoutOtp() {
    if (!sendPayoutOtpBtn) return;
    var bankCode = String(bankSelectEl && bankSelectEl.value || "").trim();
    var accountNumber = String(accountNumberEl && accountNumberEl.value || "").replace(/\D/g, "");
    if (!bankCode) {
      setPayoutMsg("Select a bank before requesting verification code.", "error");
      return;
    }
    if (accountNumber.length < 10) {
      setPayoutMsg("Enter a valid account number before requesting verification code.", "error");
      return;
    }

    sendPayoutOtpBtn.disabled = true;
    sendPayoutOtpBtn.textContent = "Sending...";
    try {
      var res = await fetch("/.netlify/functions/affiliate-payout-account-change-otp-send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          bankCode: bankCode,
          accountNumber: accountNumber,
        }),
      });
      var json = await res.json().catch(function () { return null; });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not send verification code");
      }
      var result = json.result || {};
      if (result && result.otpRequired === false) {
        setPayoutMsg(result.message || "No account change detected.", "ok");
        return;
      }
      var masked = String(result && result.emailMasked || "");
      setPayoutMsg(masked ? ("Verification code sent to " + masked + ".") : "Verification code sent to your registered email.", "ok");
    } catch (error) {
      setPayoutMsg(error.message || "Could not send verification code", "error");
    } finally {
      sendPayoutOtpBtn.disabled = false;
      sendPayoutOtpBtn.textContent = "Send Code";
    }
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var value = linkInput ? String(linkInput.value || "") : "";
      if (!value) return;
      navigator.clipboard.writeText(value).then(function () {
        if (copyMsg) copyMsg.textContent = "Affiliate link copied.";
      }).catch(function () {
        if (copyMsg) copyMsg.textContent = "Could not copy. Please copy manually.";
      });
    });
  }

  if (payoutForm) payoutForm.addEventListener("submit", savePayout);
  if (bankPickerToggleEl) {
    bankPickerToggleEl.addEventListener("click", function () {
      if (!banksLoaded) {
        loadBanks(true).then(function () {
          setBankPickerOpen(true);
        }).catch(function (error) {
          setPayoutMsg(error && error.message ? error.message : "Could not load payout banks", "error");
          if (bankPickerLabelEl) bankPickerLabelEl.textContent = "Bank list unavailable";
        });
        return;
      }
      setBankPickerOpen(!bankPickerOpen);
    });
    bankPickerToggleEl.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && bankPickerOpen) {
        event.preventDefault();
        setBankPickerOpen(false);
      }
    });
  }
  if (bankPickerSearchEl) {
    bankPickerSearchEl.addEventListener("input", function () {
      renderBankOptions(bankPickerSearchEl.value, bankSelectEl && bankSelectEl.value || "");
    });
    bankPickerSearchEl.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && bankPickerOpen) {
        event.preventDefault();
        setBankPickerOpen(false);
      }
    });
  }
  if (bankPickerListEl) {
    bankPickerListEl.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var button = target.closest("[data-bank-code]");
      if (!button) return;
      var code = String(button.getAttribute("data-bank-code") || "").trim();
      if (!code) return;
      if (bankSelectEl) bankSelectEl.value = code;
      if (bankPickerSearchEl) bankPickerSearchEl.value = "";
      renderBankOptions("", code);
      setBankPickerOpen(false);
      scheduleResolve();
    });
  }
  document.addEventListener("click", function (event) {
    if (!bankPickerOpen || !bankPickerEl) return;
    if (bankPickerEl.contains(event.target)) return;
    setBankPickerOpen(false);
  });

  if (accountNumberEl) {
    accountNumberEl.addEventListener("input", scheduleResolve);
    accountNumberEl.addEventListener("blur", function () {
      resolveAccountName().catch(function (error) {
        setPayoutMsg(error.message || "Could not resolve account name", "error");
      });
    });
  }
  if (payoutOtpCodeEl) {
    payoutOtpCodeEl.addEventListener("input", function () {
      payoutOtpCodeEl.value = String(payoutOtpCodeEl.value || "").replace(/\D/g, "").slice(0, 6);
    });
  }
  if (sendPayoutOtpBtn) sendPayoutOtpBtn.addEventListener("click", sendPayoutOtp);

  loadDashboard().catch(function (error) {
    if (metaEl) metaEl.textContent = error && error.message ? error.message : "Could not load affiliate data";
  });
  loadBanks().catch(function (error) {
    setPayoutMsg(error && error.message ? error.message : "Could not load payout banks", "error");
    if (bankPickerLabelEl) bankPickerLabelEl.textContent = "Bank list unavailable";
  });
})();
