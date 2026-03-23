const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureCourseBatchesTable, getActiveCourseBatch } = require("./_lib/batch-store");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const courseSlug = String((event.queryStringParameters && event.queryStringParameters.course_slug) || "prompt-to-profit")
    .trim()
    .slice(0, 120) || "prompt-to-profit";

  const pool = getPool();
  try {
    await ensureCourseBatchesTable(pool);
    const active = await getActiveCourseBatch(pool, courseSlug);
    return json(200, {
      ok: true,
      courseSlug,
      activeBatch: active
        ? {
            batchKey: active.batch_key,
            batchLabel: active.batch_label,
            status: active.status,
            paystackReferencePrefix: active.paystack_reference_prefix,
            paystackAmountMinor: Number(active.paystack_amount_minor || 0),
          }
        : null,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load active batch" });
  }
};
