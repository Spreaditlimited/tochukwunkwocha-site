const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { listCourseBatches } = require("./_lib/batch-store");
const { ensureCourseOrdersProviderColumn } = require("./_lib/course-orders");
const { normalizeCourseSlug, DEFAULT_COURSE_SLUG } = require("./_lib/course-config");
const { ensureLearningTables, findLearningCourseBySlug, normalizePaymentMethods } = require("./_lib/learning");
const { familyEnrollmentEnabledForCourse, maxFamilyChildren } = require("./_lib/families");

function normalizeBooleanFlag(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "number") return value === 1;
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  return text === "true" || text === "1" || text === "yes";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const courseSlug = normalizeCourseSlug(
    event.queryStringParameters && event.queryStringParameters.course_slug,
    DEFAULT_COURSE_SLUG
  );

  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
    await ensureCourseOrdersProviderColumn(pool);
    await ensureLearningTables(pool);
    const learningCourse = await findLearningCourseBySlug(pool, courseSlug);
    const vatPercent = Number(process.env.SITE_VAT_PERCENT);
    const safeVatPercent = Number.isFinite(vatPercent) && vatPercent >= 0 ? vatPercent : 7.5;
    const enabledPaymentMethods = normalizePaymentMethods(learningCourse && learningCourse.payment_methods).split(",");
    const isEnrollmentLocked = Number(learningCourse && learningCourse.is_enrollment_locked || 0) === 1;
    const rows = await listCourseBatches(pool, courseSlug);
    const open = (rows || []).filter((item) => String(item.status || "").toLowerCase() === "open");
    const capacities = [];
    for (const row of open) {
      capacities.push({
        batchKey: row.batch_key,
        batchLabel: row.batch_label,
        batchStartAt: row.batch_start_at || null,
        paystackAmountMinor: Number(row.paystack_amount_minor || 0),
        paypalAmountMinor: Number(row.paypal_amount_minor || 0),
        seatLimit: null,
        enrolledCount: 0,
        remainingSeats: null,
        isFull: false,
      });
    }
    return json(200, {
      ok: true,
      courseSlug,
      isEnrollmentLocked,
      enabledPaymentMethods,
      familyEnrollment: {
        enabled: familyEnrollmentEnabledForCourse(courseSlug),
        maxChildren: maxFamilyChildren(),
      },
      coursePricing: {
        priceNgnMinor: Number(learningCourse && learningCourse.price_ngn_minor || 0),
        priceGbpMinor: Number(learningCourse && learningCourse.price_gbp_minor || 0),
        priceUsdMinor: Number(learningCourse && learningCourse.price_usd_minor || 0),
        priceEurMinor: Number(learningCourse && learningCourse.price_eur_minor || 0),
        vatPercent: safeVatPercent,
        intlVatPercent: Number(process.env.INTL_VAT_PERCENT || 20),
        paystackFeeBps: Number(learningCourse && learningCourse.paystack_fee_bps || 150),
        paystackFeeFixedMinorNgn: Number(learningCourse && learningCourse.paystack_fee_fixed_minor_ngn || 10000),
      },
      batches: capacities,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load open batches" });
  }
};
