const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const {
  DEFAULT_COURSE_SLUG,
  normalizeCourseSlug,
  getCourseDefaultAmountMinor,
  getCourseDefaultPaypalMinor,
} = require("./_lib/course-config");
const { evaluateCouponForOrder, normalizeCouponCode, ensureCouponsTables } = require("./_lib/coupons");

function normalizeProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "paystack" || raw === "paypal") return raw;
  return "paypal";
}

function priceConfig({ provider, courseSlug, batch }) {
  const ngnMinor = Number((batch && batch.paystack_amount_minor) || getCourseDefaultAmountMinor(courseSlug));
  const paypalMinor = Number((batch && batch.paypal_amount_minor) || getCourseDefaultPaypalMinor(courseSlug));
  if (provider === "paystack") {
    return { currency: "NGN", amountMinor: ngnMinor };
  }
  return { currency: "GBP", amountMinor: paypalMinor };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const courseSlug = normalizeCourseSlug(body.courseSlug, DEFAULT_COURSE_SLUG);
  const provider = normalizeProvider(body.provider);
  const couponCode = normalizeCouponCode(body.couponCode);
  const email = String(body.email || "").trim().toLowerCase();

  if (!couponCode) return json(400, { ok: false, error: "Enter a valid coupon code." });

  const pool = getPool();
  try {
    await ensureCourseBatchesTable(pool);
    await ensureCouponsTables(pool);
    const batch = await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey });
    if (!batch) return json(500, { ok: false, error: "No active batch configured" });

    const base = priceConfig({ provider, courseSlug, batch });
    const evaluated = await evaluateCouponForOrder(pool, {
      couponCode,
      courseSlug,
      email,
      currency: base.currency,
      baseAmountMinor: base.amountMinor,
    });
    if (!evaluated.ok) return json(400, { ok: false, error: evaluated.error || "Invalid coupon." });

    return json(200, {
      ok: true,
      coupon: evaluated.coupon,
      pricing: evaluated.pricing,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not apply coupon" });
  }
};

