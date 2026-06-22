const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { paystackInitialize, stripeCreateCheckoutSession, siteBaseUrl } = require("./_lib/payments");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { assertBatchHasCapacity } = require("./_lib/batch-capacity");
const { evaluateCouponForOrder, normalizeCouponCode } = require("./_lib/coupons");
const { ensureLearningTables, findLearningCourseBySlug, normalizePaymentMethods } = require("./_lib/learning");
const { ensureAffiliateTables, recordAffiliateAttribution } = require("./_lib/affiliates");
const { upsertWhatsAppContact } = require("./_lib/whatsapp-marketing");
const {
  ensureFamilyTables,
  familyEnrollmentEnabledForCourse,
  groupEnrollmentBaseAmountMinor,
  normalizeFamilyPayload,
  savePendingFamilyChildren,
} = require("./_lib/families");
const {
  DEFAULT_COURSE_SLUG,
  normalizeCourseSlug,
  getCourseConfig,
  getCourseName,
  getCourseDefaultAmountMinor,
} = require("./_lib/course-config");
const { verifyRecaptchaToken, clientIpFromEvent } = require("./_lib/recaptcha");

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return ok ? email : "";
}

function normalizeProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "paystack") return raw;
  if (raw === "stripe") return raw;
  return "paystack";
}

function normalizeCountry(value) {
  return String(value || "").trim().slice(0, 120);
}

function normalizePhone(value) {
  return String(value || "").trim().slice(0, 40);
}

function normalizeAffiliateCode(value) {
  return String(value || "").trim().slice(0, 40).toUpperCase();
}
function requiresExplicitBatchSelection(courseSlug) {
  return String(courseSlug || "").trim().toLowerCase() === "prompt-to-profit-holiday";
}

function priceConfig({ provider, courseSlug, batch, learningCourse, enrollmentMode, seatCount }) {
  const mode = String(enrollmentMode || "batch").trim().toLowerCase() === "immediate" ? "immediate" : "batch";
  const qty = Math.max(1, Math.round(Number(seatCount || 1)));
  const courseNgnMinor = Number(learningCourse && learningCourse.price_ngn_minor);
  const singleCourseMinor = mode === "immediate"
    ? (Number.isFinite(courseNgnMinor) && courseNgnMinor > 0 ? Math.round(courseNgnMinor) : getCourseDefaultAmountMinor(courseSlug))
    : (Number.isFinite(courseNgnMinor) && courseNgnMinor > 0
      ? Math.round(courseNgnMinor)
      : Number((batch && batch.paystack_amount_minor) || getCourseDefaultAmountMinor(courseSlug)));
  const isStripe = provider === "stripe";
  if (provider !== "paystack" && !isStripe) throw new Error("Unsupported payment provider.");
  const country = normalizeCountry(arguments[0] && arguments[0].country);
  const stripeCurrency = resolveStripeCurrency(country);
  const stripeBaseMinor = resolveStripeBaseMinor({ learningCourse, courseSlug, currency: stripeCurrency });
  const vatPercentRaw = Number(isStripe ? process.env.INTL_VAT_PERCENT : process.env.SITE_VAT_PERCENT);
  const vatPercent = Number.isFinite(vatPercentRaw) && vatPercentRaw >= 0 ? vatPercentRaw : (isStripe ? 20 : 7.5);
  const courseMinor = familyEnrollmentEnabledForCourse(courseSlug) && qty > 1
    ? groupEnrollmentBaseAmountMinor(courseSlug, isStripe ? stripeBaseMinor : singleCourseMinor, qty)
    : Math.max(0, Number(isStripe ? stripeBaseMinor : singleCourseMinor || 0)) * qty;
  const vatMinor = Math.round((Math.max(0, Number(courseMinor || 0)) * vatPercent) / 100);
  const priceMinor = Math.max(0, Number(courseMinor || 0)) + vatMinor;
  if (isStripe) {
    const amountMinor = grossUpStripeAmount(priceMinor, stripeCurrency);
    return {
      currency: stripeCurrency,
      courseMinor,
      vatMinor,
      processingFeeMinor: amountMinor - priceMinor,
      amountMinor,
      amountDisplay: (amountMinor / 100).toFixed(2),
    };
  }
  const applicableAtPrice = Math.round(priceMinor * 0.015) + (priceMinor < 250000 ? 0 : 10000);
  const amountMinor = applicableAtPrice > 200000
    ? (priceMinor + 200000)
    : Math.ceil(((priceMinor + (priceMinor < 250000 ? 0 : 10000)) / (1 - 0.015)) + 1);
  return { currency: "NGN", amountMinor: amountMinor, amountDisplay: (amountMinor / 100).toFixed(2) };
}

