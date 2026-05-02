const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug, getCourseDefaultAmountMinor, getCourseDefaultPaypalMinor } = require("./_lib/course-config");
const { ensureLearningTables, findLearningCourseBySlug } = require("./_lib/learning");
function normalizePaymentMethods(input) {
  const raw = String(input || "");
  const parts = raw.split(",").map(function (v) { return String(v || "").trim().toLowerCase(); }).filter(Boolean);
  const out = [];
  if (parts.indexOf("paystack") !== -1) out.push("paystack");
  if (parts.indexOf("paypal") !== -1) out.push("paypal");
  if (parts.indexOf("manual_transfer") !== -1) out.push("manual_transfer");
  if (!out.length) return ["paystack", "paypal", "manual_transfer"];
  return out;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const courseSlug = normalizeCourseSlug(
    event.queryStringParameters && event.queryStringParameters.course_slug,
    DEFAULT_COURSE_SLUG
  );
  const requestedBatchKey = event.queryStringParameters && event.queryStringParameters.batch_key;

  const pool = getPool();
  try {
    await ensureLearningTables(pool);
    await ensureCourseBatchesTable(pool);
    const learningCourse = await findLearningCourseBySlug(pool, courseSlug);
    const enrollmentMode = String(learningCourse && learningCourse.enrollment_mode || "batch").trim().toLowerCase() === "immediate"
      ? "immediate"
      : "batch";
    const enabledPaymentMethods = normalizePaymentMethods(learningCourse && learningCourse.payment_methods);

    if (enrollmentMode === "immediate") {
      const courseNgnMinor = Number(learningCourse && learningCourse.price_ngn_minor);
      const courseGbpMinor = Number(learningCourse && learningCourse.price_gbp_minor);
      const paystackAmountMinor = Number.isFinite(courseNgnMinor) && courseNgnMinor > 0
        ? Math.round(courseNgnMinor)
        : getCourseDefaultAmountMinor(courseSlug);
      const paypalAmountMinor = Number.isFinite(courseGbpMinor) && courseGbpMinor > 0
        ? Math.round(courseGbpMinor)
        : getCourseDefaultPaypalMinor(courseSlug);
      return json(200, {
        ok: true,
        courseSlug,
        enabledPaymentMethods,
        activeBatch: {
          batchKey: null,
          batchLabel: "Immediate Access",
          status: "active",
          batchStartAt: null,
          paystackReferencePrefix: null,
          paystackAmountMinor: Number(paystackAmountMinor || 0),
          paypalAmountMinor: Number(paypalAmountMinor || 0),
        },
      });
    }

    const active = await resolveCourseBatch(pool, { courseSlug, batchKey: requestedBatchKey });
    return json(200, {
      ok: true,
      courseSlug,
      enabledPaymentMethods,
      activeBatch: active
        ? {
            batchKey: active.batch_key,
            batchLabel: active.batch_label,
            status: active.status,
            batchStartAt: active.batch_start_at || null,
            paystackReferencePrefix: active.paystack_reference_prefix,
            paystackAmountMinor: Number(active.paystack_amount_minor || 0),
            paypalAmountMinor: Number(active.paypal_amount_minor || 0),
          }
        : null,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load active batch" });
  }
};
