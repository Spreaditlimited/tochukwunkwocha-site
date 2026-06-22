const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { evaluateCouponForOrder, normalizeCouponCode, ensureCouponsTables } = require("./_lib/coupons");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/student-auth");
const { ensureLearningTables, findLearningCourseBySlug } = require("./_lib/learning");
const { resolveInstallmentPlanPricing } = require("./_lib/installment-pricing");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const courseSlug = String(body.courseSlug || "prompt-to-profit").trim().slice(0, 120) || "prompt-to-profit";
  const couponCode = normalizeCouponCode(body.couponCode);
  const country = String(body.country || "Nigeria").trim().slice(0, 120) || "Nigeria";
  if (!couponCode) return json(400, { ok: false, error: "Enter a valid coupon code." });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    await ensureCourseBatchesTable(pool);
    await ensureCouponsTables(pool);
    await ensureLearningTables(pool);
    const learningCourse = await findLearningCourseBySlug(pool, courseSlug);
    if (!learningCourse) return json(400, { ok: false, error: "Unknown course. Please choose a valid course." });
    const batch = await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey });
    if (!batch) return json(404, { ok: false, error: "Batch not found" });

    const planPricing = resolveInstallmentPlanPricing({ country, courseSlug, batch, learningCourse });

    const evaluated = await evaluateCouponForOrder(pool, {
      couponCode,
      courseSlug,
      email: session.account.email,
      currency: planPricing.currency,
      baseAmountMinor: Number(planPricing.targetAmountMinor || 0),
    });
    if (!evaluated.ok) return json(400, { ok: false, error: evaluated.error || "Invalid coupon code." });

    return json(200, {
      ok: true,
      coupon: evaluated.coupon,
      pricing: evaluated.pricing,
      meta: {
        surchargePercent: planPricing.surchargePercent,
        provider: planPricing.provider,
        currency: planPricing.currency,
        batchKey: batch.batch_key,
        batchLabel: batch.batch_label,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not preview coupon" });
  }
};
