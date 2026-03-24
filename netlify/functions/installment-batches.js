const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureCourseBatchesTable, listCourseBatches } = require("./_lib/batch-store");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug } = require("./_lib/course-config");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const courseSlug = normalizeCourseSlug(
    event.queryStringParameters && event.queryStringParameters.course_slug,
    DEFAULT_COURSE_SLUG
  );

  const pool = getPool();
  try {
    await ensureCourseBatchesTable(pool);
    const batches = await listCourseBatches(pool, courseSlug);
    return json(200, {
      ok: true,
      courseSlug,
      batches: (batches || []).map((item) => ({
        batchKey: item.batch_key,
        batchLabel: item.batch_label,
        status: item.status,
        isActive: Number(item.is_active || 0) === 1,
        targetAmountMinor: Number(item.paystack_amount_minor || 0),
        currency: "NGN",
      })),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load batches" });
  }
};
