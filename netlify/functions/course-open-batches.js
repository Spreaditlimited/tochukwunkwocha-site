const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureBatchSeatLimitColumn, getBatchCapacity } = require("./_lib/batch-capacity");
const { listCourseBatches } = require("./_lib/batch-store");
const { normalizeCourseSlug, DEFAULT_COURSE_SLUG } = require("./_lib/course-config");
const { ensureLearningTables, findLearningCourseBySlug, normalizePaymentMethods } = require("./_lib/learning");

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
    await ensureBatchSeatLimitColumn(pool);
    await ensureLearningTables(pool);
    const learningCourse = await findLearningCourseBySlug(pool, courseSlug);
    const enabledPaymentMethods = normalizePaymentMethods(learningCourse && learningCourse.payment_methods).split(",");
    const rows = await listCourseBatches(pool, courseSlug);
    const open = (rows || []).filter((item) => String(item.status || "").toLowerCase() === "open");
    const capacities = [];
    for (const row of open) {
      const cap = await getBatchCapacity(pool, { courseSlug, batchKey: row.batch_key });
      if (!cap) continue;
      capacities.push({
        batchKey: row.batch_key,
        batchLabel: row.batch_label,
        batchStartAt: row.batch_start_at || null,
        paystackAmountMinor: Number(row.paystack_amount_minor || 0),
        paypalAmountMinor: Number(row.paypal_amount_minor || 0),
        seatLimit: cap.seatLimit,
        enrolledCount: cap.enrolledCount,
        remainingSeats: cap.remainingSeats,
        isFull: normalizeBooleanFlag(cap.isFull),
      });
    }
    return json(200, { ok: true, courseSlug, enabledPaymentMethods, batches: capacities });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load open batches" });
  }
};
