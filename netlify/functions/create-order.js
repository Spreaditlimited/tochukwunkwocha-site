const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { paystackInitialize, paypalCreateOrder } = require("./_lib/payments");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { evaluateCouponForOrder, normalizeCouponCode, ensureCouponsTables } = require("./_lib/coupons");
const {
  DEFAULT_COURSE_SLUG,
  normalizeCourseSlug,
  getCourseConfig,
  getCourseDefaultAmountMinor,
  getCourseDefaultPaypalMinor,
} = require("./_lib/course-config");

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

function priceConfig({ provider, courseSlug, batch }) {
  const ngnMinor = Number((batch && batch.paystack_amount_minor) || getCourseDefaultAmountMinor(courseSlug));
  const paypalMinor = Number((batch && batch.paypal_amount_minor) || getCourseDefaultPaypalMinor(courseSlug));
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
  const courseConfig = getCourseConfig(courseSlug);
  if (!firstName || !email) {
    return json(400, { ok: false, error: "Full Name and valid email are required" });
  }

  if (provider !== "paystack" && provider !== "paypal") {
    return json(400, { ok: false, error: "Invalid payment provider" });
  }

  if (provider === "paystack") {
    return json(400, {
      ok: false,
      error: "Paystack is temporarily unavailable. Please use PayPal or manual transfer.",
    });
  }

  const orderUuid = crypto.randomUUID();

  const pool = getPool();

  try {
    await ensureCourseOrdersBatchColumns(pool);
    await ensureCourseBatchesTable(pool);
    await ensureCouponsTables(pool);
    const batch = await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey });
    if (!batch) return json(500, { ok: false, error: "No active batch configured" });
    const price = priceConfig({ provider, courseSlug, batch });

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
        batch.batch_key,
        batch.batch_label,
      ]
    );

    if (provider === "paystack") {
      const prefix = String(batch.paystack_reference_prefix || "PTP").trim().toUpperCase();
      const reference = `${prefix}_${orderUuid.replace(/-/g, "").slice(0, 24)}`;
      const payment = await paystackInitialize({
        email,
        amountMinor: pricing.finalAmountMinor,
        reference,
        metadata: {
          order_uuid: orderUuid,
          first_name: firstName,
          course_slug: courseSlug,
          batch_key: batch.batch_key,
          batch_label: batch.batch_label,
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
