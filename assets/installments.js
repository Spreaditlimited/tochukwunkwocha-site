(function () {
  const authCard = document.getElementById("walletAuthCard");
  const planCard = document.getElementById("walletPlanCard");
  const workspaceSidebar = document.getElementById("userWorkspaceSidebar");
  const workspaceTopbar = document.getElementById("userWorkspaceTopbar");
  const dashboardMain = document.getElementById("userDashboardMain");
  const bootSplash = document.getElementById("userDashboardBootSplash");
  const guestStack = document.getElementById("userGuestStack");

  const signInForm = document.getElementById("walletSignInForm");
  const signUpForm = document.getElementById("walletSignUpForm");
  const showSignInBtn = document.getElementById("walletShowSignInBtn");
  const showSignUpBtn = document.getElementById("walletShowSignUpBtn");
  const registerBtn = document.getElementById("walletRegisterBtn");
  const loginBtn = document.getElementById("walletLoginBtn");
  const forgotPasswordBtn = document.getElementById("walletForgotPasswordBtn");
  const authMsg = document.getElementById("walletAuthMsg");
  const schoolStudentCodeCard = document.getElementById("schoolStudentCodeCard");
  const schoolStudentCodeForm = document.getElementById("schoolStudentCodeForm");
  const schoolStudentCodeInput = document.getElementById("schoolStudentCodeInput");
  const schoolStudentCodeBtn = document.getElementById("schoolStudentCodeBtn");
  const schoolStudentCodeConfirmHint = document.getElementById("schoolStudentCodeConfirmHint");
  const schoolStudentNameConfirmWrap = document.getElementById("schoolStudentNameConfirmWrap");
  const schoolStudentNameConfirmInput = document.getElementById("schoolStudentNameConfirmInput");

  const logoutBtn = document.getElementById("walletLogoutBtn");
  const accountMeta = document.getElementById("walletAccountMeta");
  const accountName = document.getElementById("walletAccountName");
  const accountEmail = document.getElementById("walletAccountEmail");
  const accountIdentity = document.getElementById("walletAccountIdentity");
  const profileForm = document.getElementById("walletProfileForm");
  const profileCard = profileForm ? profileForm.closest(".bg-gray-50") : null;
  const profileFullNameInput = document.getElementById("walletProfileFullName");
  const profileSaveBtn = document.getElementById("walletProfileSaveBtn");
  const profileMsg = document.getElementById("walletProfileMsg");
  const certWarnBanner = document.getElementById("walletCertWarnBanner");
  const certState = document.getElementById("walletProfileCertState");
  const confirmCertNameBtn = document.getElementById("walletConfirmCertificateNameBtn");
  const certConfirmModal = document.getElementById("walletCertificateConfirmModal");
  const certConfirmModalName = document.getElementById("walletCertificateConfirmName");
  const certConfirmModalAcceptBtn = document.getElementById("walletCertificateConfirmAcceptBtn");
  const passwordForm = document.getElementById("walletPasswordForm");
  const currentPasswordInput = document.getElementById("walletCurrentPassword");
  const newPasswordInput = document.getElementById("walletNewPassword");
  const passwordSaveBtn = document.getElementById("walletPasswordSaveBtn");
  const profileActionMsg = document.getElementById("walletProfileActionMsg");
  const profileNavLink = document.querySelector("[data-profile-nav-link]");
  const courseSelect = document.getElementById("walletCourse");
  const batchSelect = document.getElementById("walletBatch");
  const couponCodeInput = document.getElementById("walletCouponCode");
  const applyCouponBtn = document.getElementById("walletApplyCouponBtn");
  const couponStatusEl = document.getElementById("walletCouponStatus");
  const couponSummaryEl = document.getElementById("walletCouponSummary");
  const createPlanForm = document.getElementById("walletCreatePlanForm");
  const createPlanBtn = document.getElementById("walletCreatePlanBtn");
  const plansWrap = document.getElementById("walletPlans");
  const planMsg = document.getElementById("walletPlanMsg");
  const feedbackModal = document.getElementById("walletFeedbackModal");
  const feedbackEyebrow = document.getElementById("walletFeedbackEyebrow");
  const feedbackTitle = document.getElementById("walletFeedbackTitle");
  const feedbackMessage = document.getElementById("walletFeedbackMessage");
  const feedbackAcknowledgeBtn = document.getElementById("walletFeedbackAcknowledgeBtn");

  let dashboard = null;
  let schoolStudentChallenge = "";
  let authMode = "signin";
  let appliedPlanCoupon = null;
  const PLAN_START_ENABLED = true;
  const PLAN_PAY_ENABLED = true;
  const PLAN_START_DISABLED_MSG = "Start plan is temporarily unavailable while Paystack approves our new business account.";
  const FALLBACK_COURSES = [
    { slug: "prompt-to-profit", label: "Prompt to Profit" },
    { slug: "prompt-to-production", label: "Prompt to Profit Advanced" },
    { slug: "prompt-to-profit-schools", label: "Prompt to Profit for Schools" },
  ];

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isSyntheticSchoolEmail(value) {
    return String(value || "").toLowerCase().indexOf("@student-code.local") !== -1;
  }

  function maskStudentCode(value) {
    var code = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code) return "";
    if (code.length <= 4) return code.charAt(0) + "***";
    return code.slice(0, 3) + "****" + code.slice(-2);
  }

  function selectedCourseSlug() {
    return String((courseSelect && courseSelect.value) || "prompt-to-profit").trim() || "prompt-to-profit";
  }

  function setCourseOptions(items, preferredSlug) {
    if (!courseSelect) return;
    const selected = String(preferredSlug || courseSelect.value || "").trim().toLowerCase();
    const list = (Array.isArray(items) && items.length ? items : FALLBACK_COURSES)
      .map(function (item) {
        return {
          slug: String(item && item.slug || "").trim().toLowerCase(),
          label: String(item && item.label || item && item.slug || "").trim(),
        };
      })
      .filter(function (item) { return !!item.slug; });
    if (!list.length) return;
    courseSelect.innerHTML = list
      .map(function (item) {
        return '<option value="' + esc(item.slug) + '">' + esc(item.label || item.slug) + "</option>";
      })
      .join("");
    const hasSelected = list.some(function (item) { return item.slug === selected; });
    courseSelect.value = hasSelected ? selected : list[0].slug;
  }

  async function loadCourseOptions(preferredSlug) {
    if (!courseSelect) return;
    const res = await fetch("/.netlify/functions/course-slugs-list", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not load courses");
    setCourseOptions(Array.isArray(json.items) ? json.items : [], preferredSlug);
  }

  function setWalletState(isAuthenticated) {
    if (isAuthenticated == null) {
      if (authCard) {
        authCard.hidden = true;
        authCard.style.display = "none";
      }
      if (planCard) {
        planCard.hidden = true;
        planCard.style.display = "none";
      }
      if (accountIdentity) {
        accountIdentity.hidden = true;
      }
      if (workspaceSidebar) workspaceSidebar.hidden = true;
      if (workspaceTopbar) workspaceTopbar.hidden = true;
      if (guestStack) guestStack.hidden = true;
      if (bootSplash) bootSplash.hidden = false;
      if (dashboardMain) {
        dashboardMain.classList.add("flex", "items-center", "justify-center");
      }
      return;
    }

    const showPlan = !!isAuthenticated;
    if (authCard) {
      authCard.hidden = showPlan;
      authCard.style.display = showPlan ? "none" : "";
    }
    if (planCard) {
      planCard.hidden = !showPlan;
      planCard.style.display = showPlan ? "" : "none";
    }
    if (accountIdentity) {
      accountIdentity.hidden = !showPlan;
    }
    if (workspaceSidebar) workspaceSidebar.hidden = !showPlan;
    if (workspaceTopbar) workspaceTopbar.hidden = !showPlan;
    if (guestStack) guestStack.hidden = showPlan;
    if (bootSplash) bootSplash.hidden = true;
    if (dashboardMain) {
      if (showPlan) {
        dashboardMain.classList.remove("flex", "items-center", "justify-center");
      } else {
        dashboardMain.classList.remove("flex", "items-center", "justify-center");
        try {
          dashboardMain.scrollTop = 0;
        } catch (_error) {}
      }
    }
  }

  function setAuthView(mode) {
    authMode = mode === "signup" ? "signup" : "signin";
    if (signInForm) signInForm.hidden = authMode !== "signin";
    if (signUpForm) signUpForm.hidden = authMode !== "signup";
    if (schoolStudentCodeCard) schoolStudentCodeCard.hidden = authMode !== "signin";

    if (showSignInBtn) {
      const active = authMode === "signin";
      showSignInBtn.setAttribute("aria-selected", active ? "true" : "false");
      showSignInBtn.classList.toggle("bg-white", active);
      showSignInBtn.classList.toggle("shadow-sm", active);
      showSignInBtn.classList.toggle("ring-1", active);
      showSignInBtn.classList.toggle("ring-gray-200", active);
      showSignInBtn.classList.toggle("text-gray-900", active);
      showSignInBtn.classList.toggle("text-gray-600", !active);
    }

    if (showSignUpBtn) {
      const active = authMode === "signup";
      showSignUpBtn.setAttribute("aria-selected", active ? "true" : "false");
      showSignUpBtn.classList.toggle("bg-white", active);
      showSignUpBtn.classList.toggle("shadow-sm", active);
      showSignUpBtn.classList.toggle("ring-1", active);
      showSignUpBtn.classList.toggle("ring-gray-200", active);
      showSignUpBtn.classList.toggle("text-gray-900", active);
      showSignUpBtn.classList.toggle("text-gray-600", !active);
    }

    setMsg(authMsg, "", "");
  }

  function fmtMoney(minor, currency) {
    const amount = Number(minor || 0) / 100;
    const code = String(currency || "NGN").toUpperCase();
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(amount);
    } catch (_error) {
      return `${code} ${amount.toFixed(2)}`;
    }
  }

  function setMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("error", "ok");
    if (type === "error") el.classList.add("error");
    if (type === "ok") el.classList.add("ok");
  }

  function openFeedbackModal(config) {
    if (!feedbackModal || !feedbackTitle || !feedbackMessage) return;
    const tone = String(config && config.tone || "notice").toLowerCase();
    if (feedbackEyebrow) {
      feedbackEyebrow.textContent = tone === "error" ? "Attention" : tone === "success" ? "Success" : "Notice";
      feedbackEyebrow.className = "text-xs font-semibold uppercase tracking-wider " + (tone === "error" ? "text-red-600" : "text-brand-600");
    }
    feedbackTitle.textContent = String(config && config.title || "Update");
    feedbackMessage.textContent = String(config && config.message || "");
    feedbackModal.classList.remove("hidden");
    feedbackModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    if (feedbackAcknowledgeBtn) feedbackAcknowledgeBtn.focus();
  }

  function closeFeedbackModal() {
    if (!feedbackModal) return;
    feedbackModal.classList.add("hidden");
    feedbackModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function profileFromDashboard() {
    return dashboard && dashboard.account && typeof dashboard.account === "object"
      ? dashboard.account
      : null;
  }

  function fmtDate(value) {
    if (!value) return "";
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleString();
  }

  function renderProfile() {
    const account = profileFromDashboard();
    if (!account) {
      if (profileFullNameInput) profileFullNameInput.value = "";
      if (profileMsg) profileMsg.textContent = "";
      if (certWarnBanner) certWarnBanner.classList.add("hidden");
      if (certState) {
        certState.textContent = "";
        certState.classList.add("hidden");
      }
      if (confirmCertNameBtn) {
        confirmCertNameBtn.disabled = true;
        confirmCertNameBtn.textContent = "Confirm Certificate Name";
      }
      return;
    }

    if (profileFullNameInput && !profileFullNameInput.matches(":focus")) {
      profileFullNameInput.value = String(account.fullName || "");
    }

    const needs = account.certificateNameNeedsConfirmation === true;
    const confirmedAt = String(account.certificateNameConfirmedAt || "");
    const isLocked = !!confirmedAt && !needs;
    if (profileMsg) {
      profileMsg.textContent = isLocked
        ? "Certificate name is locked after one-time confirmation."
        : needs
        ? "Confirm your certificate name after any name change. Certificates will only be issued after confirmation."
        : confirmedAt
          ? "Certificate name confirmed on " + fmtDate(confirmedAt) + "."
          : "Certificate name confirmed.";
    }
    if (certWarnBanner) {
      if (needs) {
        certWarnBanner.textContent = "Certificate issuance is paused until you confirm your profile name.";
        certWarnBanner.classList.remove("hidden");
      } else {
        certWarnBanner.classList.add("hidden");
      }
    }
    if (certState) {
      certState.textContent = needs ? "Confirmation required" : "Confirmed";
      certState.classList.remove("hidden");
      certState.classList.toggle("text-amber-700", needs);
      certState.classList.toggle("text-emerald-700", !needs);
    }
    if (confirmCertNameBtn) {
      confirmCertNameBtn.disabled = !needs;
      confirmCertNameBtn.textContent = needs ? "Confirm Certificate Name" : "Certificate Name Confirmed";
    }
    if (profileFullNameInput) {
      profileFullNameInput.readOnly = isLocked;
      profileFullNameInput.classList.toggle("bg-gray-100", isLocked);
    }
    if (profileSaveBtn) {
      profileSaveBtn.disabled = isLocked;
      profileSaveBtn.textContent = isLocked ? "Name Locked" : "Save Name";
    }
  }

  function openCertificateConfirmModal() {
    if (!certConfirmModal) return;
    const fullName = String((profileFullNameInput && profileFullNameInput.value) || "").trim()
      || String((profileFromDashboard() && profileFromDashboard().fullName) || "").trim();
    if (certConfirmModalName) certConfirmModalName.textContent = fullName || "No name set";
    certConfirmModal.classList.remove("hidden");
    certConfirmModal.setAttribute("aria-hidden", "false");
  }

  function closeCertificateConfirmModal() {
    if (!certConfirmModal) return;
    certConfirmModal.classList.add("hidden");
    certConfirmModal.setAttribute("aria-hidden", "true");
  }

  function authHeaders() {
    var headers = { "Content-Type": "application/json" };
    try {
      if (typeof window.twsStudentDeviceId === "function") {
        var deviceId = String(window.twsStudentDeviceId() || "").trim();
        if (deviceId) headers["X-Student-Device-Id"] = deviceId;
      }
    } catch (_error) {}
    return headers;
  }

  function enforcePlanStartAvailability() {
    if (PLAN_START_ENABLED) return;
    if (createPlanBtn) {
      createPlanBtn.disabled = true;
      createPlanBtn.textContent = "Temporarily unavailable";
      createPlanBtn.setAttribute("aria-disabled", "true");
      createPlanBtn.title = PLAN_START_DISABLED_MSG;
      createPlanBtn.classList.add("wallet-plan-btn--enrol", "is-locked");
    }
    if (createPlanForm) {
      var fields = createPlanForm.querySelectorAll("input, select, button");
      Array.prototype.forEach.call(fields, function (el) {
        if (!el) return;
        if (el === createPlanBtn) return;
        el.disabled = true;
      });
    }
    setMsg(planMsg, PLAN_START_DISABLED_MSG, "error");
  }

  function setCouponStatus(text, type) {
    if (!couponStatusEl) return;
    const msg = String(text || "").trim();
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

  function renderCouponSummary() {
    if (!couponSummaryEl) return;
    if (!appliedPlanCoupon || !appliedPlanCoupon.pricing) {
      couponSummaryEl.classList.add("hidden");
      couponSummaryEl.textContent = "";
      return;
    }
    const pricing = appliedPlanCoupon.pricing;
    const baseText = fmtMoney(pricing.baseAmountMinor, pricing.currency || "NGN");
    const discountText = fmtMoney(pricing.discountMinor, pricing.currency || "NGN");
    const finalText = fmtMoney(pricing.finalAmountMinor, pricing.currency || "NGN");
    couponSummaryEl.textContent = `Original total: ${baseText} • Discount: -${discountText} • You pay: ${finalText}`;
    couponSummaryEl.classList.remove("hidden");
  }

  function clearAppliedCoupon(message) {
    appliedPlanCoupon = null;
    renderCouponSummary();
    if (message) setCouponStatus(message, "info");
  }

  async function api(url, options) {
    const request = Object.assign({ credentials: "include" }, options || {});
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, 20000);
    let res;
    try {
      request.signal = controller.signal;
      res = await fetch(url, request);
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("Request timed out. Please try again.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      const error = new Error((json && json.error) || "Request failed");
      if (json && json.code) error.code = String(json.code);
      throw error;
    }
    return json;
  }

  async function requestPasswordReset(emailInput) {
    const email = String(emailInput || "").trim();
    if (!email) throw new Error("Enter your email first.");
    await api("/.netlify/functions/user-auth-password-reset-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email }),
    });
  }

  function renderPlans() {
    if (!plansWrap) return;
    const plans = dashboard && Array.isArray(dashboard.plans) ? dashboard.plans : [];
    if (!plans.length) {
      plansWrap.innerHTML = '<p class="wallet-msg">No installment plan yet.</p>';
      return;
    }

    plansWrap.innerHTML = plans
      .map(function (plan) {
        const target = Number(plan.targetAmountMinor || 0);
        const paid = Number(plan.totalPaidMinor || 0);
        const remaining = Math.max(0, target - paid);
        const progress = target > 0 ? Math.min(100, Math.round((paid / target) * 100)) : 0;
        const disabledPay = String(plan.status || "") !== "open" || !PLAN_PAY_ENABLED;
        const canEnrolNow =
          !!plan.canEnrolNow &&
          target > 0 &&
          paid >= target &&
          String(plan.status || "").toLowerCase() === "open";
        const disableEnrol = !canEnrolNow;
        const enrolLabel = "Enrol";
        const showCancel = !!plan.canCancel;
        return [
          `<article class="wallet-plan" data-plan-uuid="${plan.planUuid}">`,
          `<p class="wallet-pill">${plan.batchLabel}</p>`,
          `<p style="margin-top:8px;font-weight:700;color:#14213d">${plan.courseSlug}</p>`,
          `${
            Number(plan.discountMinor || 0) > 0
              ? `<p class="wallet-msg" style="margin-top:4px">Coupon (${String(plan.couponCode || "").toUpperCase()}): -${fmtMoney(Number(plan.discountMinor || 0), plan.currency)}</p>`
              : ""
          }`,
          `<p class="wallet-msg" style="margin-top:6px">Paid: ${fmtMoney(paid, plan.currency)} / ${fmtMoney(target, plan.currency)}</p>`,
          `<p class="wallet-msg">Remaining: ${fmtMoney(remaining, plan.currency)}</p>`,
          `<div class="wallet-progress"><span style="width:${progress}%"></span></div>`,
          `<div class="wallet-plan-actions">`,
          `<input class="tw-input wallet-input wallet-topup-input" type="number" min="100" step="100" placeholder="Top-up amount (NGN)" data-topup-input ${disabledPay ? "disabled" : ""} />`,
          `<button class="btn btn-primary wallet-plan-btn wallet-plan-btn--enrol ${disabledPay ? "is-locked" : ""}" type="button" data-action="pay" ${disabledPay ? 'disabled aria-disabled="true" title="Pay Part is temporarily unavailable while Paystack approves our new business account."' : ""}>Pay Part</button>`,
          `<button class="btn btn-outline wallet-plan-btn wallet-plan-btn--enrol ${disableEnrol ? "is-locked" : ""}" type="button" data-action="enrol" ${disableEnrol ? "disabled aria-disabled=\"true\" title=\"Complete full payment to unlock enrolment\"" : ""}>${enrolLabel}</button>`,
          showCancel
            ? `<button class="btn btn-outline wallet-plan-btn" type="button" data-action="cancel">Cancel Plan</button>`
            : "",
          `</div>`,
          `</article>`,
        ].join("");
      })
      .join("");
  }

  async function loadBatches() {
    const courseSlug = selectedCourseSlug();
    const json = await api(`/.netlify/functions/installment-batches?course_slug=${encodeURIComponent(courseSlug)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const batches = Array.isArray(json.batches) ? json.batches : [];
    if (!batchSelect) return;
    batchSelect.innerHTML = batches
      .map(function (b) {
        return `<option value="${b.batchKey}">${b.batchLabel}</option>`;
      })
      .join("");
    const active = batches.find(function (b) {
      return !!b.isActive;
    });
    if (active) batchSelect.value = active.batchKey;
  }

  async function loadDashboard() {
    try {
      const json = await api("/.netlify/functions/installment-dashboard", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      dashboard = json;
      if (accountMeta && json.account) {
        var fullName = String(json.account.fullName || "");
        var email = String(json.account.email || "");
        var maskedCode = maskStudentCode(json.account.schoolStudentCode || "");
        accountMeta.textContent = isSyntheticSchoolEmail(email) && maskedCode
          ? (fullName + " • Code: " + maskedCode)
          : (fullName + " • " + email);
      }
      if (accountName && json.account) {
        accountName.textContent = String(json.account.fullName || "");
      }
      if (accountEmail && json.account) {
        var emailText = String(json.account.email || "");
        var maskedCodeText = maskStudentCode(json.account.schoolStudentCode || "");
        accountEmail.textContent = isSyntheticSchoolEmail(emailText) && maskedCodeText
          ? ("Code: " + maskedCodeText)
          : emailText;
      }
      setWalletState(true);
      renderProfile();
      renderPlans();
      setMsg(planMsg, "", "");
    } catch (_error) {
      dashboard = null;
      if (accountName) accountName.textContent = "";
      if (accountEmail) accountEmail.textContent = "";
      setWalletState(false);
      renderProfile();
      throw _error;
    }
  }

  async function updateProfileName() {
    const fullName = String((profileFullNameInput && profileFullNameInput.value) || "").trim();
    if (!fullName) {
      setMsg(profileActionMsg, "Enter your full name.", "error");
      return;
    }
    if (!profileSaveBtn) return;
    profileSaveBtn.disabled = true;
    profileSaveBtn.textContent = "Saving...";
    try {
      const json = await api("/.netlify/functions/user-profile-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
      });
      if (!dashboard) dashboard = {};
      dashboard.account = Object.assign({}, dashboard.account || {}, json.profile || {});
      if (accountName && json.profile) accountName.textContent = String(json.profile.fullName || fullName);
      renderProfile();
      setMsg(profileActionMsg, "Name updated. Reconfirm certificate name before issuance.", "ok");
    } catch (error) {
      setMsg(profileActionMsg, error.message || "Could not update profile name.", "error");
    } finally {
      profileSaveBtn.disabled = false;
      profileSaveBtn.textContent = "Save Name";
      renderProfile();
    }
  }

  async function confirmCertificateName() {
    if (!confirmCertNameBtn) return;
    confirmCertNameBtn.disabled = true;
    const originalText = confirmCertNameBtn.textContent;
    confirmCertNameBtn.textContent = "Confirming...";
    try {
      const json = await api("/.netlify/functions/user-profile-confirm-certificate-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!dashboard) dashboard = {};
      if (!dashboard.account) dashboard.account = {};
      dashboard.account.certificateNameConfirmedAt = json.certificateNameConfirmedAt || new Date().toISOString();
      dashboard.account.certificateNameNeedsConfirmation = false;
      renderProfile();
      setMsg(profileActionMsg, "Certificate name confirmed.", "ok");
    } catch (error) {
      setMsg(profileActionMsg, error.message || "Could not confirm certificate name.", "error");
    } finally {
      confirmCertNameBtn.textContent = originalText;
      renderProfile();
    }
  }

  async function changePassword() {
    const currentPassword = String((currentPasswordInput && currentPasswordInput.value) || "");
    const newPassword = String((newPasswordInput && newPasswordInput.value) || "");
    if (!currentPassword || !newPassword) {
      setMsg(profileActionMsg, "Enter your current and new password.", "error");
      return;
    }
    if (!passwordSaveBtn) return;
    passwordSaveBtn.disabled = true;
    const originalText = passwordSaveBtn.textContent;
    passwordSaveBtn.textContent = "Updating...";
    try {
      await api("/.netlify/functions/user-password-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (passwordForm) passwordForm.reset();
      setMsg(profileActionMsg, "Password updated successfully.", "ok");
    } catch (error) {
      setMsg(profileActionMsg, error.message || "Could not change password.", "error");
    } finally {
      passwordSaveBtn.disabled = false;
      passwordSaveBtn.textContent = originalText || "Change Password";
    }
  }

  async function handleRegister() {
    setMsg(authMsg, "", "");
    const fullName = String((signUpForm && signUpForm.fullName && signUpForm.fullName.value) || "").trim();
    const email = String((signUpForm && signUpForm.email && signUpForm.email.value) || "").trim();
    const password = String((signUpForm && signUpForm.password && signUpForm.password.value) || "");
    if (!fullName || !email || password.length < 8) {
      setMsg(authMsg, "Full Name, email and password (8+ chars) are required.", "error");
      return;
    }

    registerBtn.disabled = true;
    registerBtn.textContent = "Creating...";
    try {
      await api("/.netlify/functions/user-auth-register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ fullName, email, password }),
      });
      setWalletState(true);
      setMsg(authMsg, "Account created. Signed in.", "ok");
      if (signUpForm) signUpForm.reset();
      await loadDashboard();
      await loadBatches();
    } catch (error) {
      setMsg(authMsg, error.message || "Could not create account", "error");
    } finally {
      registerBtn.disabled = false;
      registerBtn.textContent = "Create Account";
    }
  }

  async function handleLogin() {
    setMsg(authMsg, "", "");
    const email = String((signInForm && signInForm.email && signInForm.email.value) || "").trim();
    const password = String((signInForm && signInForm.password && signInForm.password.value) || "");
    if (!email || !password) {
      setMsg(authMsg, "Enter email and password.", "error");
      return;
    }
    loginBtn.disabled = true;
    loginBtn.textContent = "Signing in...";
    try {
      await api("/.netlify/functions/user-auth-login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email, password }),
      });
      setWalletState(true);
      setMsg(authMsg, "Signed in.", "ok");
      if (signInForm) signInForm.reset();
      await loadDashboard();
      await loadBatches();
    } catch (error) {
      if (error && error.code === "PASSWORD_RESET_REQUIRED") {
        try {
          await requestPasswordReset(email);
          openFeedbackModal({
            tone: "success",
            title: "Reset link sent",
            message: "Password reset is required before sign in. We have sent a reset link to your email.",
          });
          return;
        } catch (resetError) {
          openFeedbackModal({
            tone: "error",
            title: "Reset link not sent",
            message: resetError.message || "Password reset is required, but we could not send your reset link right now.",
          });
          return;
        }
      }
      setMsg(authMsg, error.message || "Could not sign in", "error");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "Sign In";
    }
  }

  async function handleSchoolStudentCodeLogin() {
    setMsg(authMsg, "", "");
    const code = String((schoolStudentCodeInput && schoolStudentCodeInput.value) || "").trim().toUpperCase();
    if (!code) {
      setMsg(authMsg, "Enter your student code.", "error");
      return;
    }
    if (!schoolStudentCodeBtn) return;

    const originalText = schoolStudentCodeBtn.textContent;
    schoolStudentCodeBtn.disabled = true;
    schoolStudentCodeBtn.textContent = schoolStudentChallenge ? "Signing in..." : "Checking...";
    try {
      const payload = schoolStudentChallenge
        ? {
            code: code,
            confirm: true,
            challenge: schoolStudentChallenge,
            confirmName: String((schoolStudentNameConfirmInput && schoolStudentNameConfirmInput.value) || "").trim(),
          }
        : { code: code };
      const data = await api("/.netlify/functions/school-student-code-login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      if (data && data.needsConfirm) {
        schoolStudentChallenge = String(data.challenge || "");
        if (schoolStudentCodeConfirmHint) {
          schoolStudentCodeConfirmHint.textContent = "Confirm student: " + String(data.student && data.student.maskedName || "Student");
          schoolStudentCodeConfirmHint.classList.remove("hidden");
        }
        if (schoolStudentNameConfirmWrap) schoolStudentNameConfirmWrap.classList.remove("hidden");
        if (schoolStudentNameConfirmInput) {
          schoolStudentNameConfirmInput.value = "";
          schoolStudentNameConfirmInput.focus();
        }
        schoolStudentCodeBtn.textContent = "Confirm & Sign In";
        setMsg(authMsg, "Type your full name to continue.", "ok");
        return;
      }

      schoolStudentChallenge = "";
      if (schoolStudentCodeConfirmHint) {
        schoolStudentCodeConfirmHint.textContent = "";
        schoolStudentCodeConfirmHint.classList.add("hidden");
      }
      if (schoolStudentNameConfirmWrap) schoolStudentNameConfirmWrap.classList.add("hidden");
      if (schoolStudentNameConfirmInput) schoolStudentNameConfirmInput.value = "";
      setWalletState(true);
      setMsg(authMsg, "Signed in.", "ok");
      if (schoolStudentCodeForm) schoolStudentCodeForm.reset();
      await loadDashboard();
      await loadBatches();
    } catch (error) {
      schoolStudentChallenge = "";
      if (schoolStudentCodeConfirmHint) {
        schoolStudentCodeConfirmHint.textContent = "";
        schoolStudentCodeConfirmHint.classList.add("hidden");
      }
      if (schoolStudentNameConfirmWrap) schoolStudentNameConfirmWrap.classList.add("hidden");
      if (schoolStudentNameConfirmInput) schoolStudentNameConfirmInput.value = "";
      setMsg(authMsg, error.message || "Could not sign in with student code", "error");
    } finally {
      schoolStudentCodeBtn.disabled = false;
      if (!schoolStudentChallenge) schoolStudentCodeBtn.textContent = originalText || "Continue With Code";
    }
  }

  async function createPlan() {
    if (!PLAN_START_ENABLED) {
      setMsg(planMsg, PLAN_START_DISABLED_MSG, "error");
      return;
    }
    const batchKey = String((batchSelect && batchSelect.value) || "").trim();
    if (!batchKey) {
      setMsg(planMsg, "Select a batch.", "error");
      return;
    }
    createPlanBtn.disabled = true;
    createPlanBtn.textContent = "Starting...";
    try {
      const created = await api("/.netlify/functions/installment-plan-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseSlug: selectedCourseSlug(),
          batchKey,
          couponCode: appliedPlanCoupon
            ? appliedPlanCoupon.code
            : String((couponCodeInput && couponCodeInput.value) || "").trim(),
        }),
      });
      await loadDashboard();
      if (created && created.reused) {
        setMsg(planMsg, "Existing open plan found for this course and batch.", "ok");
      } else {
        setMsg(planMsg, "Plan ready. Start paying in parts.", "ok");
      }
      clearAppliedCoupon("");
      if (couponCodeInput) couponCodeInput.value = "";
    } catch (error) {
      if (error && error.code === "payment_lock_active") {
        setMsg(
          planMsg,
          "Plan start is unavailable because a payment already exists for this course (online paid or manual pending/approved).",
          "error"
        );
        return;
      }
      setMsg(planMsg, error.message || "Could not create plan", "error");
    } finally {
      createPlanBtn.disabled = false;
      createPlanBtn.textContent = "Start Plan";
    }
  }

  async function applyInstallmentCoupon() {
    const batchKey = String((batchSelect && batchSelect.value) || "").trim();
    if (!batchKey) {
      setCouponStatus("Select a batch first.", "error");
      return;
    }
    const couponCode = String((couponCodeInput && couponCodeInput.value) || "").trim();
    if (!couponCode) {
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
      const json = await api("/.netlify/functions/installment-coupon-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseSlug: selectedCourseSlug(),
          batchKey: batchKey,
          couponCode: couponCode,
          email: dashboard && dashboard.account ? dashboard.account.email : "",
        }),
      });
      appliedPlanCoupon = {
        code: String((json.coupon && json.coupon.code) || couponCode).toUpperCase(),
        pricing: json.pricing || null,
      };
      if (couponCodeInput) couponCodeInput.value = appliedPlanCoupon.code;
      renderCouponSummary();
      setCouponStatus("Coupon applied to your installment total.", "ok");
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

  function openPaystackInline(config) {
    if (!window.PaystackPop || typeof window.PaystackPop.setup !== "function") return false;
    const handler = window.PaystackPop.setup({
      key: config.publicKey,
      email: config.email || "",
      amount: Number(config.amountMinor || 0),
      ref: config.reference,
      access_code: config.accessCode,
      callback: function (response) {
        const reference = String((response && response.reference) || config.reference || "").trim();
        if (!reference) {
          setMsg(planMsg, "Payment completed. Verifying...", "ok");
          loadDashboard().catch(function () {
            return null;
          });
          return;
        }
        window.location.href = `/.netlify/functions/installment-paystack-return?reference=${encodeURIComponent(reference)}`;
      },
      onClose: function () {
        openFeedbackModal({
          tone: "error",
          title: "Payment cancelled",
          message: "You cancelled the payment and you have not been enrolled in the course yet.",
        });
      },
    });
    handler.openIframe();
    return true;
  }

  async function payPart(planUuid, amountMinor) {
    const json = await api("/.netlify/functions/installment-create-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planUuid, amountMinor }),
    });

    const openedInline = json.publicKey && json.accessCode ? openPaystackInline({
      publicKey: json.publicKey,
      accessCode: json.accessCode,
      reference: json.reference,
      amountMinor: json.amountMinor || amountMinor,
      email: json.email || (dashboard && dashboard.account ? dashboard.account.email : ""),
    }) : false;

    if (!openedInline && json.checkoutUrl) {
      window.location.href = json.checkoutUrl;
    }
  }

  async function enrolNow(planUuid) {
    await api("/.netlify/functions/installment-enrol-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planUuid }),
    });
    await loadDashboard();
    setMsg(planMsg, "Enrolment completed. Added to payments queue.", "ok");
  }

  async function cancelPlan(planUuid) {
    await api("/.netlify/functions/installment-plan-cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planUuid }),
    });
    await loadDashboard();
    setMsg(planMsg, "Plan cancelled.", "ok");
  }

  if (signUpForm) {
    signUpForm.addEventListener("submit", function (event) {
      event.preventDefault();
      handleRegister().catch(function () {
        return null;
      });
    });
  }

  if (signInForm) {
    signInForm.addEventListener("submit", function (event) {
      event.preventDefault();
      handleLogin().catch(function () {
        return null;
      });
    });
  }
  if (schoolStudentCodeForm) {
    schoolStudentCodeForm.addEventListener("submit", function (event) {
      event.preventDefault();
      handleSchoolStudentCodeLogin();
    });
  }

  if (showSignInBtn) {
    showSignInBtn.addEventListener("click", function () {
      setAuthView("signin");
    });
  }

  if (showSignUpBtn) {
    showSignUpBtn.addEventListener("click", function () {
      setAuthView("signup");
    });
  }

  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", function () {
      const email = String((signInForm && signInForm.email && signInForm.email.value) || "").trim();
      requestPasswordReset(email)
        .then(function () {
          openFeedbackModal({
            tone: "success",
            title: "Reset link sent",
            message: "If an account exists for this email, a password reset link has been sent.",
          });
        })
        .catch(function (error) {
          openFeedbackModal({
            tone: "error",
            title: "Reset request failed",
            message: error.message || "Could not send reset link.",
          });
        });
    });
  }

  if (feedbackModal) {
    feedbackModal.addEventListener("click", function (event) {
      if (event.target.closest("[data-wallet-feedback-close]")) closeFeedbackModal();
    });
  }

  if (feedbackAcknowledgeBtn) {
    feedbackAcknowledgeBtn.addEventListener("click", closeFeedbackModal);
  }

  if (courseSelect) {
    courseSelect.addEventListener("change", function () {
      clearAppliedCoupon("");
      if (couponCodeInput) couponCodeInput.value = "";
      loadBatches().catch(function (error) {
        setMsg(planMsg, error.message || "Could not load batches", "error");
      });
    });
  }

  if (batchSelect) {
    batchSelect.addEventListener("change", function () {
      clearAppliedCoupon("");
      if (couponCodeInput) couponCodeInput.value = "";
    });
  }

  if (applyCouponBtn) {
    applyCouponBtn.addEventListener("click", function () {
      applyInstallmentCoupon().catch(function () {
        return null;
      });
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      await fetch("/.netlify/functions/user-auth-logout", { method: "POST", credentials: "include" }).catch(function () {
        return null;
      });
      dashboard = null;
      if (accountName) accountName.textContent = "";
      if (accountEmail) accountEmail.textContent = "";
      setWalletState(false);
      renderProfile();
      setMsg(planMsg, "", "");
      setMsg(profileActionMsg, "", "");
      setAuthView("signin");
    });
  }

  if (createPlanForm) {
    createPlanForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!PLAN_START_ENABLED) {
        setMsg(planMsg, PLAN_START_DISABLED_MSG, "error");
        return;
      }
      createPlan().catch(function (error) {
        setMsg(planMsg, error.message || "Could not start plan", "error");
      });
    });
  }

  if (profileForm) {
    profileForm.addEventListener("submit", function (event) {
      event.preventDefault();
      updateProfileName().catch(function () {
        return null;
      });
    });
  }

  if (confirmCertNameBtn) {
    confirmCertNameBtn.addEventListener("click", function () {
      const account = profileFromDashboard();
      if (!account || account.certificateNameNeedsConfirmation !== true) return;
      openCertificateConfirmModal();
    });
  }

  if (certConfirmModal) {
    certConfirmModal.addEventListener("click", function (event) {
      if (event.target.closest("[data-cert-confirm-modal-close]")) {
        closeCertificateConfirmModal();
      }
    });
  }

  if (certConfirmModalAcceptBtn) {
    certConfirmModalAcceptBtn.addEventListener("click", function () {
      certConfirmModalAcceptBtn.disabled = true;
      certConfirmModalAcceptBtn.textContent = "Confirming...";
      confirmCertificateName()
        .then(function () {
          closeCertificateConfirmModal();
        })
        .catch(function () {
          return null;
        })
        .finally(function () {
          certConfirmModalAcceptBtn.disabled = false;
          certConfirmModalAcceptBtn.textContent = "Confirm & Lock Name";
        });
    });
  }

  if (passwordForm) {
    passwordForm.addEventListener("submit", function (event) {
      event.preventDefault();
      changePassword().catch(function () {
        return null;
      });
    });
  }

  if (profileNavLink) {
    profileNavLink.addEventListener("click", function (event) {
      event.preventDefault();
      if (!profileCard) return;
      profileCard.scrollIntoView({ behavior: "smooth", block: "start" });
      if (profileFullNameInput) {
        setTimeout(function () {
          profileFullNameInput.focus();
        }, 220);
      }
    });
  }

  if (plansWrap) {
    plansWrap.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const card = button.closest("[data-plan-uuid]");
      if (!card) return;
      const planUuid = card.getAttribute("data-plan-uuid");
      const action = button.getAttribute("data-action");
      if (!planUuid || !action) return;

      if (action === "pay") {
        const input = card.querySelector("[data-topup-input]");
        const amountNgn = Number(input && input.value ? input.value : 0);
        if (!Number.isFinite(amountNgn) || amountNgn < 100) {
          setMsg(planMsg, "Enter a valid top-up amount in Naira.", "error");
          return;
        }
        const amountMinor = Math.round(amountNgn * 100);
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = "Opening...";
        payPart(planUuid, amountMinor).catch(function (error) {
          setMsg(planMsg, error.message || "Could not start payment", "error");
        }).finally(function () {
          button.disabled = false;
          button.textContent = originalText || "Pay Part";
        });
      } else if (action === "enrol") {
        enrolNow(planUuid).catch(function (error) {
          setMsg(planMsg, error.message || "Could not enrol now", "error");
        });
      } else if (action === "cancel") {
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = "Cancelling...";
        cancelPlan(planUuid).catch(function (error) {
          setMsg(planMsg, error.message || "Could not cancel plan", "error");
        }).finally(function () {
          button.disabled = false;
          button.textContent = originalText || "Cancel Plan";
        });
      }
    });
  }

  const qs = new URLSearchParams(window.location.search);
  const preselectedCourse = String(qs.get("course_slug") || "").trim().toLowerCase();
  const payment = String(qs.get("payment") || "").trim().toLowerCase();
  if (payment === "success") setMsg(planMsg, "Installment payment successful.", "ok");
  if (payment === "failed") setMsg(planMsg, "Installment payment failed.", "error");
  if (payment === "cancelled") {
    openFeedbackModal({
      tone: "error",
      title: "Payment cancelled",
      message: "Your payment was cancelled and you have not been enrolled in the course yet.",
    });
  }
  if (payment) {
    const url = new URL(window.location.href);
    url.searchParams.delete("payment");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }

  setWalletState(null);
  loadCourseOptions(preselectedCourse)
    .catch(function () {
      setCourseOptions(FALLBACK_COURSES, preselectedCourse);
      return null;
    })
    .then(function () {
      return loadDashboard();
    })
    .then(function () {
      return loadBatches().catch(function () {
        return null;
      });
    })
    .catch(function () {
      setWalletState(false);
      return null;
    });
  setAuthView("signin");
  enforcePlanStartAvailability();
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && feedbackModal && !feedbackModal.classList.contains("hidden")) {
      closeFeedbackModal();
    }
    if (event.key === "Escape" && certConfirmModal && !certConfirmModal.classList.contains("hidden")) {
      closeCertificateConfirmModal();
    }
  });
})();
