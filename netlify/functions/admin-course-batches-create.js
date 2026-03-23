const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureCourseBatchesTable, createCourseBatch } = require("./_lib/batch-store");

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

  const pool = getPool();
  try {
    await ensureCourseBatchesTable(pool);
    const created = await createCourseBatch(pool, {
      courseSlug: "prompt-to-profit",
      batchLabel: body.batchLabel,
      batchKey: body.batchKey,
      status: body.status || "closed",
      paystackReferencePrefix: body.paystackReferencePrefix,
      paystackAmountMinor: body.paystackAmountMinor,
    });
    return json(200, {
      ok: true,
      batch: {
        batchKey: created.batch_key,
        batchLabel: created.batch_label,
        status: created.status,
        isActive: Number(created.is_active || 0) === 1,
        paystackReferencePrefix: created.paystack_reference_prefix,
        paystackAmountMinor: Number(created.paystack_amount_minor || 0),
      },
    });
  } catch (error) {
    const msg = String(error && error.message ? error.message : "Could not create batch");
    const isConflict = /duplicate|unique|exists/i.test(msg);
    return json(isConflict ? 409 : 500, { ok: false, error: msg });
  }
};
