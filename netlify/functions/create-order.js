const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { paystackInitialize, paypalCreateOrder } = require("./_lib/payments");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { evaluateCouponForOrder, normalizeCouponCode } = require("./_lib/coupons");
const { ensureLearningTables, findLearningCourseBySlug, normalizePaymentMethods } = require("./_lib/learning");
const { ensureAffiliateTables, recordAffiliateAttribution } = require("./_lib/affiliates");
const {
  DEFAULT_COURSE_SLUG,
  normalizeCourseSlug,
  getCourseConfig,
  getCourseDefaultAmountMinor,
  getCourseDefaultPaypalMinor,
} = require("./_lib/course-config");
const { verifyRecaptchaToken, clientIpFromEvent } = require("./_lib/recaptcha");

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return ok ? email : "";
}

function normalizeProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "paystack" || raw === "paypal") return raw;
  return "paypal";
}

function normalizeCountry(value) {
  return String(value || "").trim().slice(0, 120);
}

function normalizeAffiliateCode(value) {
  return String(value || "").trim().slice(0, 40).toUpperCase();
}

function priceConfig({ provider, courseSlug, batch, learningCourse, enrollmentMode }) {
  const mode = String(enrollmentMode || "batch").trim().toLowerCase() === "immediate" ? "immediate" : "batch";
  const courseNgnMinor = Number(learningCourse && learningCourse.price_ngn_minor);
  const courseGbpMinor = Number(learningCourse && learningCourse.price_gbp_minor);
  const ngnMinor = mode === "immediate"
    ? (Number.isFinite(courseNgnMinor) && courseNgnMinor > 0 ? Math.round(courseNgnMinor) : getCourseDefaultAmountMinor(courseSlug))
    : Number((batch && batch.paystack_amount_minor) || getCourseDefaultAmountMinor(courseSlug));
  const paypalMinor = mode === "immediate"
    ? (Number.isFinite(courseGbpMinor) && courseGbpMinor > 0 ? Math.round(courseGbpMinor) : getCourseDefaultPaypalMinor(courseSlug))
    : Number((batch && batch.paypal_amount_minor) || getCourseDefaultPaypalMinor(courseSlug));
  const gbp = (paypalMinor / 100).toFixed(2);
  if (provider === "paystack") {
    return { currency: "NGN", amountMinor: ngnMinor, amountDisplay: (ngnMinor / 100).toFixed(2) };
  }
  return { currency: "GBP", amountMinor: paypalMinor, amountDisplay: gbp };
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
  if (!firstName || !email) {
    return json(400, { ok: false, error: "Full Name and valid email are required" });
  }

  if (provider !== "paystack" && provider !== "paypal") {
    return json(400, { ok: false, error: "Invalid payment provider" });
  }

  const recaptcha = await verifyRecaptchaToken({
    token: body.recaptchaToken,
    expectedAction: "course_order_create",
    remoteip: clientIpFromEvent(event),
  });
  if (!recaptcha.ok) {
    return json(400, { ok: false, error: "We could not verify this request. Please try again." });
  }

  const orderUuid = crypto.randomUUID();

  const pool = getPool();

  try {
    await ensureLearningTables(pool);
    await ensureAffiliateTables(pool);
    const learningCourse = await findLearningCourseBySlug(pool, courseSlug);
    if (!learningCourse) {
      return json(400, { ok: false, error: "Unknown course. Please choose a valid course." });
    }
    await ensureCourseOrdersBatchColumns(pool);
    await ensureCourseBatchesTable(pool);
    const enrollmentMode = String(learningCourse && learningCourse.enrollment_mode || "batch").trim().toLowerCase() === "immediate"
      ? "immediate"
      : "batch";
    const allowedMethods = normalizePaymentMethods(learningCourse && learningCourse.payment_methods).split(",");
    if (allowedMethods.indexOf(provider) === -1) {
      return json(400, { ok: false, error: "Selected payment method is not available for this course." });
    }
    const batch = enrollmentMode === "batch"
      ? await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey })
      : null;
    if (enrollmentMode === "batch" && !batch) return json(500, { ok: false, error: "No active batch configured" });
    const price = priceConfig({ provider, courseSlug, batch, learningCourse, enrollmentMode });

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

    const amountDisplay =
      price.currency === "NGN"
        ? (pricing.finalAmountMinor / 100).toFixed(2)
        : (pricing.finalAmountMinor / 100).toFixed(2);

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

    if (provider === "paystack") {
      const prefix = String((batch && batch.paystack_reference_prefix) || (courseConfig && courseConfig.defaultPrefix) || "PTP").trim().toUpperCase();
      const reference = `${prefix}_${orderUuid.replace(/-/g, "").slice(0, 24)}`;
      const payment = await paystackInitialize({
        email,
        amountMinor: pricing.finalAmountMinor,
        reference,
        metadata: {
          order_uuid: orderUuid,
          first_name: firstName,
          course_slug: courseSlug,
          batch_key: batch ? batch.batch_key : null,
          batch_label: batch ? batch.batch_label : null,
        },
      });

      await pool.query(
        `UPDATE course_orders
         SET provider_reference = ?
         WHERE order_uuid = ?`,
        [payment.providerReference, orderUuid]
      );

      return json(200, {
        ok: true,
        orderUuid,
        provider,
        checkoutUrl: payment.checkoutUrl,
      });
    }

      const payment = await paypalCreateOrder({
      amount: amountDisplay,
      currency: pricing.currency,
      customId: orderUuid,
      description: `${String((courseConfig && courseConfig.name) || "Course")} pre-enrolment`,
      cancelPath: String((courseConfig && courseConfig.landingPath) || "/courses/prompt-to-profit"),
    });

    await pool.query(
      `UPDATE course_orders
       SET provider_order_id = ?
       WHERE order_uuid = ?`,
      [payment.orderId, orderUuid]
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
