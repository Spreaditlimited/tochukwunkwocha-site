(function () {
  const authCard = document.getElementById("walletAuthCard");
  const planCard = document.getElementById("walletPlanCard");

  const signInForm = document.getElementById("walletSignInForm");
  const signUpForm = document.getElementById("walletSignUpForm");
  const showSignInBtn = document.getElementById("walletShowSignInBtn");
  const showSignUpBtn = document.getElementById("walletShowSignUpBtn");
  const registerBtn = document.getElementById("walletRegisterBtn");
  const loginBtn = document.getElementById("walletLoginBtn");
  const authMsg = document.getElementById("walletAuthMsg");

  const logoutBtn = document.getElementById("walletLogoutBtn");
  const accountMeta = document.getElementById("walletAccountMeta");
  const batchSelect = document.getElementById("walletBatch");
  const createPlanForm = document.getElementById("walletCreatePlanForm");
  const createPlanBtn = document.getElementById("walletCreatePlanBtn");
  const plansWrap = document.getElementById("walletPlans");
  const planMsg = document.getElementById("walletPlanMsg");

  let dashboard = null;
  let authMode = "signin";

  function setWalletState(isAuthenticated) {
    const showPlan = !!isAuthenticated;
    if (authCard) {
      authCard.hidden = showPlan;
      authCard.style.display = showPlan ? "none" : "";
    }
    if (planCard) {
      planCard.hidden = !showPlan;
      planCard.style.display = showPlan ? "" : "none";
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

  async function api(url, options) {
    const request = Object.assign({ credentials: "include" }, options || {});
    const res = await fetch(url, request);
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Request failed");
    }
    return json;
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
        const disabledPay = String(plan.status || "") !== "open";
        const canEnrolNow =
          !!plan.canEnrolNow &&
          target > 0 &&
          paid >= target &&
          String(plan.status || "").toLowerCase() === "open";
        const disableEnrol = !canEnrolNow;
        return [
          `<article class="wallet-plan" data-plan-uuid="${plan.planUuid}">`,
          `<p class="wallet-pill">${plan.batchLabel}</p>`,
          `<p style="margin-top:8px;font-weight:700;color:#14213d">${plan.courseSlug}</p>`,
          `<p class="wallet-msg" style="margin-top:6px">Paid: ${fmtMoney(paid, plan.currency)} / ${fmtMoney(target, plan.currency)}</p>`,
          `<p class="wallet-msg">Remaining: ${fmtMoney(remaining, plan.currency)}</p>`,
          `<div class="wallet-progress"><span style="width:${progress}%"></span></div>`,
          `<div class="wallet-plan-actions">`,
          `<input class="tw-input wallet-input wallet-topup-input" type="number" min="100" step="100" placeholder="Top-up amount (NGN)" data-topup-input ${disabledPay ? "disabled" : ""} />`,
          `<button class="btn btn-primary wallet-plan-btn" type="button" data-action="pay" ${disabledPay ? "disabled" : ""}>Pay Part</button>`,
          `<button class="btn btn-outline wallet-plan-btn" type="button" data-action="enrol" ${disableEnrol ? "disabled" : ""}>Enrol Now</button>`,
          `</div>`,
          `</article>`,
        ].join("");
      })
      .join("");
  }

  async function loadBatches() {
    const json = await api("/.netlify/functions/installment-batches?course_slug=prompt-to-profit", {
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
      setWalletState(true);
      renderPlans();
      setMsg(planMsg, "", "");
    } catch (_error) {
      dashboard = null;
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
      await api("/.netlify/functions/student-auth-register", {
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
      await api("/.netlify/functions/student-auth-login", {
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
      setMsg(authMsg, error.message || "Could not sign in", "error");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "Sign In";
    }
  }

  async function createPlan() {
    const batchKey = String((batchSelect && batchSelect.value) || "").trim();
    if (!batchKey) {
      setMsg(planMsg, "Select a batch.", "error");
      return;
    }
    createPlanBtn.disabled = true;
    createPlanBtn.textContent = "Starting...";
    try {
      await api("/.netlify/functions/installment-plan-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseSlug: "prompt-to-profit", batchKey }),
      });
      await loadDashboard();
      setMsg(planMsg, "Plan ready. Start paying in parts.", "ok");
    } catch (error) {
      setMsg(planMsg, error.message || "Could not create plan", "error");
    } finally {
      createPlanBtn.disabled = false;
      createPlanBtn.textContent = "Start Plan";
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

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      await fetch("/.netlify/functions/student-auth-logout", { method: "POST", credentials: "include" }).catch(function () {
        return null;
      });
      dashboard = null;
      setWalletState(false);
      setMsg(planMsg, "", "");
      setAuthView("signin");
    });
  }

  if (createPlanForm) {
    createPlanForm.addEventListener("submit", function (event) {
      event.preventDefault();
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
      }
    });
  }

  const qs = new URLSearchParams(window.location.search);
  const payment = String(qs.get("payment") || "").trim().toLowerCase();
  if (payment === "success") setMsg(planMsg, "Installment payment successful.", "ok");
  if (payment === "failed") setMsg(planMsg, "Installment payment failed.", "error");
  if (payment) {
    const url = new URL(window.location.href);
    url.searchParams.delete("payment");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }

  Promise.all([loadBatches(), loadDashboard()]).catch(function () {
    setWalletState(false);
    return null;
  });
  setWalletState(false);
  setAuthView("signin");
})();
