const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureCourseBatchesTable, updateCourseBatch } = require("./_lib/batch-store");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug } = require("./_lib/course-config");

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

  const courseSlug = normalizeCourseSlug(body.courseSlug, DEFAULT_COURSE_SLUG);
  const batchKey = String(body.batchKey || "").trim();
  if (!batchKey) return json(400, { ok: false, error: "batchKey is required" });

  const pool = getPool();
  try {
    await ensureCourseBatchesTable(pool);
    const updated = await updateCourseBatch(pool, {
      courseSlug,
      batchKey,
      batchLabel: body.batchLabel,
      paystackReferencePrefix: body.paystackReferencePrefix,
      paystackAmountMinor: body.paystackAmountMinor,
      paypalAmountMinor: body.paypalAmountMinor,
      batchStartAt: body.batchStartAt,
    });
    return json(200, {
      ok: true,
      courseSlug,
      batch: updated
        ? {
            batchKey: updated.batch_key,
            batchLabel: updated.batch_label,
            status: updated.status,
            isActive: Number(updated.is_active || 0) === 1,
            batchStartAt: updated.batch_start_at || null,
            paystackReferencePrefix: updated.paystack_reference_prefix,
            paystackAmountMinor: Number(updated.paystack_amount_minor || 0),
            paypalAmountMinor: Number(updated.paypal_amount_minor || 0),
          }
        : null,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not update batch" });
  }
};
