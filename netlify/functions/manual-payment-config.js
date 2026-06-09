const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug, getCourseName, getCourseDefaultAmountMinor } = require("./_lib/course-config");
const { ensureCouponsTables, evaluateCouponForOrder, normalizeCouponCode } = require("./_lib/coupons");
const { ensureLearningTables, findLearningCourseBySlug } = require("./_lib/learning");
const { groupEnrollmentBaseAmountMinor, groupEnrollmentUnitPriceMinor, maxFamilyChildren } = require("./_lib/families");

function formatNaira(minor) {
  const amount = Math.max(0, Number(minor || 0)) / 100;
  const rounded = Math.round(amount);
  return `N${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(rounded)}`;
}

function vatPercentFromSettings() {
  const raw = Number(process.env.SITE_VAT_PERCENT);
  return Number.isFinite(raw) && raw >= 0 ? raw : 7.5;
}

function manualPaymentPricing(courseSlug, learningCourse, seatCount) {
  const courseNgnMinor = Number(learningCourse && learningCourse.price_ngn_minor);
  const standardCourseMinor = Number.isFinite(courseNgnMinor) && courseNgnMinor > 0
    ? Math.round(courseNgnMinor)
    : getCourseDefaultAmountMinor(courseSlug);
  const courseMinor = groupEnrollmentUnitPriceMinor(courseSlug, standardCourseMinor, seatCount);
  const vatPercent = vatPercentFromSettings();
  const vatMinor = Math.round((courseMinor * vatPercent) / 100);
  return {
    currency: "NGN",
    courseMinor,
    vatPercent,
    vatMinor,
    totalMinor: courseMinor + vatMinor,
  };
}

function normalizeSeatCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.max(1, Math.min(maxFamilyChildren(), Math.round(parsed)));
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const qs = event.queryStringParameters || {};
  const courseSlug = normalizeCourseSlug(qs.course_slug, DEFAULT_COURSE_SLUG);
  const batchKey = String(qs.batch_key || "").trim();
  const couponCode = normalizeCouponCode(qs.coupon_code);
  const email = String(qs.email || "").trim().toLowerCase();
  const seatCount = normalizeSeatCount(qs.seat_count);
  const pool = getPool();
  await applyRuntimeSettings(pool);

  const bankName = String(process.env.MANUAL_BANK_NAME || "").trim();
  const accountName = String(process.env.MANUAL_BANK_ACCOUNT_NAME || "").trim();
  const accountNumber = String(process.env.MANUAL_BANK_ACCOUNT_NUMBER || "").trim();
  const note = String(process.env.MANUAL_BANK_NOTE || "").trim();
  let breakdown = manualPaymentPricing(courseSlug, null, seatCount);
  let amountMinor = breakdown.totalMinor;
  let resolvedBatch = null;
  let pricing = null;
  let coupon = null;
  let couponError = "";

  try {
    await ensureLearningTables(pool);
    await ensureCourseBatchesTable(pool);
    await ensureCouponsTables(pool);
    const learningCourse = await findLearningCourseBySlug(pool, courseSlug);
    const enrollmentMode = String(learningCourse && learningCourse.enrollment_mode || "batch").trim().toLowerCase() === "immediate"
      ? "immediate"
      : "batch";
    if (enrollmentMode === "batch") {
      resolvedBatch = await resolveCourseBatch(pool, { courseSlug, batchKey });
    }
    breakdown = manualPaymentPricing(courseSlug, learningCourse, seatCount);
    amountMinor = groupEnrollmentBaseAmountMinor(courseSlug, breakdown.courseMinor, seatCount) + (breakdown.vatMinor * seatCount);
    if (couponCode) {
      const evaluated = await evaluateCouponForOrder(pool, {
        couponCode,
        courseSlug,
        email,
        currency: "NGN",
      baseAmountMinor: amountMinor,
      });
      if (evaluated && evaluated.ok && evaluated.pricing) {
        pricing = evaluated.pricing;
        coupon = evaluated.coupon || null;
        amountMinor = Number(evaluated.pricing.finalAmountMinor || amountMinor);
      } else if (evaluated && !evaluated.ok) {
        couponError = String(evaluated.error || "Coupon could not be applied.");
      }
    }
  } catch (_error) {
    // fall back to configured defaults if batch lookup fails
  }

  return json(200, {
    ok: true,
    courseSlug,
    courseName: getCourseName(courseSlug),
    details: {
      bankName,
      accountName,
      accountNumber,
      note,
      currency: "NGN",
      amountMinor: Math.round(amountMinor),
      amountLabel: formatNaira(amountMinor),
      coursePriceMinor: breakdown.courseMinor,
      coursePriceLabel: formatNaira(breakdown.courseMinor * seatCount),
      vatPercent: breakdown.vatPercent,
      vatMinor: breakdown.vatMinor * seatCount,
      vatLabel: formatNaira(breakdown.vatMinor * seatCount),
      seatCount,
      pricing,
      couponError: couponError || null,
      coupon: coupon
        ? {
            id: Number(coupon.id),
            code: String(coupon.code || couponCode),
          }
        : null,
      batchKey: resolvedBatch ? resolvedBatch.batch_key : null,
      batchLabel: resolvedBatch ? resolvedBatch.batch_label : null,
    },
  });
};
