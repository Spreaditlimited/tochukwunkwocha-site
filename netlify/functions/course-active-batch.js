const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug } = require("./_lib/course-config");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const courseSlug = normalizeCourseSlug(
    event.queryStringParameters && event.queryStringParameters.course_slug,
    DEFAULT_COURSE_SLUG
  );
  const requestedBatchKey = event.queryStringParameters && event.queryStringParameters.batch_key;

  const pool = getPool();
  try {
    await ensureCourseBatchesTable(pool);
    const active = await resolveCourseBatch(pool, { courseSlug, batchKey: requestedBatchKey });
    return json(200, {
      ok: true,
      courseSlug,
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
