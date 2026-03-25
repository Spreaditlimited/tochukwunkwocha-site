(function () {
  const form = document.getElementById("leadpageDetailsForm");
  const errorEl = document.getElementById("leadpageDetailsError");
  const submitBtn = document.getElementById("leadpageDetailsSubmitBtn");
  const modal = document.getElementById("leadpageDetailsModal");
  const modalTitle = document.getElementById("leadpageDetailsModalTitle");
  const modalMessage = document.getElementById("leadpageDetailsModalMessage");
  const closeTargets = document.querySelectorAll("[data-details-close]");
  const paymentStage = document.getElementById("leadpagePaymentStage");
  const paymentBtn = document.getElementById("leadpagePaymentBtn");
  const paymentErrorEl = document.getElementById("leadpagePaymentError");
  const paymentRefEl = document.getElementById("leadpagePaymentRef");
  const stepEls = form ? Array.from(form.querySelectorAll("[data-step]")) : [];
  const nextStepBtns = form ? Array.from(form.querySelectorAll("[data-step-next]")) : [];
  const prevStepBtns = form ? Array.from(form.querySelectorAll("[data-step-prev]")) : [];
  const stepIndicators = form ? Array.from(form.querySelectorAll("[data-wizard-indicator]")) : [];
  const domainStatusField = document.getElementById("domainStatusField");
  const domainNameFieldWrap = document.getElementById("domainNameFieldWrap");
  const domainNameField = document.getElementById("domainNameField");
  let currentStep = 1;
  let activeJobUuid = "";

  function setError(message) {
    if (!errorEl) return;
    errorEl.textContent = String(message || "");
  }

  function setPaymentError(message) {
    if (!paymentErrorEl) return;
    const msg = String(message || "").trim();
    paymentErrorEl.textContent = msg;
    paymentErrorEl.classList.toggle("hidden", !msg);
  }

  function openModal(title, message) {
    if (!modal || !modalTitle || !modalMessage) return;
    modalTitle.textContent = title || "";
    modalMessage.textContent = message || "";
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    if (!modal) return;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function showPaymentStage(jobUuid) {
    activeJobUuid = String(jobUuid || "").trim();
    if (activeJobUuid) {
      try {
        window.sessionStorage.setItem("leadpage_job_uuid", activeJobUuid);
      } catch (_error) {}
    }
    if (paymentRefEl) {
      paymentRefEl.textContent = activeJobUuid ? `Project reference: ${activeJobUuid}` : "";
    }
    if (paymentStage) paymentStage.classList.remove("hidden");
    if (form) form.classList.add("hidden");
    setPaymentError("");
  }

  function openPaymentResultModal(paymentState) {
    const state = String(paymentState || "").trim().toLowerCase();
    if (state === "success") {
      openModal(
        "Payment successful",
        "Payment confirmed. Your project dashboard will now reflect active progress updates."
      );
      return;
    }
    if (state === "failed") {
      openModal(
        "Payment not completed",
        "We could not confirm payment. Please try again to continue with your project."
      );
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
          setPaymentError("Payment completed. Verifying...");
          return;
        }
        window.location.href = `/.netlify/functions/leadpage-paystack-return?reference=${encodeURIComponent(reference)}`;
      },
      onClose: function () {
        setPaymentError("Payment window closed.");
      },
    });
    handler.openIframe();
    return true;
  }

  closeTargets.forEach(function (btn) {
    btn.addEventListener("click", closeModal);
  });

  function validateStep(stepNumber) {
    const currentStepEl = stepEls.find(function (el) {
      return Number(el.getAttribute("data-step")) === Number(stepNumber);
    });
    if (!currentStepEl) return true;

    const requiredFields = Array.from(
      currentStepEl.querySelectorAll("input[required], textarea[required], select[required]")
    );
    for (let i = 0; i < requiredFields.length; i += 1) {
      const field = requiredFields[i];
      if (!field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    return true;
  }

  function renderStep(stepNumber) {
    if (!stepEls.length) return;
    currentStep = Math.max(1, Math.min(stepEls.length, Number(stepNumber) || 1));
    stepEls.forEach(function (el) {
      const isActive = Number(el.getAttribute("data-step")) === currentStep;
      el.classList.toggle("hidden", !isActive);
    });

    stepIndicators.forEach(function (el) {
      const indicatorStep = Number(el.getAttribute("data-wizard-indicator"));
      const isActive = indicatorStep === currentStep;
      el.classList.toggle("border-brand-200", isActive);
      el.classList.toggle("bg-brand-50", isActive);
      el.classList.toggle("text-brand-700", isActive);
      el.classList.toggle("border-gray-200", !isActive);
      el.classList.toggle("bg-gray-50", !isActive);
      el.classList.toggle("text-gray-500", !isActive);
    });
  }

  function toggleDomainNameField() {
    if (!domainStatusField || !domainNameFieldWrap) return;
    const shouldShow = String(domainStatusField.value || "") === "has_domain";
    domainNameFieldWrap.classList.toggle("hidden", !shouldShow);
    if (domainNameField) {
      if (shouldShow) {
        domainNameField.removeAttribute("disabled");
      } else {
        domainNameField.value = "";
        domainNameField.setAttribute("disabled", "disabled");
      }
    }
  }

  if (domainStatusField) {
    domainStatusField.addEventListener("change", toggleDomainNameField);
    toggleDomainNameField();
  }

  if (form) {
    nextStepBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!validateStep(currentStep)) return;
        renderStep(currentStep + 1);
      });
    });

    prevStepBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        renderStep(currentStep - 1);
      });
    });

    renderStep(1);

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      setError("");

       if (!validateStep(currentStep)) {
        return;
      }

      const fd = new FormData(form);
      const valueProposition = String(fd.get("whatSetsYouApart") || "").trim();
      const testimonials = String(fd.get("testimonials") || "").trim();
      const extraNotes = String(fd.get("notes") || "").trim();
      const combinedNotes = [extraNotes, valueProposition ? "What sets us apart: " + valueProposition : "", testimonials ? "Testimonials: " + testimonials : ""]
        .filter(Boolean)
        .join("\n\n");

      const payload = {
        fullName: String(fd.get("fullName") || "").trim(),
        email: String(fd.get("email") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        businessName: String(fd.get("businessName") || "").trim(),
        businessType: String(fd.get("businessType") || "").trim(),
        serviceOffer: String(fd.get("serviceOffer") || "").trim(),
        targetLocation: String(fd.get("targetLocation") || "").trim(),
        primaryGoal: String(fd.get("primaryGoal") || "").trim(),
        ctaText: String(fd.get("ctaText") || "").trim(),
        tone: String(fd.get("tone") || "").trim(),
        facebookPixelId: String(fd.get("facebookPixelId") || "").trim(),
        googleTagId: String(fd.get("googleTagId") || "").trim(),
        domainStatus: String(fd.get("domainStatus") || "").trim(),
        domainName: String(fd.get("domainName") || "").trim(),
        notes: combinedNotes,
      };

      if (!payload.fullName || !payload.email || !payload.phone || !payload.businessName || !payload.serviceOffer) {
        setError("Please complete all required fields before submitting.");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";

      try {
        const res = await fetch("/.netlify/functions/leadpage-submit-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const json = await res.json().catch(function () {
          return null;
        });

        if (!res.ok || !json || !json.ok) {
          throw new Error((json && json.error) || "Could not submit details right now.");
        }

        form.reset();
        renderStep(1);
        toggleDomainNameField();
        showPaymentStage(json.jobUuid || "");
        if (paymentStage) {
          paymentStage.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } catch (error) {
        setError(error.message || "Could not submit details right now.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Details";
      }
    });
  }

  if (paymentBtn) {
    paymentBtn.addEventListener("click", async function () {
      setPaymentError("");
      if (!activeJobUuid) {
        try {
          activeJobUuid = String(window.sessionStorage.getItem("leadpage_job_uuid") || "").trim();
        } catch (_error) {
          activeJobUuid = "";
        }
      }

      if (!activeJobUuid) {
        setPaymentError("We could not find your project reference. Please submit your details again.");
        return;
      }

      paymentBtn.disabled = true;
      paymentBtn.textContent = "Starting secure checkout...";
      try {
        const res = await fetch("/.netlify/functions/leadpage-create-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobUuid: activeJobUuid }),
        });
        const json = await res.json().catch(function () {
          return null;
        });
        if (!res.ok || !json || !json.ok) {
          throw new Error((json && json.error) || "Could not start payment right now.");
        }
        if (json.alreadyPaid) {
          openModal("Payment already confirmed", "This project has already been paid for.");
          return;
        }
        const openedInline = json.publicKey && json.accessCode
          ? openPaystackInline({
              publicKey: json.publicKey,
              accessCode: json.accessCode,
              reference: json.reference,
              amountMinor: json.amountMinor,
              email: json.email,
            })
          : false;

        if (!openedInline) {
          if (!json.checkoutUrl) {
            throw new Error("Missing checkout URL.");
          }
          window.location.href = json.checkoutUrl;
        }
      } catch (error) {
        setPaymentError(error.message || "Could not start payment right now.");
      } finally {
        paymentBtn.disabled = false;
        paymentBtn.textContent = "Continue to Secure Payment";
      }
    });
  }

  (function handlePaymentReturnState() {
    const search = new URLSearchParams(window.location.search || "");
    const payment = String(search.get("payment") || "").trim().toLowerCase();
    const returnedJobUuid = String(search.get("job_uuid") || "").trim();
    if (!payment) return;

    if (returnedJobUuid) {
      showPaymentStage(returnedJobUuid);
      if (paymentBtn && payment === "success") paymentBtn.classList.add("hidden");
    } else {
      try {
        const cached = String(window.sessionStorage.getItem("leadpage_job_uuid") || "").trim();
        if (cached) showPaymentStage(cached);
      } catch (_error) {}
    }

    openPaymentResultModal(payment);

    const url = new URL(window.location.href);
    url.searchParams.delete("payment");
    url.searchParams.delete("job_uuid");
    window.history.replaceState({}, "", url.toString());
  })();
})();