function isNigeriaCountry(value) {
  const text = normalizeCountry(value).toLowerCase();
  return text === "ng" || text === "nga" || text === "nigeria";
}

function resolveStripeCurrency(country) {
  const text = normalizeCountry(country).toLowerCase();
  const eu = new Set([
    "at","austria","be","belgium","cy","cyprus","ee","estonia","fi","finland","fr","france","de","germany","gr","greece","ie","ireland","it","italy","lv","latvia","lt","lithuania","lu","luxembourg","mt","malta","nl","netherlands","pt","portugal","sk","slovakia","si","slovenia","es","spain",
  ]);
  if (text === "gb" || text === "gbr" || text === "uk" || text === "united kingdom" || text === "england" || text === "scotland" || text === "wales") return "GBP";
  if (text === "us" || text === "usa" || text === "united states" || text === "united states of america") return "USD";
  if (eu.has(text)) return "EUR";
  return "USD";
}

function resolveStripeBaseMinor({ learningCourse, courseSlug, currency }) {
  const cur = String(currency || "USD").toUpperCase();
  const slug = normalizeCourseSlug(courseSlug, DEFAULT_COURSE_SLUG);
  const fallbackMajor = {
    "prompt-to-profit": { GBP: 25, USD: 30, EUR: 25 },
    "prompt-to-production": { GBP: 100, USD: 150, EUR: 100 },
    "ai-for-everyday-business-owners": { GBP: 20, USD: 25, EUR: 20 },
  };
  const col = cur === "GBP" ? "price_gbp_minor" : (cur === "EUR" ? "price_eur_minor" : "price_usd_minor");
  const configured = Number(learningCourse && learningCourse[col]);
  const single = Number.isFinite(configured) && configured > 0
    ? Math.round(configured)
    : Math.round(Number((fallbackMajor[slug] && (fallbackMajor[slug][cur] || fallbackMajor[slug].USD)) || 30) * 100);
  return Math.max(0, single);
}

