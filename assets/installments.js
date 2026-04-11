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

  const logoutBtn = document.getElementById("walletLogoutBtn");
  const accountMeta = document.getElementById("walletAccountMeta");
  const accountName = document.getElementById("walletAccountName");
  const accountEmail = document.getElementById("walletAccountEmail");
  const accountIdentity = document.getElementById("walletAccountIdentity");
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

  let dashboard = null;
  let authMode = "signin";
  let appliedPlanCoupon = null;
  const PLAN_START_ENABLED = true;
  const PLAN_PAY_ENABLED = true;
  const PLAN_START_DISABLED_MSG = "Start plan is temporarily unavailable while Paystack approves our new business account.";
  const FALLBACK_COURSES = [
    { slug: "prompt-to-profit", label: "Prompt to Profit" },
    { slug: "prompt-to-production", label: "Prompt to Production" },
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
    const res = await fetch(url, request);
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
        accountMeta.textContent = `${json.account.fullName} • ${json.account.email}`;
      }
      if (accountName && json.account) {
        accountName.textContent = String(json.account.fullName || "");
      }
      if (accountEmail && json.account) {
        accountEmail.textContent = String(json.account.email || "");
      }
      setWalletState(true);
      renderPlans();
      setMsg(planMsg, "", "");
    } catch (_error) {
      dashboard = null;
      if (accountName) accountName.textContent = "";
      if (accountEmail) accountEmail.textContent = "";
      setWalletState(false);
      throw _error;
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
          setMsg(authMsg, "Password reset required. We sent a reset link to your email.", "ok");
          return;
        } catch (resetError) {
          setMsg(authMsg, resetError.message || "Password reset required. Could not send reset link.", "error");
          return;
        }
      }
      setMsg(authMsg, error.message || "Could not sign in", "error");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "Sign In";
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
        setMsg(planMsg, "Payment window closed.", "");
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
          setMsg(authMsg, "If the account exists, a reset link has been sent.", "ok");
        })
        .catch(function (error) {
          setMsg(authMsg, error.message || "Could not send reset link.", "error");
        });
    });
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
      setMsg(planMsg, "", "");
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
})();
