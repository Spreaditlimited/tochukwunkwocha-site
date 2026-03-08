(function () {
  const FLODESK_REDIRECT_URL =
    "https://app.flodesk.com/segment/69ad60e952e4ac8ca746bb53?backTo=L3NlZ21lbnRz";

  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");

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
    '    <h3 id="enrolTitle">Coming Soon. Get notified once we launch.</h3>',
    '    <form id="enrolForm" class="enrol-form" novalidate>',
    '      <label for="enrolFirstName">First Name</label>',
    '      <input id="enrolFirstName" name="firstName" type="text" autocomplete="given-name" required />',
    '      <label for="enrolEmail">Email address</label>',
    '      <input id="enrolEmail" name="email" type="email" autocomplete="email" required />',
    '      <p id="enrolError" class="enrol-form__error" role="alert"></p>',
    '      <button id="enrolSubmit" class="btn btn-primary" type="submit">Notify Me</button>',
    "    </form>",
    "  </div>",
    "</div>",
  ].join("");

  document.body.insertAdjacentHTML("beforeend", modalMarkup);

  const modal = document.getElementById("enrolModal");
  const form = document.getElementById("enrolForm");
  const errorEl = document.getElementById("enrolError");
  const submitBtn = document.getElementById("enrolSubmit");

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

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && modal.getAttribute("aria-hidden") === "false") {
      closeEnrolModal();
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (errorEl) errorEl.textContent = "";

    const firstName = form.firstName.value.trim();
    const email = form.email.value.trim();

    if (!firstName || !email) {
      errorEl.textContent = "Please enter your first name and email address.";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
      const res = await fetch("/.netlify/functions/flodesk-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, email }),
      });

      const json = await res.json().catch(function () {
        return null;
      });

      if (!res.ok || !json || !json.ok) {
        const msg = (json && json.error) || "Could not save your details. Please try again.";
        throw new Error(msg);
      }

      window.location.href = json.redirectUrl || FLODESK_REDIRECT_URL;
    } catch (err) {
      errorEl.textContent = err.message || "Something went wrong. Please try again.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Notify Me";
    }
  });

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
