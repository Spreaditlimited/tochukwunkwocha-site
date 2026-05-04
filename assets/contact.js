(function () {
  var form = document.getElementById("contactForm");
  if (!form) return;

  var submitButton = form.querySelector('button[type="submit"]');
  var submitLabel = submitButton ? submitButton.querySelector("[data-submit-label]") : null;
  var statusEl = document.getElementById("contactFormStatus");

  function setStatus(message, tone) {
    if (!statusEl) return;
    statusEl.textContent = String(message || "");
    statusEl.classList.remove("text-red-600", "text-emerald-700", "text-gray-500");
    if (tone === "error") statusEl.classList.add("text-red-600");
    else if (tone === "ok") statusEl.classList.add("text-emerald-700");
    else statusEl.classList.add("text-gray-500");
  }

  function setBusy(busy) {
    if (!submitButton) return;
    submitButton.disabled = !!busy;
    submitButton.style.opacity = busy ? "0.75" : "";
    if (submitLabel) submitLabel.textContent = busy ? "Sending..." : "Send Message";
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setStatus("", "idle");

    var payload = {
      fullName: String((form.fullName && form.fullName.value) || "").trim(),
      email: String((form.email && form.email.value) || "").trim(),
      purpose: String((form.purpose && form.purpose.value) || "").trim(),
      message: String((form.message && form.message.value) || "").trim(),
      website: String((form.website && form.website.value) || "").trim(),
    };

    if (!payload.fullName || !payload.email || !payload.purpose || !payload.message) {
      setStatus("Please complete Full Name, Email, Purpose, and Message.", "error");
      return;
    }

    setBusy(true);
    try {
      payload.recaptchaToken = await window.recaptchaHelper.getToken("contact_submit");
      var response = await fetch("/.netlify/functions/contact-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      var data = await response.json().catch(function () {
        return {};
      });

      if (!response.ok || !data.ok) {
        throw new Error((data && data.error) || "Could not send message right now.");
      }

      form.reset();
      setStatus("Message sent. Our support team will get back to you shortly.", "ok");
    } catch (error) {
      setStatus(error && error.message ? error.message : "Could not send message right now.", "error");
    } finally {
      setBusy(false);
    }
  });
})();
