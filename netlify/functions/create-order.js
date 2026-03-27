const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { paystackInitialize, paypalCreateOrder } = require("./_lib/payments");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
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
  return "paystack";
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
  const courseConfig = getCourseConfig(courseSlug);
  if (!firstName || !email) {
    return json(400, { ok: false, error: "Full Name and valid email are required" });
  }

  if (provider !== "paystack" && provider !== "paypal") {
    return json(400, { ok: false, error: "Invalid payment provider" });
  }

  const orderUuid = crypto.randomUUID();

  const pool = getPool();

  try {
    await ensureCourseOrdersBatchColumns(pool);
    await ensureCourseBatchesTable(pool);
    const batch = await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey });
    if (!batch) return json(500, { ok: false, error: "No active batch configured" });
    const price = priceConfig({ provider, courseSlug, batch });

    await pool.query(
      `INSERT INTO course_orders
       (order_uuid, course_slug, first_name, email, country, currency, amount_minor, provider, status, batch_key, batch_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [orderUuid, courseSlug, firstName, email, country || null, price.currency, price.amountMinor, provider, batch.batch_key, batch.batch_label]
    );

    if (provider === "paystack") {
      const prefix = String(batch.paystack_reference_prefix || "PTP").trim().toUpperCase();
      const reference = `${prefix}_${orderUuid.replace(/-/g, "").slice(0, 24)}`;
      const payment = await paystackInitialize({
        email,
        amountMinor: price.amountMinor,
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
      amount: price.amountDisplay,
      currency: price.currency,
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
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not create order" });
  }
};
