(function () {
  var form = document.getElementById("businessPlanForm");
  if (!form) return;
  var DRAFT_KEY = "tochukwu_business_plan_draft_v1";

  var purposeInput = document.getElementById("purpose");
  var currencyInput = document.getElementById("currency");
  var exchangeRateWrap = document.getElementById("exchangeRateWrap");
  var exchangeRateInput = document.getElementById("exchangeRate");
  var submitBtn = document.getElementById("submitBtn");
  var errorBox = document.getElementById("errorBox");
  var infoBox = document.getElementById("infoBox");
  var progressWrap = document.getElementById("progressWrap");
  var progressBar = document.getElementById("progressBar");
  var resultWrap = document.getElementById("resultWrap");
  var planPreview = document.getElementById("planPreview");
  var downloadDocxBtn = document.getElementById("downloadDocxBtn");
  var openDashboardLink = document.getElementById("openDashboardLink");
  var submitBtnPriceText = document.getElementById("submitBtnPriceText");
  var businessPlanPriceLabel = document.getElementById("businessPlanPriceLabel");
  var verifierImage = document.getElementById("verifierImage");
  var verifierName = document.getElementById("verifierName");
  var verifierBio = document.getElementById("verifierBio");
  var verifierLinkedinLink = document.getElementById("verifierLinkedinLink");
  
  // Safely grab loan fields if they exist
  var loanFields1 = document.getElementById("loanFields1");
  var loanFields2 = document.getElementById("loanFields2");
  
  var startupCapitalLabel = document.getElementById("startupCapitalLabel") || { textContent: '' };
  var ownerContributionLabel = document.getElementById("ownerContributionLabel") || { textContent: '' };
  var loanAmountLabel = document.getElementById("loanAmountLabel") || { textContent: '' };

  var state = { loading: false, result: null, priceLabel: "₦200" };

  function saveDraft() {
    try {
      var fields = {};
      var nodes = form.querySelectorAll("input[name], textarea[name], select[name]");
      Array.prototype.forEach.call(nodes, function (node) {
        if (!node || !node.name) return;
        if (node.type === "checkbox") {
          fields[node.name] = Boolean(node.checked);
          return;
        }
        if (node.type === "radio") {
          if (node.checked) fields[node.name] = String(node.value || "");
          return;
        }
        fields[node.name] = String(node.value || "");
      });

      fields.purpose = String((purposeInput && purposeInput.value) || "");
      fields.currency = String((currencyInput && currencyInput.value) || "");
      fields.exchangeRate = String((exchangeRateInput && exchangeRateInput.value) || "");

      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          fields: fields,
          updatedAt: Date.now(),
        })
      );
    } catch (_error) {}
  }

  function restoreDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      var fields = parsed && parsed.fields && typeof parsed.fields === "object" ? parsed.fields : null;
      if (!fields) return;

      Object.keys(fields).forEach(function (name) {
        var value = fields[name];
        if (name === "purpose" || name === "currency" || name === "exchangeRate") return;
        var node = form.elements[name];
        if (!node) return;

        if (node instanceof RadioNodeList) {
          var list = node;
          Array.prototype.forEach.call(list, function (item) {
            if (!item) return;
            item.checked = String(item.value || "") === String(value || "");
          });
          return;
        }

        if (node.type === "checkbox") {
          node.checked = Boolean(value);
          return;
        }
        node.value = String(value || "");
      });

      if (purposeInput && typeof fields.purpose !== "undefined") purposeInput.value = String(fields.purpose || "loan");
      if (currencyInput && typeof fields.currency !== "undefined") currencyInput.value = String(fields.currency || "NGN");
      if (exchangeRateInput && typeof fields.exchangeRate !== "undefined") exchangeRateInput.value = String(fields.exchangeRate || "1500");
    } catch (_error) {}
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toNairaLabel(amountMinor) {
    var amount = Math.max(0, Number(amountMinor || 0)) / 100;
    try {
      return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        maximumFractionDigits: 0,
      }).format(amount);
    } catch (_error) {
      return "N" + String(Math.round(amount));
    }
  }

  function refreshSubmitButtonLabel() {
    var text = "Pay " + String(state.priceLabel || "₦200") + " & Generate Plan";
    if (submitBtnPriceText) {
      submitBtnPriceText.textContent = text;
      return;
    }
    if (submitBtn) {
      submitBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg> ' +
        escapeHtml(text);
    }
  }

  function setError(message) {
    var msg = String(message || "").trim();
    if (errorBox) {
      errorBox.textContent = msg;
      errorBox.classList.toggle("hidden", !msg);
    }
  }

  function setInfo(message) {
    var msg = String(message || "").trim();
    if (infoBox) {
      infoBox.textContent = msg;
      infoBox.classList.toggle("hidden", !msg);
    }
  }

  function setProgress(value) {
    if (!progressWrap || !progressBar) return; // Fail safely if UI elements are missing
    var n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) {
      progressWrap.classList.add("hidden");
      progressBar.style.width = "0%";
      return;
    }
    progressWrap.classList.remove("hidden");
    progressBar.style.width = String(Math.max(0, Math.min(100, n))) + "%";
  }

  function refreshLoanFieldVisibility() {
    var purpose = String(purposeInput.value || "");
    var showLoanFields = purpose === "loan" || purpose === "investor";
    if (loanFields1) loanFields1.classList.toggle("hidden", !showLoanFields);
    if (loanFields2) loanFields2.classList.toggle("hidden", !showLoanFields);
  }

  function refreshCurrencyUI() {
    var currency = String(currencyInput.value || "NGN");
    if (exchangeRateWrap) exchangeRateWrap.classList.toggle("hidden", currency !== "NGN");
    if (startupCapitalLabel.textContent !== undefined) startupCapitalLabel.textContent = "Total project cost (startup capital) in " + currency;
    if (ownerContributionLabel.textContent !== undefined) ownerContributionLabel.textContent = "Owner contribution (" + currency + ")";
    if (loanAmountLabel.textContent !== undefined) loanAmountLabel.textContent = "Loan amount (" + currency + ")";
  }

  function setLoading(loading) {
    state.loading = Boolean(loading);
    if (submitBtn) {
      submitBtn.disabled = state.loading;
      if (state.loading) {
        if (submitBtnPriceText) {
          submitBtnPriceText.textContent = "Processing...";
        } else {
          submitBtn.innerHTML = "Processing...";
        }
      } else {
        refreshSubmitButtonLabel();
      }
    }
  }

  async function loadBusinessPlanConfig() {
    try {
      var res = await fetch("/.netlify/functions/business-plan-config?t=" + Date.now(), {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      var data = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !data || !data.ok) return;

      var amountMinor = Number(data.price && data.price.amountMinor);
      if (Number.isFinite(amountMinor) && amountMinor > 0) {
        state.priceLabel = toNairaLabel(amountMinor);
        if (businessPlanPriceLabel) businessPlanPriceLabel.textContent = state.priceLabel;
        refreshSubmitButtonLabel();
      }

      var verifier = data.verifier && typeof data.verifier === "object" ? data.verifier : null;
      if (!verifier) return;
      if (verifierName && verifier.name) verifierName.textContent = String(verifier.name);
      if (verifierBio && verifier.bio) verifierBio.textContent = String(verifier.bio);
      if (verifierImage && verifier.imageUrl) verifierImage.src = String(verifier.imageUrl);
      if (verifierLinkedinLink && verifier.linkedinUrl) verifierLinkedinLink.href = String(verifier.linkedinUrl);
    } catch (_error) {
      // Keep default values if config is unavailable
    }
  }

  function toNumberOrZero(value) {
    var n = Number(String(value || "").trim());
    return Number.isFinite(n) ? n : 0;
  }

  function getFieldValue(name) {
    if (!form || !form.elements) return "";
    var field = form.elements[name];
    return field && typeof field.value !== "undefined" ? field.value : "";
  }

  function readPayload() {
    var intake = {
      businessName: String(getFieldValue("businessName") || "").trim(),
      country: String(getFieldValue("country") || "").trim(),
      city: String(getFieldValue("city") || "").trim(),
      productLine: String(getFieldValue("productLine") || "").trim(),
      capacity: String(getFieldValue("capacity") || "").trim(),
      targetCustomers: String(getFieldValue("targetCustomers") || "").trim(),
      startupCapital: toNumberOrZero(getFieldValue("startupCapital")),
      ownerContribution: toNumberOrZero(getFieldValue("ownerContribution")),
      loanAmount: toNumberOrZero(getFieldValue("loanAmount")),
      loanTenorYears: toNumberOrZero(getFieldValue("loanTenorYears")),
      equityPartners: String(getFieldValue("equityPartners") || "no") === "yes",
      existingExperience: String(getFieldValue("existingExperience") || "").trim(),
      distributionChannels: String(getFieldValue("distributionChannels") || "").trim(),
      pricingApproach: String(getFieldValue("pricingApproach") || "").trim(),
      uniqueAngle: String(getFieldValue("uniqueAngle") || "").trim(),
      extraNotes: String(getFieldValue("extraNotes") || "").trim(),
    };

    return {
      fullName: String(getFieldValue("fullName") || "").trim(),
      email: String(getFieldValue("email") || "").trim().toLowerCase(),
      purpose: String((purposeInput && purposeInput.value) || "loan"),
      currency: String((currencyInput && currencyInput.value) || "NGN"),
      exchangeRate: String((currencyInput && currencyInput.value) || "NGN") === "NGN" ? toNumberOrZero((exchangeRateInput && exchangeRateInput.value) || "") : 0,
      intake: intake,
    };
  }

  async function createPayment(payload) {
    var res = await fetch("/.netlify/functions/business-plan-create-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    var data = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !data || !data.ok) {
      throw new Error((data && data.error) || "Could not initialize payment.");
    }
    return data;
  }

  async function completePayment(reference) {
    var res = await fetch("/.netlify/functions/business-plan-complete-payment", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: reference }),
    });
    var data = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !data || !data.ok) {
      throw new Error((data && data.error) || "Could not complete payment.");
    }
    return data;
  }

  function openPaystackInline(config, onSuccess, onClose) {
    if (!window.PaystackPop || typeof window.PaystackPop.setup !== "function") {
      throw new Error("Paystack inline is not available.");
    }

    var handler = window.PaystackPop.setup({
      key: config.publicKey,
      email: config.email || "",
      amount: Number(config.amountMinor || 0),
      ref: config.reference,
      access_code: config.accessCode || undefined,
      callback: function (response) {
        var reference = String((response && response.reference) || config.reference || "").trim();
        if (!reference) {
          onClose(new Error("Missing payment reference."));
          return;
        }
        onSuccess(reference);
      },
      onClose: function () {
        onClose();
      },
    });

    handler.openIframe();
  }

  async function handleDownloadDocx() {
    if (!state.result || !state.result.planText) {
      alert("Download is available after expert verification.");
      return;
    }

    var fileName = String((readPayload().intake.businessName || "").trim() || "linescout-business-plan");
    var response = await fetch("/.netlify/functions/business-plan-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planText: state.result.planText, format: "docx", fileName: fileName }),
    });
    if (!response.ok) {
      alert("Could not export file. Please try again.");
      return;
    }

    var blob = await response.blob();
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = fileName + ".docx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setInfo("");
    setProgress(0);
    if (resultWrap) resultWrap.classList.add("hidden");

    var payload = readPayload();
    if (!payload.fullName || !payload.email) {
      setError("Full name and valid email are required.");
      return;
    }
    if (!payload.intake.businessName || !payload.intake.productLine) {
      setError("Business name and project/product line are required.");
      return;
    }

    try {
      setLoading(true);
      setProgress(20);
      setInfo("Initializing secure payment...");

      var payment = await createPayment(payload);
      setProgress(40);
      setInfo("Opening Paystack checkout...");

      openPaystackInline(
        payment,
        async function (reference) {
          try {
            setInfo("Payment received. Generating your business plan...");
            setProgress(70);
            var completed = await completePayment(reference);
            state.result = completed;
            
            // Safely set plan text if the element exists in the DOM
            if (planPreview) planPreview.textContent = String(completed.planText || "");
            
            if (openDashboardLink && completed.dashboardUrl) {
              openDashboardLink.href = String(completed.dashboardUrl);
            }
            if (resultWrap) resultWrap.classList.remove("hidden");

            var verificationStatus = String(completed.verificationStatus || "awaiting_verification").toLowerCase();
            var awaiting = verificationStatus !== "verified";
            if (downloadDocxBtn) downloadDocxBtn.disabled = awaiting;
            if (downloadDocxBtn) downloadDocxBtn.textContent = awaiting ? "Download Locked (Awaiting Verification)" : "Download DOCX";
            setInfo(
              awaiting
                ? "Business plan generated by AI and sent for expert verification. Check your dashboard for status updates."
                : "Business plan verified and ready for download."
            );
            setProgress(100);
          } catch (error) {
            setError(error.message || "Could not finalize payment.");
            setProgress(0);
          } finally {
            setLoading(false);
          }
        },
        function (error) {
          if (error && error.message) {
            setError(error.message);
          } else {
            setInfo("Payment window closed.");
          }
          setLoading(false);
          setProgress(0);
        }
      );
    } catch (error) {
      setError(error.message || "Could not initialize payment.");
      setLoading(false);
      setProgress(0);
    }
  }

  if (form) form.addEventListener("submit", handleSubmit);
  if (form) {
    form.addEventListener("input", saveDraft);
    form.addEventListener("change", saveDraft);
  }
  if (downloadDocxBtn) downloadDocxBtn.addEventListener("click", handleDownloadDocx);
  if (purposeInput) purposeInput.addEventListener("change", refreshLoanFieldVisibility);
  if (currencyInput) currencyInput.addEventListener("change", refreshCurrencyUI);

  restoreDraft();
  refreshSubmitButtonLabel();
  refreshLoanFieldVisibility();
  refreshCurrencyUI();
  loadBusinessPlanConfig();
})();
