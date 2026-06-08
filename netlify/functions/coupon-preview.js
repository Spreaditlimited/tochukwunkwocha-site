const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const {
  DEFAULT_COURSE_SLUG,
  normalizeCourseSlug,
  getCourseDefaultAmountMinor,
} = require("./_lib/course-config");
const { evaluateCouponForOrder, normalizeCouponCode, ensureCouponsTables } = require("./_lib/coupons");
const { maxFamilyChildren } = require("./_lib/families");

function normalizeProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "paystack") return raw;
  return "paystack";
}

function priceConfig({ provider, courseSlug, batch }) {
  const rawMinor = Number((batch && batch.paystack_amount_minor) || getCourseDefaultAmountMinor(courseSlug));
  if (provider !== "paystack") {
    throw new Error("Only Paystack coupon preview is supported.");
  }
  const courseMinor = Math.max(0, Number(rawMinor || 0));
  const vatPercentRaw = Number(process.env.SITE_VAT_PERCENT);
  const vatPercent = Number.isFinite(vatPercentRaw) && vatPercentRaw >= 0 ? vatPercentRaw : 7.5;
  const vatMinor = Math.round((courseMinor * vatPercent) / 100);
  const priceMinor = courseMinor + vatMinor;
  const applicableAtPrice = Math.round(priceMinor * 0.015) + (priceMinor < 250000 ? 0 : 10000);
  const amountMinor = applicableAtPrice > 200000
    ? (priceMinor + 200000)
    : Math.ceil(((priceMinor + (priceMinor < 250000 ? 0 : 10000)) / (1 - 0.015)) + 1);
  return { currency: "NGN", amountMinor };
}

function normalizeSeatCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.max(1, Math.min(maxFamilyChildren(), Math.round(parsed)));
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
  const seatCount = normalizeSeatCount(body.seatCount || body.seat_count);

  if (!couponCode) return json(400, { ok: false, error: "Enter a valid coupon code." });

  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
    await ensureCourseBatchesTable(pool);
    await ensureCouponsTables(pool);
    const batch = await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey });
    if (!batch) return json(500, { ok: false, error: "No active batch configured" });

    const base = priceConfig({ provider, courseSlug, batch });
    base.amountMinor = Number(base.amountMinor || 0) * seatCount;
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
