const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { paystackInitialize, stripeCreateCheckoutSession, siteBaseUrl } = require("./_lib/payments");
const { ensureSchoolTables, createSchoolOrder, schoolsStripePricingForPool, isNigeriaCountry } = require("./_lib/schools");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { ensureLearningTables, findLearningCourseBySlug } = require("./_lib/learning");
const { ensureAffiliateTables, captureSchoolOrderReferral } = require("./_lib/affiliates");
const { verifyRecaptchaToken, clientIpFromEvent } = require("./_lib/recaptcha");

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function normalizeProvider(value) {
  const raw = clean(value, 40).toLowerCase();
  if (raw === "stripe") return "stripe";
  return "paystack";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const pool = getPool();
  try {
    const recaptcha = await verifyRecaptchaToken({
      token: body.recaptchaToken,
      expectedAction: "school_create_payment",
      remoteip: clientIpFromEvent(event),
    });
    if (!recaptcha.ok) {
      return json(400, { ok: false, error: "We could not verify this request. Please try again." });
    }
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}
    await ensureLearningTables(pool);
    await ensureAffiliateTables(pool);
    const courseSlug = String(body.courseSlug || "prompt-to-profit").trim().toLowerCase() || "prompt-to-profit";
    const learningCourse = await findLearningCourseBySlug(pool, courseSlug);
    if (!learningCourse) {
      return json(400, { ok: false, error: "Unknown course. Please choose a valid course." });
    }
    await ensureSchoolTables(pool);
    const country = clean(body.country, 120);
    if (!country) {
      return json(400, { ok: false, error: "Select your country before continuing." });
    }
    const provider = normalizeProvider(body.provider);
    if (isNigeriaCountry(country) && provider !== "paystack") {
      return json(400, { ok: false, error: "Use Paystack for Nigerian school registration payments." });
    }
    if (!isNigeriaCountry(country) && provider !== "stripe") {
      return json(400, { ok: false, error: "Use Stripe for international school registration payments." });
    }
    const pricing = provider === "stripe" ? await schoolsStripePricingForPool(pool, body.seatCount, country, courseSlug) : null;
    const order = await createSchoolOrder(pool, {
      schoolName: body.schoolName,
      adminName: body.adminName,
      adminEmail: body.adminEmail,
      adminPhone: body.adminPhone,
      country,
      seatsRequested: body.seatCount,
      courseSlug,
      provider,
      pricing,
    });

    const affiliateCode = String(body.affiliateCode || body.affiliate_code || "").trim().toUpperCase().slice(0, 40);
    if (affiliateCode) {
      await captureSchoolOrderReferral(pool, {
        orderUuid: order.orderUuid,
        affiliateCode,
      }).catch(function () {
        return null;
      });
    }

    const reference = `SCH_${order.orderUuid.replace(/[^a-z0-9]/gi, "").slice(0, 26).toUpperCase()}`;
    const metadata = {
      school_order_uuid: order.orderUuid,
      school_name: String(body.schoolName || "").trim(),
      admin_email: String(body.adminEmail || "").trim().toLowerCase(),
      course_slug: courseSlug,
      seat_count: Number(order.pricing.seats || 0),
      payment_scope: "school_registration",
    };
    const payment = provider === "stripe"
      ? await stripeCreateCheckoutSession({
          email: String(body.adminEmail || "").trim().toLowerCase(),
          amountMinor: Number(order.pricing.totalMinor || 0),
          currency: String(order.pricing.currency || "USD").toUpperCase(),
          courseName: "Prompt to Profit for Schools",
          orderUuid: order.orderUuid,
          metadata,
          successUrl: `${siteBaseUrl()}/.netlify/functions/school-stripe-return?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${siteBaseUrl()}/schools/login/?mode=register&payment=cancelled`,
        })
      : await paystackInitialize({
          email: String(body.adminEmail || "").trim().toLowerCase(),
          amountMinor: Number(order.pricing.totalMinor || 0),
          reference,
          callbackUrl: `${siteBaseUrl()}/.netlify/functions/school-paystack-return`,
          metadata,
        });

    await pool.query(
      `UPDATE school_orders
       SET provider_reference = ?, provider_order_id = ?, updated_at = NOW()
       WHERE order_uuid = ?
       LIMIT 1`,
      [payment.providerReference || reference, payment.providerOrderId || null, order.orderUuid]
    );

    return json(200, {
      ok: true,
      orderUuid: order.orderUuid,
      provider,
      checkoutUrl: payment.checkoutUrl,
      pricing: order.pricing,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not create school payment." });
  }
};