function stripeFixedFeeMinor(currency) {
  const cur = String(currency || "USD").toUpperCase();
  const raw = Number(process.env[`STRIPE_FEE_FIXED_${cur}_MINOR`]);
  if (Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  if (cur === "GBP") return 20;
  if (cur === "EUR") return 25;
  return 30;
}

function grossUpStripeAmount(netMinor, currency) {
  const net = Math.max(0, Math.round(Number(netMinor || 0)));
  const bpsRaw = Number(process.env.STRIPE_FEE_BPS);
  const bps = Number.isFinite(bpsRaw) && bpsRaw >= 0 ? Math.round(bpsRaw) : 150;
  const fixed = stripeFixedFeeMinor(currency);
  if (bps >= 10000) return net + fixed;
  return Math.ceil(((net + fixed) / (1 - bps / 10000)) + 1);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const firstName = String(body.firstName || "").trim().slice(0, 120);
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  const whatsappOptIn = body.whatsappOptIn === true;
  const optInTextVersion = String(body.optInTextVersion || "enrollment_whatsapp_v1").trim().slice(0, 80);
  const country = normalizeCountry(body.country);
  const provider = normalizeProvider(body.provider);
  const courseSlug = normalizeCourseSlug(body.courseSlug, DEFAULT_COURSE_SLUG);
  const couponCode = normalizeCouponCode(body.couponCode);
  const affiliateCode = normalizeAffiliateCode(
    body.affiliateCode ||
      body.affiliate_code ||
      body.ref ||
      (event.queryStringParameters && event.queryStringParameters.ref) ||
      (event.queryStringParameters && event.queryStringParameters.affiliate)
  );
  const courseConfig = getCourseConfig(courseSlug);
  const family = normalizeFamilyPayload(body, firstName);
  if (!firstName || !email || !phone) {
    return json(400, { ok: false, error: "Full Name, valid email, and WhatsApp phone number are required" });
  }
  if (family.isFamily && !familyEnrollmentEnabledForCourse(courseSlug)) {
    return json(400, { ok: false, error: "Family enrollment is not available for this course." });
  }

  if (provider === "stripe" && isNigeriaCountry(country)) {
    return json(400, { ok: false, error: "Stripe is for international payments. Please use Paystack or bank transfer in Nigeria." });
  }

  if (provider !== "paystack" && provider !== "stripe") {
    return json(400, { ok: false, error: "Invalid payment provider" });
  }

  const pool = getPool();

  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  const recaptcha = await verifyRecaptchaToken({
    token: body.recaptchaToken,
    expectedAction: "course_order_create",
    remoteip: clientIpFromEvent(event),
    headers: event.headers || {},
  });
  if (!recaptcha.ok) {
    console.warn("course_order_recaptcha_failed", {
      reason: recaptcha.reason || "unknown",
      action: recaptcha.action || "",
      score: Number(recaptcha.score || 0),
      courseSlug,
      provider,
    });
    return json(400, { ok: false, error: "We could not verify this request. Please try again." });
  }

  const orderUuid = crypto.randomUUID();

  try {
    await ensureLearningTables(pool);
    await ensureFamilyTables(pool);
    await ensureAffiliateTables(pool);
    const learningCourse = await findLearningCourseBySlug(pool, courseSlug);
    if (!learningCourse) {
      return json(400, { ok: false, error: "Unknown course. Please choose a valid course." });
    }
    if (Number(learningCourse.is_enrollment_locked || 0) === 1) {
      return json(409, { ok: false, error: "Enrollment is currently locked for this course." });
    }
    await ensureCourseOrdersBatchColumns(pool);
    await ensureCourseBatchesTable(pool);
    const enrollmentMode = String(learningCourse && learningCourse.enrollment_mode || "batch").trim().toLowerCase() === "immediate"
      ? "immediate"
      : "batch";
    const allowedMethods = normalizePaymentMethods(learningCourse && learningCourse.payment_methods).split(",");
    if (provider === "stripe" && allowedMethods.indexOf("stripe") === -1) allowedMethods.push("stripe");
    if (allowedMethods.indexOf(provider) === -1) {
      return json(400, { ok: false, error: "Selected payment method is not available for this course." });
    }
    const batch = enrollmentMode === "batch"
      ? await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey })
      : null;
    if (enrollmentMode === "batch" && !batch) return json(500, { ok: false, error: "No active batch configured" });
    if (enrollmentMode === "batch" && requiresExplicitBatchSelection(courseSlug)) {
      const requestedBatchKey = String(body.batchKey || "").trim();
      if (!requestedBatchKey) {
        return json(400, { ok: false, error: "Please choose a batch before continuing." });
      }
      if (String(batch.batch_key || "").toLowerCase() !== requestedBatchKey.toLowerCase()) {
        return json(400, { ok: false, error: "Selected batch is unavailable. Please choose another batch." });
      }
      const capacity = await assertBatchHasCapacity(pool, { courseSlug, batchKey: batch.batch_key });
      if (capacity && capacity.remainingSeats !== null && family.seatCount > capacity.remainingSeats) {
        return json(409, { ok: false, error: `Only ${capacity.remainingSeats} seats are left in this batch.` });
      }
    }
    const price = priceConfig({ provider, courseSlug, batch, learningCourse, enrollmentMode, seatCount: family.seatCount, country });

    let pricing = {
      currency: price.currency,
      baseAmountMinor: Number(price.amountMinor || 0),
      discountMinor: 0,
      finalAmountMinor: Number(price.amountMinor || 0),
      couponCode: "",
      couponId: null,
    };

    if (couponCode) {
      const evaluated = await evaluateCouponForOrder(pool, {
        couponCode,
        courseSlug,
        email,
        currency: price.currency,
        baseAmountMinor: price.amountMinor,
      });
      if (!evaluated.ok) {
        return json(400, { ok: false, error: evaluated.error || "Invalid coupon code." });
      }
      pricing = {
        currency: evaluated.pricing.currency,
        baseAmountMinor: evaluated.pricing.baseAmountMinor,
        discountMinor: evaluated.pricing.discountMinor,
        finalAmountMinor: evaluated.pricing.finalAmountMinor,
        couponCode: String((evaluated.coupon && evaluated.coupon.code) || couponCode),
        couponId: evaluated.coupon ? Number(evaluated.coupon.id) : null,
      };
    }

    try {
      await pool.query(
        `INSERT INTO course_orders
         (order_uuid, course_slug, first_name, email, phone, country, currency, amount_minor, base_amount_minor, discount_minor, final_amount_minor, coupon_code, coupon_id, provider, buyer_type, seat_count, status, batch_key, batch_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          orderUuid,
          courseSlug,
          firstName,
          email,
          phone || null,
          country || null,
          pricing.currency,
          pricing.finalAmountMinor,
          pricing.baseAmountMinor,
          pricing.discountMinor,
          pricing.finalAmountMinor,
          pricing.couponCode || null,
          pricing.couponId,
          provider,
          family.isFamily ? "family" : "student",
          family.seatCount,
          batch ? batch.batch_key : null,
          batch ? batch.batch_label : null,
        ]
      );
    } catch (insertError) {
      const msg = String(insertError && insertError.message || "").toLowerCase();
      const missingCompatibleColumn =
        msg.indexOf("unknown column") !== -1 &&
        (msg.indexOf("phone") !== -1 || msg.indexOf("buyer_type") !== -1 || msg.indexOf("seat_count") !== -1);
      if (!missingCompatibleColumn || family.isFamily) throw insertError;
      await pool.query(
        `INSERT INTO course_orders
         (order_uuid, course_slug, first_name, email, country, currency, amount_minor, base_amount_minor, discount_minor, final_amount_minor, coupon_code, coupon_id, provider, status, batch_key, batch_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          orderUuid,
          courseSlug,
          firstName,
          email,
          country || null,
          pricing.currency,
          pricing.finalAmountMinor,
          pricing.baseAmountMinor,
          pricing.discountMinor,
          pricing.finalAmountMinor,
          pricing.couponCode || null,
          pricing.couponId,
          provider,
          batch ? batch.batch_key : null,
          batch ? batch.batch_label : null,
        ]
      );
    }

    if (family.isFamily) {
      await savePendingFamilyChildren(pool, {
        sourceType: "course_order",
        sourceUuid: orderUuid,
        courseSlug,
        batchKey: batch ? batch.batch_key : null,
        batchLabel: batch ? batch.batch_label : null,
        children: family.children,
      });
    }

    if (affiliateCode) {
      await recordAffiliateAttribution(pool, {
        orderUuid,
        courseSlug,
        affiliateCode,
        buyerEmail: email,
        buyerCountry: country,
        buyerCurrency: pricing.currency,
        orderAmountMinor: pricing.finalAmountMinor,
        requestHeaders: event && event.headers ? event.headers : {},
      }).catch(function () {
        return null;
      });
    }

    if (whatsappOptIn) {
      await upsertWhatsAppContact(pool, {
        email,
        fullName: firstName,
        phone,
        courseSlug,
        source: `${provider}_enrollment`,
        optedIn: true,
        optInVersion: optInTextVersion,
      }).catch(function (error) {
        console.error("course_whatsapp_contact_upsert_failed", error && error.message ? error.message : error);
      });
    }

    const prefix = String((batch && batch.paystack_reference_prefix) || (courseConfig && courseConfig.defaultPrefix) || "PTP").trim().toUpperCase();
    const reference = `${prefix}_${orderUuid.replace(/-/g, "").slice(0, 24)}`;
    const metadata = {
        order_uuid: orderUuid,
        first_name: firstName,
        course_slug: courseSlug,
        batch_key: batch ? batch.batch_key : null,
        batch_label: batch ? batch.batch_label : null,
        buyer_type: family.isFamily ? "family" : "student",
        seat_count: family.seatCount,
    };
    const payment = provider === "stripe"
      ? await stripeCreateCheckoutSession({
          email,
          amountMinor: pricing.finalAmountMinor,
          currency: pricing.currency,
          courseName: getCourseName(courseSlug),
          orderUuid,
          metadata,
          successUrl: `${siteBaseUrl()}/.netlify/functions/stripe-return?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${siteBaseUrl()}${courseConfig && courseConfig.landingPath ? courseConfig.landingPath : "/courses"}?payment=cancelled`,
        })
      : await paystackInitialize({
          email,
          amountMinor: pricing.finalAmountMinor,
          reference,
          metadata,
        });

    await pool.query(
      `UPDATE course_orders
       SET provider_reference = ?,
           provider_order_id = ?
       WHERE order_uuid = ?`,
      [payment.providerReference, payment.providerOrderId || null, orderUuid]
    );

    return json(200, {
      ok: true,
      orderUuid,
      provider,
      checkoutUrl: payment.checkoutUrl,
      pricing: {
        currency: pricing.currency,
        baseAmountMinor: pricing.baseAmountMinor,
        discountMinor: pricing.discountMinor,
        finalAmountMinor: pricing.finalAmountMinor,
        couponCode: pricing.couponCode || null,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not create order" });
  }
};
