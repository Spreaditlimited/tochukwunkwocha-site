(function () {
  var form = document.getElementById("holidayWaitlistForm");
  if (!form) return;

  var submitButton = form.querySelector('button[type="submit"]');
  var submitLabel = submitButton ? submitButton.querySelector("[data-submit-label]") : null;
  var statusEl = document.getElementById("holidayWaitlistStatus");
  var modal = document.getElementById("holidayThankYouModal");

  function clean(value, max) {
    return String(value || "").trim().slice(0, Number(max || 1000));
  }

  function setBusy(busy) {
    if (!submitButton) return;
    submitButton.disabled = !!busy;
    submitButton.style.opacity = busy ? "0.8" : "";
    if (submitLabel) submitLabel.textContent = busy ? "Submitting..." : "Remind me";
  }

  function setStatus(text, tone) {
    if (!statusEl) return;
    statusEl.textContent = clean(text, 300);
    statusEl.classList.remove("text-gray-500", "text-red-600", "text-emerald-700");
    if (tone === "error") statusEl.classList.add("text-red-600");
    else if (tone === "ok") statusEl.classList.add("text-emerald-700");
    else statusEl.classList.add("text-gray-500");
  }

  function closeModal() {
    if (!modal) return;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function openModal() {
    if (!modal) return;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  if (modal) {
    modal.querySelectorAll("[data-thankyou-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });
  }
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeModal();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setStatus("", "idle");

    var payload = {
      fullName: clean(form.fullName && form.fullName.value, 140),
      email: clean(form.email && form.email.value, 190),
      phone: clean(form.phone && form.phone.value, 80),
      website: clean(form.website && form.website.value, 120),
    };

    if (!payload.fullName || !payload.email || !payload.phone) {
      setStatus("Please complete name, email, and phone.", "error");
      return;
    }

    setBusy(true);
    try {
      payload.recaptchaToken = await window.recaptchaHelper.getToken("holiday_waitlist_submit");
      var response = await fetch("/.netlify/functions/holiday-waitlist-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      var data = await response.json().catch(function () {
        return {};
      });

      if (!response.ok || !data.ok) {
        throw new Error((data && data.error) || "Could not join the waitlist right now.");
      }

      form.reset();
      setStatus("Success. You are now on the VIP waitlist.", "ok");
      openModal();
    } catch (error) {
      setStatus(error && error.message ? error.message : "Could not join the waitlist right now.", "error");
    } finally {
      setBusy(false);
    }
  });
})();

