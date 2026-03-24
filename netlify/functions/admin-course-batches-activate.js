const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureCourseBatchesTable, activateCourseBatch } = require("./_lib/batch-store");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const batchKey = String(body.batchKey || "").trim();
  if (!batchKey) return json(400, { ok: false, error: "batchKey is required" });

  const pool = getPool();
  try {
    await ensureCourseBatchesTable(pool);
    const active = await activateCourseBatch(pool, {
      courseSlug: "prompt-to-profit",
      batchKey,
      batchStartAt: body.batchStartAt,
    });
    return json(200, {
      ok: true,
      activeBatch: active
        ? {
            batchKey: active.batch_key,
            batchLabel: active.batch_label,
            status: active.status,
            isActive: Number(active.is_active || 0) === 1,
            batchStartAt: active.batch_start_at || null,
            paystackReferencePrefix: active.paystack_reference_prefix,
            paystackAmountMinor: Number(active.paystack_amount_minor || 0),
          }
        : null,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not activate batch" });
  }
};
