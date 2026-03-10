(function () {
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");

  const META_PIXEL_ID = "197692536710001";

  function initMetaPixel() {
    if (!META_PIXEL_ID || window.fbq) return;

    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

    window.fbq("init", META_PIXEL_ID);
    window.fbq("track", "PageView");
  }

  async function fetchPaidOrderSummary(orderUuid) {
    const res = await fetch(`/.netlify/functions/order-summary?order_uuid=${encodeURIComponent(orderUuid)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json().catch(function () {
      return null;
    });
    if (!json || !json.ok || !json.order) return null;
    return json.order;
  }

  async function trackPurchase(orderUuid) {
    if (!orderUuid) return;
    if (typeof window.fbq !== "function") return;

    const storageKey = `meta_purchase_sent_${orderUuid}`;
    if (window.localStorage && window.localStorage.getItem(storageKey) === "1") return;

    const order = await fetchPaidOrderSummary(orderUuid);
    if (!order || !Number.isFinite(Number(order.value)) || !order.currency) return;

    const eventId = `ptp_${orderUuid}`;
    window.fbq(
      "track",
      "Purchase",
      {
        value: Number(order.value),
        currency: String(order.currency).toUpperCase(),
        content_name: "Prompt to Profit",
        content_type: "product",
        content_ids: [String(order.course_slug || "prompt-to-profit")],
      },
      { eventID: eventId }
    );

    if (window.localStorage) window.localStorage.setItem(storageKey, "1");
  }

  initMetaPixel();

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      const expanded = navToggle.getAttribute("aria-expanded") === "true";
      navToggle.setAttribute("aria-expanded", String(!expanded));
      navLinks.classList.toggle("open");
    });
  }

  document.querySelectorAll(".faq-question").forEach(function (button) {
    button.addEventListener("click", function () {
      const item = button.closest(".faq-item");
      item.classList.toggle("open");
    });
  });

  const modalMarkup = [
    '<div class="enrol-modal" id="enrolModal" aria-hidden="true">',
    '  <div class="enrol-modal__backdrop" data-enrol-close></div>',
    '  <div class="enrol-modal__panel" role="dialog" aria-modal="true" aria-labelledby="enrolTitle">',
    '    <button class="enrol-modal__close" type="button" aria-label="Close" data-enrol-close>Close</button>',
    '    <p class="enrol-modal__label">Prompt to Profit</p>',
    '    <h3 id="enrolTitle">Secure your slot now</h3>',
    '    <p class="enrol-modal__intro">Pay now to reserve your place. You will be added to the enrolment list and onboarded before launch on Monday, 23rd of March, 2026 at 8:00 PM WAT and 7:00 PM UK time.</p>',
    '    <form id="enrolForm" class="enrol-form" novalidate>',
    '      <label for="enrolFirstName">First Name</label>',
    '      <input id="enrolFirstName" name="firstName" type="text" autocomplete="given-name" required />',
    '      <label for="enrolEmail">Email address</label>',
    '      <input id="enrolEmail" name="email" type="email" autocomplete="email" required />',
    '      <label for="enrolCountry">Country</label>',
    '      <input id="enrolCountry" name="country" type="text" autocomplete="country-name" placeholder="Nigeria" />',
    '      <label>Payment method</label>',
    '      <input id="enrolProvider" name="provider" type="hidden" value="paystack" />',
    '      <div class="payment-options" id="paymentOptions" role="radiogroup" aria-label="Payment method">',
    '        <button type="button" class="payment-option is-active" data-provider="paystack" role="radio" aria-checked="true">',
    '          <span class="payment-option__title">Paystack</span>',
    '          <span class="payment-option__meta">N10,000 + 7.5% VAT (Total: N10,750)</span>',
    "        </button>",
    '        <button type="button" class="payment-option" data-provider="paypal" role="radio" aria-checked="false">',
    '          <span class="payment-option__title">PayPal</span>',
    '          <span class="payment-option__meta">£20 + 20% VAT (Total: £24)</span>',
    "        </button>",
    "      </div>",
    '      <p id="enrolError" class="enrol-form__error" role="alert"></p>',
    '      <div class="enrol-form__actions">',
    '        <button id="enrolSubmit" class="btn btn-primary" type="submit">Proceed to Payment</button>',
    "      </div>",
    "    </form>",
    "  </div>",
    "</div>",
  ].join("");

  document.body.insertAdjacentHTML("beforeend", modalMarkup);

  const modal = document.getElementById("enrolModal");
  const form = document.getElementById("enrolForm");
  const errorEl = document.getElementById("enrolError");
  const submitBtn = document.getElementById("enrolSubmit");
  const providerInput = document.getElementById("enrolProvider");
  const paymentOptions = document.querySelectorAll(".payment-option");

  const paymentFeedbackMarkup = [
    '<div class="payment-feedback-modal" id="paymentFeedbackModal" aria-hidden="true">',
    '  <div class="payment-feedback-modal__backdrop" data-payment-close></div>',
    '  <div class="payment-feedback-modal__panel" role="dialog" aria-modal="true" aria-labelledby="paymentFeedbackTitle">',
    '    <button class="payment-feedback-modal__close" type="button" aria-label="Close" data-payment-close>Close</button>',
    '    <p class="payment-feedback-modal__label">Prompt to Profit</p>',
    '    <h3 id="paymentFeedbackTitle"></h3>',
    '    <p id="paymentFeedbackMessage"></p>',
    '    <button class="btn btn-primary" type="button" id="paymentFeedbackBtn">Close</button>',
    "  </div>",
    "</div>",
  ].join("");

  document.body.insertAdjacentHTML("beforeend", paymentFeedbackMarkup);
  const paymentModal = document.getElementById("paymentFeedbackModal");
  const paymentTitle = document.getElementById("paymentFeedbackTitle");
  const paymentMessage = document.getElementById("paymentFeedbackMessage");
  const paymentCloseBtn = document.getElementById("paymentFeedbackBtn");

  paymentOptions.forEach(function (option) {
    option.addEventListener("click", function () {
      const provider = option.getAttribute("data-provider");
      if (!provider) return;
      providerInput.value = provider;
      paymentOptions.forEach(function (el) {
        const isActive = el === option;
        el.classList.toggle("is-active", isActive);
        el.setAttribute("aria-checked", isActive ? "true" : "false");
      });
    });
  });

  function openEnrolModal() {
    if (!modal) return;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    const firstInput = document.getElementById("enrolFirstName");
    if (firstInput) firstInput.focus();
  }

  function closeEnrolModal() {
    if (!modal) return;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (errorEl) errorEl.textContent = "";
    form.reset();
    submitBtn.disabled = false;
    submitBtn.textContent = "Proceed to Payment";
  }

  function openPaymentFeedbackModal(status) {
    if (!paymentModal || !paymentTitle || !paymentMessage) return;

    if (status === "success") {
      paymentTitle.textContent = "Payment successful";
      paymentMessage.textContent =
        "Payment received. We have added you to the enrolment list. Launch is Monday, 23rd of March, 2026 at 8:00 PM WAT and 7:00 PM UK time.";
      paymentModal.classList.remove("is-error");
      paymentModal.classList.add("is-success");
    } else if (status === "cancelled") {
      paymentTitle.textContent = "Payment cancelled";
      paymentMessage.textContent = "You cancelled the payment. You can try again anytime.";
      paymentModal.classList.remove("is-success");
      paymentModal.classList.add("is-error");
    } else {
      paymentTitle.textContent = "Payment not confirmed";
      paymentMessage.textContent = "Payment could not be confirmed. Please try again.";
      paymentModal.classList.remove("is-success");
      paymentModal.classList.add("is-error");
    }

    paymentModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closePaymentFeedbackModal() {
    if (!paymentModal) return;
    paymentModal.setAttribute("aria-hidden", "true");
    paymentModal.classList.remove("is-success", "is-error");
    document.body.classList.remove("modal-open");
  }

  document
    .querySelectorAll('a[href="#ENROL_LINK"], .nav-cta, [data-enrol-modal]')
    .forEach(function (trigger) {
      trigger.addEventListener("click", function (event) {
        event.preventDefault();
        openEnrolModal();
      });
    });

  modal.querySelectorAll("[data-enrol-close]").forEach(function (el) {
    el.addEventListener("click", closeEnrolModal);
  });

  paymentModal.querySelectorAll("[data-payment-close]").forEach(function (el) {
    el.addEventListener("click", closePaymentFeedbackModal);
  });
  paymentCloseBtn.addEventListener("click", closePaymentFeedbackModal);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      if (modal.getAttribute("aria-hidden") === "false") closeEnrolModal();
      if (paymentModal.getAttribute("aria-hidden") === "false") closePaymentFeedbackModal();
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    errorEl.textContent = "";

    const firstName = form.firstName.value.trim();
    const email = form.email.value.trim();
    const country = form.country.value.trim();
    const provider = providerInput.value;

    if (!firstName || !email) {
      errorEl.textContent = "Please enter your first name and email address.";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
      const res = await fetch("/.netlify/functions/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, email, country, provider }),
      });

      const json = await res.json().catch(function () {
        return null;
      });

      if (!res.ok || !json || !json.ok || !json.checkoutUrl) {
        const msg = (json && json.error) || "Could not start payment. Please try again.";
        throw new Error(msg);
      }

      window.location.href = json.checkoutUrl;
    } catch (err) {
      errorEl.textContent = err.message || "Something went wrong. Please try again.";
      submitBtn.disabled = false;
      submitBtn.textContent = "Proceed to Payment";
    }
  });

  const search = new URLSearchParams(window.location.search);
  const payment = search.get("payment");
  const paidOrderUuid = search.get("order_uuid");
  if (payment === "success") {
    openPaymentFeedbackModal("success");
    if (paidOrderUuid) {
      trackPurchase(paidOrderUuid).catch(function () {
        return null;
      });
    }
  } else if (payment === "failed") {
    openPaymentFeedbackModal("failed");
  } else if (payment === "cancelled") {
    openPaymentFeedbackModal("cancelled");
  }

  if (payment) {
    const url = new URL(window.location.href);
    url.searchParams.delete("payment");
    url.searchParams.delete("order_uuid");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }

  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealItems.length > 0) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 }
    );

    revealItems.forEach(function (item) {
      observer.observe(item);
    });
  } else {
    revealItems.forEach(function (item) {
      item.classList.add("in");
    });
  }
})();
