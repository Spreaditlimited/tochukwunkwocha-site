(function () {
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");
  const navDropdowns = Array.prototype.slice.call(document.querySelectorAll(".nav-dropdown"));

  const META_PIXEL_ID = "197692536710001";
  const GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-K09N39FSXZ";
  const COOKIE_CONSENT_KEY = "tws_cookie_consent";
  const AFFILIATE_REF_KEY = "tn_affiliate_ref_code_v1";
  const PURCHASE_WELCOME_KEY = "recent_course_purchase_notice_v1";
  const PURCHASE_WELCOME_DURATION_MS = 60 * 1000;
  const WHATSAPP_CHAT_URL = "https://wa.me/447881194138?text=Hi%20Tochukwu%2C%20I%20have%20a%20question%20about%20your%20courses.";
  const COURSE_CONFIGS = {
    "prompt-to-profit": {
      slug: "prompt-to-profit",
      name: "Prompt to Profit",
      landingPath: "/courses/prompt-to-profit",
      defaultBatchKey: "ptp-batch-1",
      intro:
        "Pay now to reserve your place. You will be added to the enrolment list and onboarded before launch.",
    },
    "prompt-to-production": {
      slug: "prompt-to-production",
      name: "Prompt to Profit Advanced",
      landingPath: "/courses/prompt-to-production",
      defaultBatchKey: "ptprod-batch-1",
      intro:
        "Secure your seat for the next quarterly cohort. Once payment is confirmed, you will be added to the onboarding list immediately.",
    },
  };

  function detectCourseSlug() {
    const path = String(window.location.pathname || "").toLowerCase();
    const match = path.match(/^\/courses\/([^/]+)/);
    if (match && match[1]) return String(match[1]).trim().toLowerCase();
    return "prompt-to-profit";
  }

  function titleizeSlug(slug) {
    return String(slug || "")
      .split("-")
      .filter(Boolean)
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  }

  function currentCourseConfig() {
    const slug = detectCourseSlug();
    return (
      COURSE_CONFIGS[slug] || {
        slug: slug,
        name: titleizeSlug(slug) || "Course",
        landingPath: "/courses/" + encodeURIComponent(slug),
        defaultBatchKey: "batch-1",
        intro:
          "Pay now to reserve your place. You will be added to the enrolment list and onboarded before launch.",
      }
    );
  }

  function resolveAffiliateCode() {
    var fromQuery = "";
    try {
      var search = new URLSearchParams(window.location.search || "");
      fromQuery = String(search.get("ref") || search.get("affiliate") || "").trim().toUpperCase();
    } catch (_error) {
      fromQuery = "";
    }
    if (fromQuery) {
      try { window.localStorage.setItem(AFFILIATE_REF_KEY, fromQuery); } catch (_error) {}
      return fromQuery;
    }
    try {
      return String(window.localStorage.getItem(AFFILIATE_REF_KEY) || "").trim().toUpperCase();
    } catch (_error) {
      return "";
    }
  }

  function appendAffiliateCodeToEnrolLinks(affiliateCode) {
    var code = String(affiliateCode || "").trim().toUpperCase();
    if (!code) return;
    var anchors = document.querySelectorAll('a[href^="/enrol-"]');
    anchors.forEach(function (anchor) {
      var href = String(anchor.getAttribute("href") || "").trim();
      if (!href) return;
      try {
        var url = new URL(href, window.location.origin);
        if (!url.searchParams.get("ref")) url.searchParams.set("ref", code);
        anchor.setAttribute("href", url.pathname + url.search + url.hash);
      } catch (_error) {
        return;
      }
    });
  }

  let activeCourseBatchKey = currentCourseConfig().defaultBatchKey;
  let activeCourseBatchStartAt = "";
  let enabledPaymentMethods = { paystack: true, stripe: true, manual_transfer: true };
  var initialAffiliateCode = resolveAffiliateCode();
  appendAffiliateCodeToEnrolLinks(initialAffiliateCode);

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

  function initGoogleAnalytics() {
    if (!GOOGLE_ANALYTICS_MEASUREMENT_ID || window.gtag) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", GOOGLE_ANALYTICS_MEASUREMENT_ID);

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GOOGLE_ANALYTICS_MEASUREMENT_ID);
    const firstScript = document.getElementsByTagName("script")[0];
    firstScript.parentNode.insertBefore(script, firstScript);
  }

  function initOptionalTracking() {
    initMetaPixel();
    initGoogleAnalytics();
  }

  function getCookieConsent() {
    try {
      return String(window.localStorage.getItem(COOKIE_CONSENT_KEY) || "").trim();
    } catch (_error) {
      return "";
    }
  }

  function setCookieConsent(value) {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_KEY, String(value || ""));
    } catch (_error) {
      return;
    }
  }

  function openCookieBanner() {
    if (getCookieConsent()) return;
    if (document.getElementById("cookieConsentBanner")) return;

    const markup = [
      '<div class="cookie-consent" id="cookieConsentBanner" role="dialog" aria-live="polite" aria-label="Cookie preferences">',
      '  <div class="cookie-consent__copy">',
      "    <strong>Cookies on this site</strong>",
      "    <p>We use essential cookies for core functionality and optional analytics/marketing cookies only with your permission.</p>",
      '    <a href="/privacy-policy">Read Privacy Policy</a>',
      "  </div>",
      '  <div class="cookie-consent__actions">',
      '    <button type="button" class="btn btn-outline cookie-consent__btn" id="cookieDeclineBtn">Decline</button>',
      '    <button type="button" class="btn btn-primary cookie-consent__btn" id="cookieAcceptBtn">Accept</button>',
      "  </div>",
      "</div>",
    ].join("");

    document.body.insertAdjacentHTML("beforeend", markup);
    document.body.classList.add("has-cookie-consent");
    const banner = document.getElementById("cookieConsentBanner");
    const acceptBtn = document.getElementById("cookieAcceptBtn");
    const declineBtn = document.getElementById("cookieDeclineBtn");

    function closeBanner() {
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
      document.body.classList.remove("has-cookie-consent");
    }

    if (acceptBtn) {
      acceptBtn.addEventListener("click", function () {
        setCookieConsent("granted");
        closeBanner();
        initOptionalTracking();
        trackCurrentPagePurchase().catch(function () {
          return null;
        });
      });
    }

    if (declineBtn) {
      declineBtn.addEventListener("click", function () {
        setCookieConsent("denied");
        closeBanner();
      });
    }
  }

  function mountWhatsAppFloat() {
    if (document.getElementById("whatsAppFloatBtn")) return;

    const markup = [
      `<a class="whatsapp-float" id="whatsAppFloatBtn" href="${WHATSAPP_CHAT_URL}" target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp">`,
      '  <svg class="whatsapp-float__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
      '    <path d="M19.1 4.9A9.94 9.94 0 0 0 12.03 2C6.53 2 2.05 6.47 2.05 11.98c0 1.76.46 3.49 1.33 5.02L2 22l5.12-1.34a9.9 9.9 0 0 0 4.9 1.26h.01c5.5 0 9.98-4.48 9.98-9.99 0-2.67-1.04-5.19-2.9-7.03Zm-7.08 15.32h-.01a8.2 8.2 0 0 1-4.17-1.14l-.3-.18-3.04.8.81-2.96-.2-.31a8.24 8.24 0 0 1-1.27-4.43c0-4.56 3.71-8.27 8.28-8.27a8.2 8.2 0 0 1 5.86 2.43 8.2 8.2 0 0 1 2.42 5.84c0 4.57-3.71 8.28-8.28 8.28Zm4.54-6.2c-.25-.13-1.48-.73-1.7-.81-.23-.08-.39-.13-.56.12-.16.25-.64.81-.79.98-.14.17-.29.19-.54.06-.25-.13-1.04-.38-1.99-1.21-.74-.66-1.24-1.48-1.39-1.73-.14-.25-.02-.38.11-.51.12-.11.25-.29.37-.43.12-.14.16-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.48-.4-.41-.56-.42h-.48c-.17 0-.44.06-.66.31-.23.25-.87.85-.87 2.08s.89 2.42 1.02 2.59c.12.17 1.74 2.65 4.21 3.71.59.26 1.05.42 1.41.54.59.19 1.12.16 1.54.1.47-.07 1.48-.6 1.69-1.18.21-.58.21-1.08.14-1.18-.06-.1-.22-.16-.46-.29Z" fill="currentColor"/>',
      "  </svg>",
      "</a>",
    ].join("");

    document.body.insertAdjacentHTML("beforeend", markup);
  }

  function initLeadCapturePopup() {
    // 1. Configuration & Constants
    const CONFIG = {
      keys: {
        firstSeen: "tn_lead_first_seen_at",
        subscribed: "tn_lead_subscribed",
        dismissCount: "tn_lead_dismiss_count",
        lastDismissed: "tn_lead_last_dismissed_at",
        sessionDismissed: "tn_lead_dismissed_this_session",
      },
      trigger: {
        delayMs: 7000,
        scrollThreshold: 0.35,
      },
      endpoints: {
        subscribe: "/.netlify/functions/lead-capture-subscribe",
      },
      excludedPrefixes: [
        "/dashboard",
        "/admin",
        "/schools/login",
        "/dashboard/login",
        "/invoice",
      ]
    };

    const currentPath = window.location.pathname || "/";

    // 2. Early Exits
    if (CONFIG.excludedPrefixes.some(prefix => currentPath.startsWith(prefix))) return;
    if (document.getElementById("tnLeadCapturePopup")) return;

    // 3. Safe Storage Helpers
    const storage = {
      get: (type, key) => {
        try { return window[type].getItem(key); } catch (e) { return null; }
      },
      set: (type, key, value) => {
        try { window[type].setItem(key, value); } catch (e) {}
      }
    };

    // Check if user has already subscribed or dismissed this session
    if (storage.get('localStorage', CONFIG.keys.subscribed) === "true") return;
    if (storage.get('sessionStorage', CONFIG.keys.sessionDismissed) === "true") return;

    // Mark first seen
    if (!storage.get('localStorage', CONFIG.keys.firstSeen)) {
      storage.set('localStorage', CONFIG.keys.firstSeen, new Date().toISOString());
    }

    // 4. Utility Functions
    const getPageType = () => currentPath.startsWith("/blog") ? "blog" : "site";

    const getPopupMessage = () => getPageType() === "blog" 
      ? "Get practical AI and business-building insights sent directly to your inbox."
      : "Join practical builders getting clear AI lessons, tools, and updates from Tochukwu.";

    const getCookie = (name) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(";").shift() || "";
      return "";
    };

    const getAttributionPayload = () => {
      const params = new URLSearchParams(window.location.search);
      return {
        source: "lead_capture_popup",
        pageType: getPageType(),
        pageUrl: window.location.href,
        pathname: currentPath,
        referrer: document.referrer || "",
        utmSource: params.get("utm_source") || "",
        utmMedium: params.get("utm_medium") || "",
        utmCampaign: params.get("utm_campaign") || "",
        utmContent: params.get("utm_content") || "",
        utmTerm: params.get("utm_term") || "",
        fbclid: params.get("fbclid") || "",
        fbp: getCookie("_fbp"),
        fbc: getCookie("_fbc"),
      };
    };

    // 5. CSS & HTML Injection
    const injectStyles = () => {
      if (document.getElementById("tnLeadCaptureStyles")) return;
      const style = document.createElement("style");
      style.id = "tnLeadCaptureStyles";
      style.textContent = `
        @keyframes tnSlideUpFade {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .tn-lead-popup { position: fixed; inset-inline: 16px; bottom: 16px; z-index: 80; color: #f8fafc; pointer-events: none; }
        .tn-lead-card { position: relative; overflow: hidden; max-width: 390px; margin-left: auto; border: 1px solid rgba(255,255,255,0.12); border-radius: 24px; background: rgba(15,23,42,0.86); box-shadow: 0 24px 80px rgba(0,0,0,0.42); backdrop-filter: blur(18px); padding: 24px; pointer-events: auto; animation: tnSlideUpFade 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .tn-lead-card::before { content: ""; position: absolute; inset-inline: 0; top: 0; height: 3px; background: linear-gradient(90deg, #667eb2, #a855f7); }
        .tn-lead-close { position: absolute; right: 12px; top: 12px; display: grid; height: 28px; width: 28px; place-items: center; border: 0; border-radius: 999px; background: rgba(255,255,255,0.06); color: #cbd5e1; cursor: pointer; transition: all 0.2s ease; }
        .tn-lead-close:hover { background: rgba(255,255,255,0.12); color: #fff; transform: scale(1.05); }
        .tn-lead-person { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .tn-lead-avatar { height: 48px; width: 48px; border-radius: 999px; object-fit: cover; border: 1px solid rgba(255,255,255,0.16); }
        .tn-lead-eyebrow { font-size: 10px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #a5d6ff; }
        .tn-lead-name { margin-top: 2px; font-size: 13px; font-weight: 800; color: #fff; }
        .tn-lead-role { font-size: 11px; color: #94a3b8; }
        .tn-lead-title { margin: 0; font-size: 20px; line-height: 1.18; font-weight: 900; color: #fff; }
        .tn-lead-copy { margin: 10px 0 0; font-size: 13px; line-height: 1.6; color: #cbd5e1; }
        .tn-lead-form { display: grid; gap: 10px; margin-top: 18px; }
        .tn-lead-input { width: 100%; height: 44px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); background: rgba(2,6,23,0.52); color: #fff; padding: 0 13px; font-size: 13px; outline: none; transition: all 0.2s ease; box-sizing: border-box; }
        .tn-lead-input:focus { border-color: rgba(165,214,255,0.75); box-shadow: 0 0 0 3px rgba(102,126,178,0.28); }
        .tn-lead-button { height: 44px; border: 0; border-radius: 999px; background: linear-gradient(90deg, #667eb2, #9333ea); color: #fff; font-size: 12px; font-weight: 900; cursor: pointer; box-shadow: 0 0 28px rgba(102,126,178,0.28); transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .tn-lead-button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 32px rgba(147,51,234,0.4); }
        .tn-lead-button:disabled { cursor: wait; opacity: 0.72; }
        .tn-lead-error { display: none; border-radius: 10px; background: rgba(244,63,94,0.12); color: #fda4af; padding: 9px 11px; font-size: 12px; font-weight: 700; margin: 0; }
        .tn-lead-success { display: none; min-height: 190px; align-items: center; justify-content: center; flex-direction: column; text-align: center; }
        .tn-lead-success-icon { display: grid; place-items: center; height: 42px; width: 42px; border-radius: 999px; background: rgba(16,185,129,0.14); color: #34d399; margin-bottom: 14px; }
        .tn-lead-success h2 { margin: 0; font-size: 20px; color: #fff; }
        .tn-lead-success p { margin: 8px 0 0; max-width: 260px; font-size: 13px; line-height: 1.55; color: #cbd5e1; }
        .tn-lead-foot { margin-top: 16px; padding-top: 13px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; gap: 12px; }
        @media (max-width: 640px) { .tn-lead-card { max-width: none; } }
      `;
      document.head.appendChild(style);
    };

    // 6. Action Handlers
    const handleClose = () => {
      const currentCount = Number(storage.get('localStorage', CONFIG.keys.dismissCount) || "0");
      storage.set('localStorage', CONFIG.keys.dismissCount, String(currentCount + 1));
      storage.set('localStorage', CONFIG.keys.lastDismissed, new Date().toISOString());
      storage.set('sessionStorage', CONFIG.keys.sessionDismissed, "true");

      const popup = document.getElementById("tnLeadCapturePopup");
      if (popup) {
        // Optional: Add a fade-out animation class here before removing
        popup.remove();
      }
    };

    const handleFormSubmit = async (event, elements) => {
      event.preventDefault();
      const { form, submitBtn, errorEl, formWrap, successWrap } = elements;

      const firstName = String(form.firstName?.value || "").trim();
      const email = String(form.email?.value || "").trim().toLowerCase();

      submitBtn.disabled = true;
      submitBtn.textContent = "Subscribing...";
      errorEl.style.display = "none";

      try {
        const payload = { firstName, email, ...getAttributionPayload() };
        
        const response = await fetch(CONFIG.endpoints.subscribe, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => null);
        
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || "Unable to subscribe right now. Please try again.");
        }

        // Success
        storage.set('localStorage', CONFIG.keys.subscribed, "true");

        if (typeof window.fbq === "function") {
          window.fbq("track", "Lead", {
            content_name: "Tochukwu Website Lead Capture Popup",
            content_category: getPageType(),
          });
        }

        formWrap.style.display = "none";
        successWrap.style.display = "flex";
        setTimeout(handleClose, 2600);

      } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = "block";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Subscribe to Insights";
      }
    };

    const renderPopup = () => {
      if (document.getElementById("tnLeadCapturePopup")) return;
      injectStyles();

      const markup = `
        <div class="tn-lead-popup" id="tnLeadCapturePopup">
          <div class="tn-lead-card" role="dialog" aria-modal="false" aria-labelledby="tnLeadTitle">
            <button type="button" class="tn-lead-close" aria-label="Close lead capture popup">&times;</button>
            
            <div class="tn-lead-success" data-lead-success>
              <div class="tn-lead-success-icon">&#10003;</div>
              <h2>You’re on the list.</h2>
              <p>Practical AI and building insights will arrive in your inbox shortly.</p>
            </div>
            
            <div data-lead-form-wrap>
              <div class="tn-lead-person">
                <img class="tn-lead-avatar" src="/assets/optimized/tochukwu-portrait.webp" alt="Tochukwu Nkwocha" loading="lazy" />
                <div>
                  <div class="tn-lead-eyebrow">Weekly practical notes</div>
                  <div class="tn-lead-name">Tochukwu Nkwocha</div>
                  <div class="tn-lead-role">Founder, builder, practical AI educator</div>
                </div>
              </div>
              
              <h2 class="tn-lead-title" id="tnLeadTitle">Practical AI and building lessons, minus the noise.</h2>
              <p class="tn-lead-copy">${getPopupMessage()}</p>
              
              <form class="tn-lead-form" data-lead-form novalidate>
                <input class="tn-lead-input" name="firstName" autocomplete="given-name" placeholder="First name" required />
                <input class="tn-lead-input" name="email" type="email" autocomplete="email" placeholder="Email address" required />
                <p class="tn-lead-error" data-lead-error></p>
                <button class="tn-lead-button" type="submit" data-lead-submit>Subscribe to Insights</button>
              </form>
              
              <div class="tn-lead-foot">
                <span>No spam.</span>
                <span>Useful notes only.</span>
              </div>
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML("beforeend", markup);

      // Bind Events
      const popup = document.getElementById("tnLeadCapturePopup");
      const elements = {
        form: popup.querySelector("[data-lead-form]"),
        formWrap: popup.querySelector("[data-lead-form-wrap]"),
        successWrap: popup.querySelector("[data-lead-success]"),
        errorEl: popup.querySelector("[data-lead-error]"),
        submitBtn: popup.querySelector("[data-lead-submit]"),
      };

      popup.querySelector(".tn-lead-close").addEventListener("click", handleClose);
      elements.form.addEventListener("submit", (e) => handleFormSubmit(e, elements));
    };

    // 7. Triggers (Time & Scroll)
    let isTriggered = false;

    const trigger = () => {
      if (isTriggered) return;
      isTriggered = true;
      renderPopup();
    };

    // Timer trigger
    setTimeout(trigger, CONFIG.trigger.delayMs);

    // Scroll trigger (Throttled for performance)
    let scrollTimeout;
    window.addEventListener("scroll", () => {
      if (isTriggered) return;
      
      if (!scrollTimeout) {
        scrollTimeout = setTimeout(() => {
          const scrollable = document.documentElement.scrollHeight - window.innerHeight;
          if (scrollable > 0 && (window.scrollY / scrollable) >= CONFIG.trigger.scrollThreshold) {
            trigger();
          }
          scrollTimeout = null;
        }, 150); // Checks scroll depth every 150ms instead of every pixel
      }
    }, { passive: true });
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
    const canTrackMeta = typeof window.fbq === "function";
    const canTrackGoogleAnalytics = typeof window.gtag === "function";
    if (!canTrackMeta && !canTrackGoogleAnalytics) return;

    const order = await fetchPaidOrderSummary(orderUuid);
    if (!order || !Number.isFinite(Number(order.value)) || !order.currency) return;
    const courseSlug = String(order.course_slug || "prompt-to-profit");
    const courseName = (COURSE_CONFIGS[courseSlug] && COURSE_CONFIGS[courseSlug].name) || "Course";
    const value = Number(order.value);
    const currency = String(order.currency).toUpperCase();

    if (canTrackMeta) {
      const metaStorageKey = `meta_purchase_sent_${orderUuid}`;
      if (!window.localStorage || window.localStorage.getItem(metaStorageKey) !== "1") {
        const eventId = `ptp_${orderUuid}`;
        window.fbq(
          "track",
          "Purchase",
          {
            value: value,
            currency: currency,
            content_name: courseName,
            content_type: "product",
            content_ids: [courseSlug],
          },
          { eventID: eventId }
        );

        if (window.localStorage) window.localStorage.setItem(metaStorageKey, "1");
      }
    }

    if (canTrackGoogleAnalytics) {
      const gaStorageKey = `ga_purchase_sent_${orderUuid}`;
      if (!window.localStorage || window.localStorage.getItem(gaStorageKey) !== "1") {
        window.gtag("event", "purchase", {
          transaction_id: orderUuid,
          value: value,
          currency: currency,
          items: [
            {
              item_id: courseSlug,
              item_name: courseName,
            },
          ],
        });

        if (window.localStorage) window.localStorage.setItem(gaStorageKey, "1");
      }
    }
  }

  function queuePurchaseWelcomeNotice(courseName) {
    const safeName = String(courseName || "").trim();
    if (!safeName) return;
    try {
      const payload = {
        courseName: safeName,
        expiresAt: Date.now() + PURCHASE_WELCOME_DURATION_MS,
      };
      window.localStorage.setItem(PURCHASE_WELCOME_KEY, JSON.stringify(payload));
    } catch (_error) {
      return;
    }
  }

  if (getCookieConsent() === "granted") {
    initOptionalTracking();
  } else if (!getCookieConsent()) {
    openCookieBanner();
  }
  mountWhatsAppFloat();
  initLeadCapturePopup();

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      const expanded = navToggle.getAttribute("aria-expanded") === "true";
      navToggle.setAttribute("aria-expanded", String(!expanded));
      navLinks.classList.toggle("open");
      if (expanded) {
        navDropdowns.forEach(function (item) {
          item.classList.remove("open");
          const itemToggle = item.querySelector(".nav-dropdown-toggle");
          if (itemToggle) itemToggle.setAttribute("aria-expanded", "false");
        });
      }
    });
  }

  if (navDropdowns.length) {
    navDropdowns.forEach(function (dropdown) {
      const toggle = dropdown.querySelector(".nav-dropdown-toggle");
      if (!toggle) return;
      toggle.addEventListener("click", function (event) {
        event.preventDefault();
        const willOpen = !dropdown.classList.contains("open");
        navDropdowns.forEach(function (item) {
          item.classList.remove("open");
          const itemToggle = item.querySelector(".nav-dropdown-toggle");
          if (itemToggle) itemToggle.setAttribute("aria-expanded", "false");
        });
        if (willOpen) {
          dropdown.classList.add("open");
          toggle.setAttribute("aria-expanded", "true");
        } else {
          toggle.setAttribute("aria-expanded", "false");
        }
      });
    });

    document.addEventListener("click", function (event) {
      var inside = event.target && event.target.closest && event.target.closest(".nav-dropdown");
      if (inside) return;
      navDropdowns.forEach(function (item) {
        item.classList.remove("open");
        const itemToggle = item.querySelector(".nav-dropdown-toggle");
        if (itemToggle) itemToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  document.querySelectorAll(".faq-question").forEach(function (button) {
    button.addEventListener("click", function () {
      const item = button.closest(".faq-item");
      if (item) item.classList.toggle("open");
    });
  });

  const modalMarkup = [
    '<div class="enrol-modal" id="enrolModal" aria-hidden="true">',
    '  <div class="enrol-modal__backdrop" data-enrol-close></div>',
    '  <div class="enrol-modal__panel" role="dialog" aria-modal="true" aria-labelledby="enrolTitle">',
    '    <button class="enrol-modal__close modal-close" type="button" aria-label="Close dialog" data-enrol-close>&times;</button>',
    '    <p class="enrol-modal__label" id="enrolCourseLabel">Course</p>',
    '    <h3 id="enrolTitle">Secure your slot now</h3>',
    '    <p class="enrol-modal__intro">Pay now to reserve your place. You will be added to the enrolment list and onboarded before launch.</p>',
    '    <p class="enrol-modal__batch-badge" id="enrolActiveBatch">Active Batch: Batch 1</p>',
    '    <form id="enrolForm" class="enrol-form" novalidate>',
    '      <label for="enrolFirstName">Full Name</label>',
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
    '          <span class="payment-option__meta" id="paystackOptionMeta">Pay securely in Naira.</span>',
    "        </button>",
    '        <button type="button" class="payment-option" data-provider="stripe" role="radio" aria-checked="false">',
    '          <span class="payment-option__title">Stripe</span>',
    '          <span class="payment-option__meta" id="paypalOptionMeta">International card checkout</span>',
    "        </button>",
    '        <button type="button" class="payment-option" data-provider="manual_transfer" role="radio" aria-checked="false">',
    '          <span class="payment-option__title">Manual bank transfer</span>',
    '          <span class="payment-option__meta" id="manualOptionMeta">Transfer and upload proof</span>',
    "        </button>",
    "      </div>",
    '      <section id="manualTransferBlock" class="manual-transfer" hidden>',
    '        <div class="manual-transfer__bank" id="manualBankDetails">',
    '          <p class="manual-transfer__title">Bank details</p>',
    '          <p>Bank details will appear here.</p>',
    "        </div>",
    '        <label for="manualProofFile">Payment proof (image/PDF)</label>',
    '        <input id="manualProofFile" name="manualProofFile" type="file" accept="image/*,.pdf" />',
    '        <p class="manual-transfer__hint">After upload and confirm, you will be added to pre-enrolment while payment is manually verified.</p>',
    "      </section>",
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
  const form = modal ? modal.querySelector("#enrolForm") : null;
  const errorEl = modal ? modal.querySelector("#enrolError") : null;
  const submitBtn = modal ? modal.querySelector("#enrolSubmit") : null;
  const enrolCourseLabel = modal ? modal.querySelector("#enrolCourseLabel") : null;
  const providerInput = modal ? modal.querySelector("#enrolProvider") : null;
  const paymentOptions = modal ? modal.querySelectorAll(".payment-option") : [];
  const paystackOptionMeta = modal ? modal.querySelector("#paystackOptionMeta") : null;
  const paypalOptionMeta = modal ? modal.querySelector("#paypalOptionMeta") : null;
  const manualOptionMeta = modal ? modal.querySelector("#manualOptionMeta") : null;
  const manualTransferBlock = modal ? modal.querySelector("#manualTransferBlock") : null;
  const manualBankDetails = modal ? modal.querySelector("#manualBankDetails") : null;
  const manualProofFileInput = modal ? modal.querySelector("#manualProofFile") : null;

  const paymentFeedbackMarkup = [
    '<div class="payment-feedback-modal" id="paymentFeedbackModal" aria-hidden="true">',
    '  <div class="payment-feedback-modal__backdrop" data-payment-close></div>',
    '  <div class="payment-feedback-modal__panel" role="dialog" aria-modal="true" aria-labelledby="paymentFeedbackTitle">',
    '    <button class="payment-feedback-modal__close modal-close" type="button" aria-label="Close dialog" data-payment-close>&times;</button>',
    '    <p class="payment-feedback-modal__label" id="paymentFeedbackCourseLabel">Course</p>',
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
  const paymentFeedbackCourseLabel = document.getElementById("paymentFeedbackCourseLabel");
  const enrolActiveBatchEl = modal ? modal.querySelector("#enrolActiveBatch") : null;
  const enrolIntroEl = modal ? modal.querySelector(".enrol-modal__intro") : null;

  let manualConfigLoaded = false;

  function parseBatchStart(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const match = raw.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/
    );
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const hour = Number(match[4]);
      const minute = Number(match[5]);
      const second = Number(match[6] || "0");
      // Interpret stored value as WAT wall clock (UTC+1).
      return new Date(Date.UTC(year, month - 1, day, hour - 1, minute, second));
    }
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function formatDayTime(date, timeZone) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }

  function formatCourseStartTime(date) {
    const wat = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date) + " WAT";
    const uk = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date) + " UK";
    const dayDate = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
    return `${uk} (${wat}), ${dayDate}`;
  }

  function formatDateOnly(date, timeZone) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  function formatShortDate(date, timeZone) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      day: "numeric",
      month: "long",
    }).format(date);
  }

  function formatGbpMinor(minor) {
    const amount = Number(minor || 0) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return "";
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
  }

  function launchScheduleText() {
    const startDate = parseBatchStart(activeCourseBatchStartAt);
    if (!startDate) return "";
    return `Launch is ${formatCourseStartTime(startDate)}.`;
  }

  function activeBatchText(active, field) {
    const label = String((active && active.batchLabel) || "Current Batch").trim() || "Current Batch";
    const startDate = parseBatchStart(active && active.batchStartAt);
    const fullStart = startDate ? formatCourseStartTime(startDate) : "";
    const dateOnly = startDate ? formatDateOnly(startDate, "Africa/Lagos") : "";
    const shortDate = startDate ? formatShortDate(startDate, "Africa/Lagos") : "";
    const key = String(field || "").trim();
    if (key === "label") return label;
    if (key === "active-pill") return label + " Enrolling Now";
    if (key === "start") return fullStart || dateOnly || "";
    if (key === "start-date") return dateOnly || fullStart || "";
    if (key === "start-short") return shortDate || dateOnly || "";
    if (key === "start-sentence") return fullStart ? "Classes begin " + fullStart + "." : "";
    if (key === "cohort-starts-copy") {
      return fullStart
        ? fullStart + ". There are limited seats. So, the earlier you enroll the better."
        : label + ". There are limited seats. So, the earlier you enroll the better.";
    }
    if (key === "cta-label") return "Join " + label;
    return "";
  }

  function applyActiveBatchPageFields(courseSlug, active) {
    const slug = String(courseSlug || "").trim();
    if (!slug || !active) return;
    document.querySelectorAll("[data-active-batch-course][data-active-batch-field]").forEach(function (el) {
      if (String(el.getAttribute("data-active-batch-course") || "").trim() !== slug) return;
      const field = el.getAttribute("data-active-batch-field");
      const value = activeBatchText(active, field);
      if (!value) return;
      el.textContent = value;
    });
  }

  function applyCourseLabels() {
    const cfg = currentCourseConfig();
    if (enrolCourseLabel) enrolCourseLabel.textContent = cfg.name;
    if (paymentFeedbackCourseLabel) paymentFeedbackCourseLabel.textContent = cfg.name;
  }

  function updateLaunchCopy() {
    if (enrolIntroEl) {
      const cfg = currentCourseConfig();
      const schedule = launchScheduleText();
      enrolIntroEl.textContent = schedule
        ? `${cfg.intro} ${schedule}`
        : cfg.intro;
    }
  }

  function applyEnabledPaymentMethods(methods) {
    enabledPaymentMethods = { paystack: false, stripe: false, manual_transfer: false };
    (Array.isArray(methods) ? methods : []).forEach(function (method) {
      var key = String(method || "").trim().toLowerCase();
      if (key === "paystack" || key === "stripe" || key === "manual_transfer") enabledPaymentMethods[key] = true;
    });
    if (!enabledPaymentMethods.paystack && !enabledPaymentMethods.stripe && !enabledPaymentMethods.manual_transfer) {
      enabledPaymentMethods = { paystack: true, stripe: true, manual_transfer: true };
    }
    paymentOptions.forEach(function (el) {
      var provider = String(el.getAttribute("data-provider") || "").trim().toLowerCase();
      var allowed = !!enabledPaymentMethods[provider];
      if (!allowed) {
        el.setAttribute("disabled", "disabled");
        el.setAttribute("data-disabled", "true");
      } else {
        el.removeAttribute("disabled");
        el.removeAttribute("data-disabled");
      }
      el.classList.toggle("opacity-50", !allowed);
      el.classList.toggle("cursor-not-allowed", !allowed);
    });
    setActiveProvider((providerInput && providerInput.value) || "paystack");
  }

  async function loadActiveBatch() {
    try {
      const cfg = currentCourseConfig();
      const res = await fetch(`/.netlify/functions/course-active-batch?course_slug=${encodeURIComponent(cfg.slug)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const json = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !json || !json.ok || !json.activeBatch) return;

      const active = json.activeBatch;
      applyEnabledPaymentMethods(Array.isArray(json.enabledPaymentMethods) ? json.enabledPaymentMethods : []);
      if (active && active.batchKey) activeCourseBatchKey = String(active.batchKey);
      activeCourseBatchStartAt = String((active && active.batchStartAt) || "").trim();
      if (enrolActiveBatchEl && active) {
        const schedule = launchScheduleText();
        enrolActiveBatchEl.innerHTML =
          '<span class="status-pill status-approved">Active Batch: ' +
          String(active.batchLabel || "Current Batch") +
          "</span>" +
          (schedule ? '<p class="mt-2 text-xs text-slate-500">' + schedule + "</p>" : "");
      }
      if (paypalOptionMeta) {
        paypalOptionMeta.textContent = "International card checkout";
      }
      updateLaunchCopy();
      applyActiveBatchPageFields(cfg.slug, active);
    } catch (_error) {
      return;
    }
  }

  function setActiveProvider(provider) {
    var requested = String(provider || "").trim();
    var target = Array.prototype.find.call(paymentOptions, function (el) {
      return String(el.getAttribute("data-provider") || "") === requested;
    });
    if (target && (target.hasAttribute("disabled") || target.getAttribute("data-disabled") === "true")) {
      requested = "";
    }
    if (!requested) {
      for (var i = 0; i < paymentOptions.length; i += 1) {
        var candidate = paymentOptions[i];
        if (!candidate.hasAttribute("disabled") && candidate.getAttribute("data-disabled") !== "true") {
          requested = String(candidate.getAttribute("data-provider") || "paystack");
          break;
        }
      }
    }
    provider = requested || "paystack";
    providerInput.value = provider;
    paymentOptions.forEach(function (el) {
      const isActive = el.getAttribute("data-provider") === provider;
      el.classList.toggle("is-active", isActive);
      el.setAttribute("aria-checked", isActive ? "true" : "false");
    });

    const isManual = provider === "manual_transfer";
    if (manualTransferBlock) manualTransferBlock.hidden = !isManual;
    submitBtn.textContent = isManual ? "Upload proof and confirm" : "Proceed to Payment";

    if (isManual) {
      ensureManualConfigLoaded().catch(function () {
        return null;
      });
    }
  }

  async function ensureManualConfigLoaded() {
    const cfg = currentCourseConfig();
    const cacheKey = `${cfg.slug}:${activeCourseBatchKey || ""}`;
    if (manualConfigLoaded && manualBankDetails && manualBankDetails.getAttribute("data-course-loaded") === cacheKey) {
      return;
    }
    manualConfigLoaded = true;

    try {
      const params = new URLSearchParams({
        course_slug: cfg.slug,
        batch_key: activeCourseBatchKey || "",
      });
      const res = await fetch(`/.netlify/functions/manual-payment-config?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const json = await res.json().catch(function () {
        return null;
      });

      if (!res.ok || !json || !json.ok || !json.details) {
        throw new Error((json && json.error) || "Could not load bank details");
      }

      const details = json.details || {};
      const accountName = String(details.accountName || "").trim();
      const accountNumber = String(details.accountNumber || "").trim();
      const bankName = String(details.bankName || "").trim();
      const amountLabel = String(details.amountLabel || "N10,750").trim();
      const note = String(details.note || "").trim();

      manualBankDetails.innerHTML = [
        '<p class="manual-transfer__title">Bank details</p>',
        `<p><strong>Bank:</strong> ${bankName || "-"}</p>`,
        `<p><strong>Account name:</strong> ${accountName || "-"}</p>`,
        `<p><strong>Account number:</strong> ${accountNumber || "-"}</p>`,
        `<p><strong>Amount:</strong> ${amountLabel}</p>`,
        note ? `<p class="manual-transfer__note">${note}</p>` : "",
      ].join("");
      manualBankDetails.setAttribute("data-course-loaded", cacheKey);
      if (paystackOptionMeta) paystackOptionMeta.textContent = `Pay in full (${amountLabel})`;
      if (manualOptionMeta) manualOptionMeta.textContent = `Transfer ${amountLabel} and upload proof`;
    } catch (_error) {
      manualBankDetails.innerHTML =
        '<p class="manual-transfer__title">Bank details</p><p>Bank details unavailable. Please try again shortly.</p>';
    }
  }

  async function getUploadSignature() {
    const res = await fetch("/.netlify/functions/upload-signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "manual_payment" }),
    });

    const json = await res.json().catch(function () {
      return null;
    });

    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not prepare upload");
    }

    return json;
  }

  async function uploadProofToCloudinary(file) {
    const uploadConfig = await getUploadSignature();

    const fd = new FormData();
    fd.append("file", file);
    fd.append("api_key", uploadConfig.apiKey);
    fd.append("timestamp", String(uploadConfig.timestamp));
    fd.append("folder", uploadConfig.folder);
    fd.append("signature", uploadConfig.signature);

    const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(uploadConfig.cloudName)}/auto/upload`;
    const res = await fetch(endpoint, {
      method: "POST",
      body: fd,
    });

    const json = await res.json().catch(function () {
      return null;
    });

    if (!res.ok || !json || !json.secure_url) {
      const message = (json && (json.error && json.error.message)) || "Could not upload proof";
      throw new Error(message);
    }

    return {
      proofUrl: String(json.secure_url || ""),
      proofPublicId: String(json.public_id || ""),
    };
  }

  paymentOptions.forEach(function (option) {
    option.addEventListener("click", function () {
      if (option.hasAttribute("disabled") || option.getAttribute("data-disabled") === "true") return;
      const provider = option.getAttribute("data-provider");
      if (!provider) return;
      setActiveProvider(provider);
    });
  });

  setActiveProvider((providerInput && providerInput.value) || "paystack");
  applyCourseLabels();
  updateLaunchCopy();

  function openEnrolModal() {
    if (!modal) return;
    loadActiveBatch()
      .catch(function () {
        return null;
      })
      .finally(function () {
        ensureManualConfigLoaded().catch(function () {
          return null;
        });
      });
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    const firstInput = modal.querySelector("#enrolFirstName");
    if (firstInput) firstInput.focus();
  }

  function closeEnrolModal() {
    if (!modal) return;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (errorEl) errorEl.textContent = "";
    form.reset();
    setActiveProvider("paystack");
    submitBtn.disabled = false;
    submitBtn.textContent = "Proceed to Payment";
  }

  function openPaymentFeedbackModal(status) {
    if (!paymentModal || !paymentTitle || !paymentMessage) return;

    if (status === "success") {
      paymentTitle.textContent = "Payment successful";
      const schedule = launchScheduleText();
      paymentMessage.textContent = schedule
        ? `Payment received. We have added you to the enrolment list. ${schedule}`
        : "Payment received. We have added you to the enrolment list.";
      paymentModal.classList.remove("is-error");
      paymentModal.classList.add("is-success");
    } else if (status === "manual_submitted") {
      paymentTitle.textContent = "Payment proof submitted";
      paymentMessage.textContent =
        "Thanks. We have added you to the pre-enrolment list. Our team will manually verify your transfer before full enrolment in the main class list.";
      paymentModal.classList.remove("is-error");
      paymentModal.classList.add("is-success");
    } else if (status === "cancelled") {
      paymentTitle.textContent = "Payment cancelled";
      paymentMessage.textContent = "You cancelled the payment. You have not been enrolled in the course yet. You can try again anytime.";
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
    .querySelectorAll('a[href="#ENROL_LINK"], [data-enrol-modal]')
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
    const affiliateCode = resolveAffiliateCode();

    if (!firstName || !email) {
      errorEl.textContent = "Please enter your full name and email address.";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = provider === "manual_transfer" ? "Uploading proof..." : "Submitting...";

    try {
      if (provider === "manual_transfer") {
        const proofFile = manualProofFileInput && manualProofFileInput.files ? manualProofFileInput.files[0] : null;

        if (!proofFile) {
          throw new Error("Please attach your payment proof file.");
        }

        submitBtn.textContent = "Uploading proof...";
        const uploaded = await uploadProofToCloudinary(proofFile);

        submitBtn.textContent = "Submitting confirmation...";
        const manualRes = await fetch("/.netlify/functions/manual-payment-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName,
            email,
            country,
            courseSlug: currentCourseConfig().slug,
            batchKey: activeCourseBatchKey,
            affiliateCode: affiliateCode,
            proofUrl: uploaded.proofUrl,
            proofPublicId: uploaded.proofPublicId,
          }),
        });

        const manualJson = await manualRes.json().catch(function () {
          return null;
        });

        if (!manualRes.ok || !manualJson || !manualJson.ok) {
          const msg = (manualJson && manualJson.error) || "Could not submit manual payment.";
          throw new Error(msg);
        }

        closeEnrolModal();
        openPaymentFeedbackModal("manual_submitted");
        return;
      }

      const recaptchaToken = await window.recaptchaHelper.getToken("course_order_create");
      const res = await fetch("/.netlify/functions/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          email,
          country,
          provider,
          courseSlug: currentCourseConfig().slug,
          batchKey: activeCourseBatchKey,
          affiliateCode: affiliateCode,
          recaptchaToken,
        }),
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
      submitBtn.textContent = provider === "manual_transfer" ? "Upload proof and confirm" : "Proceed to Payment";
    }
  });

  const search = new URLSearchParams(window.location.search);
  const payment = search.get("payment");
  const paidOrderUuid = search.get("order_uuid");
  const isEnrollmentCoursePage =
    window.location.pathname.indexOf("/courses/prompt-to-profit") === 0 ||
    window.location.pathname.indexOf("/courses/prompt-to-production") === 0;

  function trackCurrentPagePurchase() {
    if (payment !== "success" || !paidOrderUuid) return Promise.resolve();
    return trackPurchase(paidOrderUuid);
  }

  if (isEnrollmentCoursePage) {
    if (payment === "success" && paidOrderUuid) {
      queuePurchaseWelcomeNotice(currentCourseConfig().name);
      loadActiveBatch()
        .catch(function () {
          return null;
        })
        .finally(function () {
          openPaymentFeedbackModal("success");
        });
      trackCurrentPagePurchase().catch(function () {
        return null;
      });
    } else if (payment === "failed") {
      openPaymentFeedbackModal("failed");
    } else if (payment === "cancelled") {
      openPaymentFeedbackModal("cancelled");
    }
  }

  if (payment) {
    const url = new URL(window.location.href);
    url.searchParams.delete("payment");
    url.searchParams.delete("order_uuid");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }

  loadActiveBatch().catch(function () {
    return null;
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
      { threshold: 0.01, rootMargin: "0px 0px -8% 0px" }
    );

    revealItems.forEach(function (item) {
      // Very tall sections on small screens can fail higher visibility thresholds.
      // Mark them visible immediately to prevent blank sections.
      if (item.offsetHeight > window.innerHeight * 1.6) {
        item.classList.add("in");
        return;
      }
      observer.observe(item);
    });
  } else {
    revealItems.forEach(function (item) {
      item.classList.add("in");
    });
  }
})();
