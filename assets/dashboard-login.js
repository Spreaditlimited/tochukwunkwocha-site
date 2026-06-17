(function () {
  var SIGNOUT_MARKER_KEY = "tn_auth_just_signed_out";
  var authCard = document.getElementById("walletAuthCard");
  var signInForm = document.getElementById("walletSignInForm");
  var signUpForm = document.getElementById("walletSignUpForm");
  var showSignInBtn = document.getElementById("walletShowSignInBtn");
  var showSignUpBtn = document.getElementById("walletShowSignUpBtn");
  var registerBtn = document.getElementById("walletRegisterBtn");
  var loginBtn = document.getElementById("walletLoginBtn");
  var forgotPasswordBtn = document.getElementById("walletForgotPasswordBtn");
  var authMsg = document.getElementById("walletAuthMsg");
  var schoolStudentCodeCard = document.getElementById("schoolStudentCodeCard");
  var schoolStudentCodeForm = document.getElementById("schoolStudentCodeForm");
  var schoolStudentCodeInput = document.getElementById("schoolStudentCodeInput");
  var schoolStudentCodeBtn = document.getElementById("schoolStudentCodeBtn");
  var schoolStudentCodeConfirmHint = document.getElementById("schoolStudentCodeConfirmHint");
  var schoolStudentNameConfirmWrap = document.getElementById("schoolStudentNameConfirmWrap");
  var schoolStudentNameConfirmInput = document.getElementById("schoolStudentNameConfirmInput");
  var studentCodeSchoolTab = document.getElementById("studentCodeSchoolTab");
  var studentCodeFamilyTab = document.getElementById("studentCodeFamilyTab");
  var studentCodeLoginHelp = document.getElementById("studentCodeLoginHelp");
  var studentCodeInputLabel = document.getElementById("studentCodeInputLabel");
  var feedbackModal = document.getElementById("walletFeedbackModal");
  var feedbackEyebrow = document.getElementById("walletFeedbackEyebrow");
  var feedbackTitle = document.getElementById("walletFeedbackTitle");
  var feedbackMessage = document.getElementById("walletFeedbackMessage");
  var feedbackAcknowledgeBtn = document.getElementById("walletFeedbackAcknowledgeBtn");
  var authMode = "signin";
  var studentCodeMode = "school";
  var studentCodeChallenge = "";

  function clean(value) {
    return String(value || "").trim();
  }

  function headers() {
    return { "Content-Type": "application/json", Accept: "application/json" };
  }

  function setMsg(text, type) {
    if (!authMsg) return;
    authMsg.textContent = clean(text);
    authMsg.className = "text-sm mt-4 text-center font-medium";
    if (type === "error") authMsg.classList.add("text-red-400");
    else if (type === "ok") authMsg.classList.add("text-emerald-400");
    else authMsg.classList.add("text-slate-400");
  }

  async function api(url, options) {
    var request = Object.assign({ credentials: "include" }, options || {});
    var response = await fetch(url, request);
    var data = await response.json().catch(function () {
      return null;
    });
    if (!response.ok || !data || data.ok !== true) {
      var error = new Error((data && data.error) || "Request failed");
      if (data && data.code) error.code = String(data.code);
      throw error;
    }
    return data;
  }

  function redirectToDashboard() {
    var query = new URLSearchParams(window.location.search || "");
    var next = clean(query.get("next"));
    if (next && next.charAt(0) === "/" && next.indexOf("//") !== 0) {
      window.location.href = next;
      return;
    }
    window.location.href = "/dashboard/";
  }

  function setAuthView(mode) {
    authMode = mode === "signup" ? "signup" : "signin";
    if (signInForm) signInForm.hidden = authMode !== "signin";
    if (signUpForm) signUpForm.hidden = authMode !== "signup";
    if (schoolStudentCodeCard) schoolStudentCodeCard.hidden = authMode !== "signin";

    [
      { el: showSignInBtn, active: authMode === "signin" },
      { el: showSignUpBtn, active: authMode === "signup" },
    ].forEach(function (item) {
      if (!item.el) return;
      item.el.setAttribute("aria-selected", item.active ? "true" : "false");
      item.el.classList.toggle("bg-white", item.active);
      item.el.classList.toggle("shadow-sm", item.active);
      item.el.classList.toggle("ring-1", item.active);
      item.el.classList.toggle("ring-gray-200", item.active);
      item.el.classList.toggle("text-gray-900", item.active);
      item.el.classList.toggle("text-gray-600", !item.active);
    });
    setMsg("", "");
  }

  function setStudentCodeMode(mode) {
    studentCodeMode = mode === "family" ? "family" : "school";
    studentCodeChallenge = "";
    if (schoolStudentCodeForm) schoolStudentCodeForm.reset();
    if (schoolStudentCodeConfirmHint) {
      schoolStudentCodeConfirmHint.textContent = "";
      schoolStudentCodeConfirmHint.classList.add("hidden");
    }
    if (schoolStudentNameConfirmWrap) schoolStudentNameConfirmWrap.classList.add("hidden");
    if (studentCodeLoginHelp) {
      studentCodeLoginHelp.textContent = studentCodeMode === "family"
        ? "Use the child access code from your family dashboard."
        : "Use your school student code.";
    }
    if (studentCodeInputLabel) {
      studentCodeInputLabel.textContent = studentCodeMode === "family" ? "Family child code" : "School student code";
    }
    if (schoolStudentCodeBtn) schoolStudentCodeBtn.textContent = "Continue With Code";
    [
      { el: studentCodeSchoolTab, active: studentCodeMode === "school" },
      { el: studentCodeFamilyTab, active: studentCodeMode === "family" },
    ].forEach(function (item) {
      if (!item.el) return;
      item.el.setAttribute("aria-selected", item.active ? "true" : "false");
      item.el.classList.toggle("bg-amber-100", item.active);
      item.el.classList.toggle("text-amber-900", item.active);
      item.el.classList.toggle("text-gray-600", !item.active);
    });
  }

  function openFeedbackModal(options) {
    if (!feedbackModal) return;
    var tone = options && options.tone === "error" ? "error" : "success";
    if (feedbackEyebrow) feedbackEyebrow.textContent = tone === "error" ? "Action needed" : "Check your email";
    if (feedbackTitle) feedbackTitle.textContent = clean(options && options.title);
    if (feedbackMessage) feedbackMessage.textContent = clean(options && options.message);
    feedbackModal.classList.remove("hidden");
    feedbackModal.setAttribute("aria-hidden", "false");
  }

  function closeFeedbackModal() {
    if (!feedbackModal) return;
    feedbackModal.classList.add("hidden");
    feedbackModal.setAttribute("aria-hidden", "true");
  }

  async function requestPasswordReset(email) {
    if (!email) throw new Error("Enter your email first.");
    await api("/.netlify/functions/user-auth-password-reset-request", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email: email }),
    });
  }

  async function handleRegister() {
    var fullName = clean(signUpForm && signUpForm.fullName && signUpForm.fullName.value);
    var email = clean(signUpForm && signUpForm.email && signUpForm.email.value);
    var phone = clean(signUpForm && signUpForm.phone && signUpForm.phone.value);
    var password = String((signUpForm && signUpForm.password && signUpForm.password.value) || "");
    if (!fullName || !email || !phone || password.length < 8) {
      setMsg("Full Name, email, WhatsApp number, and password (8+ chars) are required.", "error");
      return;
    }
    registerBtn.disabled = true;
    registerBtn.textContent = "Creating...";
    try {
      await api("/.netlify/functions/user-auth-register", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ fullName: fullName, email: email, phone: phone, password: password }),
      });
      redirectToDashboard();
    } catch (error) {
      setMsg(error.message || "Could not create account.", "error");
    } finally {
      registerBtn.disabled = false;
      registerBtn.textContent = "Create Account";
    }
  }

  async function handleLogin() {
    var email = clean(signInForm && signInForm.email && signInForm.email.value);
    var password = String((signInForm && signInForm.password && signInForm.password.value) || "");
    if (!email || !password) {
      setMsg("Enter email and password.", "error");
      return;
    }
    loginBtn.disabled = true;
    loginBtn.textContent = "Signing in...";
    try {
      await api("/.netlify/functions/user-auth-login", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email: email, password: password }),
      });
      redirectToDashboard();
    } catch (error) {
      if (error && error.code === "PASSWORD_RESET_REQUIRED") {
        try {
          await requestPasswordReset(email);
          openFeedbackModal({
            tone: "success",
            title: "Reset link sent",
            message: "Password reset is required before sign in. We have sent a reset link to your email.",
          });
        } catch (resetError) {
          openFeedbackModal({
            tone: "error",
            title: "Reset link not sent",
            message: resetError.message || "Password reset is required, but we could not send your reset link right now.",
          });
        }
        return;
      }
      setMsg(error.message || "Could not sign in.", "error");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "Sign In";
    }
  }

  async function handleStudentCodeLogin() {
    var code = clean(schoolStudentCodeInput && schoolStudentCodeInput.value).toUpperCase();
    if (!code) {
      setMsg("Enter your student code.", "error");
      return;
    }
    var originalText = schoolStudentCodeBtn.textContent;
    schoolStudentCodeBtn.disabled = true;
    schoolStudentCodeBtn.textContent = studentCodeChallenge ? "Signing in..." : "Checking...";
    try {
      var payload = studentCodeChallenge
        ? {
            code: code,
            confirm: true,
            challenge: studentCodeChallenge,
            confirmName: clean(schoolStudentNameConfirmInput && schoolStudentNameConfirmInput.value),
          }
        : { code: code };
      var endpoint = studentCodeMode === "family"
        ? "/.netlify/functions/family-child-code-login"
        : "/.netlify/functions/school-student-code-login";
      var data = await api(endpoint, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload),
      });
      if (data && data.needsConfirm) {
        studentCodeChallenge = clean(data.challenge);
        if (schoolStudentCodeConfirmHint) {
          schoolStudentCodeConfirmHint.textContent = "Confirm student: " + clean(data.student && data.student.maskedName || "Student");
          schoolStudentCodeConfirmHint.classList.remove("hidden");
        }
        if (schoolStudentNameConfirmWrap) schoolStudentNameConfirmWrap.classList.remove("hidden");
        if (schoolStudentNameConfirmInput) schoolStudentNameConfirmInput.focus();
        schoolStudentCodeBtn.textContent = "Confirm & Sign In";
        setMsg("Type your full name to continue.", "ok");
        return;
      }
      redirectToDashboard();
    } catch (error) {
      studentCodeChallenge = "";
      if (schoolStudentCodeConfirmHint) {
        schoolStudentCodeConfirmHint.textContent = "";
        schoolStudentCodeConfirmHint.classList.add("hidden");
      }
      if (schoolStudentNameConfirmWrap) schoolStudentNameConfirmWrap.classList.add("hidden");
      setMsg(error.message || "Could not sign in with student code.", "error");
    } finally {
      schoolStudentCodeBtn.disabled = false;
      if (!studentCodeChallenge) schoolStudentCodeBtn.textContent = originalText || "Continue With Code";
    }
  }

  if (!authCard) return;
  try {
    sessionStorage.removeItem(SIGNOUT_MARKER_KEY);
  } catch (_error) {}

  if (signInForm) {
    signInForm.addEventListener("submit", function (event) {
      event.preventDefault();
      handleLogin().catch(function () {});
    });
  }
  if (signUpForm) {
    signUpForm.addEventListener("submit", function (event) {
      event.preventDefault();
      handleRegister().catch(function () {});
    });
  }
  if (schoolStudentCodeForm) {
    schoolStudentCodeForm.addEventListener("submit", function (event) {
      event.preventDefault();
      handleStudentCodeLogin().catch(function () {});
    });
  }
  if (showSignInBtn) showSignInBtn.addEventListener("click", function () { setAuthView("signin"); });
  if (showSignUpBtn) showSignUpBtn.addEventListener("click", function () { setAuthView("signup"); });
  if (studentCodeSchoolTab) studentCodeSchoolTab.addEventListener("click", function () { setStudentCodeMode("school"); });
  if (studentCodeFamilyTab) studentCodeFamilyTab.addEventListener("click", function () { setStudentCodeMode("family"); });
  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", function () {
      requestPasswordReset(clean(signInForm && signInForm.email && signInForm.email.value))
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
  if (feedbackAcknowledgeBtn) feedbackAcknowledgeBtn.addEventListener("click", closeFeedbackModal);

  setAuthView("signin");
  setStudentCodeMode("school");
})();
