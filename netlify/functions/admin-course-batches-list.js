const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureCourseBatchesTable, listCourseBatches } = require("./_lib/batch-store");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const courseSlug = String((event.queryStringParameters && event.queryStringParameters.course_slug) || "prompt-to-profit")
    .trim()
    .slice(0, 120) || "prompt-to-profit";

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
        batchStartAt: item.batch_start_at || null,
        paystackReferencePrefix: item.paystack_reference_prefix,
        paystackAmountMinor: Number(item.paystack_amount_minor || 0),
      })),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load batches" });
  }
};
