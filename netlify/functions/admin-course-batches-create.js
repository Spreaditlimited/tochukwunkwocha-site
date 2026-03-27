const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureCourseBatchesTable, createCourseBatch } = require("./_lib/batch-store");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug } = require("./_lib/course-config");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  try {
    await applyRuntimeSettings(getPool());
  } catch (_error) {}

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
    const courseSlug = normalizeCourseSlug(body.courseSlug, DEFAULT_COURSE_SLUG);
    await ensureCourseBatchesTable(pool);
    const created = await createCourseBatch(pool, {
      courseSlug,
      batchLabel: body.batchLabel,
      batchKey: body.batchKey,
      status: body.status || "closed",
      batchStartAt: body.batchStartAt,
      paystackReferencePrefix: body.paystackReferencePrefix,
      paystackAmountMinor: body.paystackAmountMinor,
      paypalAmountMinor: body.paypalAmountMinor,
      brevoListId: body.brevoListId,
    });
    return json(200, {
      ok: true,
      courseSlug,
      batch: {
        batchKey: created.batch_key,
        batchLabel: created.batch_label,
        status: created.status,
        isActive: Number(created.is_active || 0) === 1,
        batchStartAt: created.batch_start_at || null,
        paystackReferencePrefix: created.paystack_reference_prefix,
        paystackAmountMinor: Number(created.paystack_amount_minor || 0),
        paypalAmountMinor: Number(created.paypal_amount_minor || 0),
        brevoListId: created.brevo_list_id || null,
      },
    });
  } catch (error) {
    const msg = String(error && error.message ? error.message : "Could not create batch");
    const isConflict = /duplicate|unique|exists/i.test(msg);
    return json(isConflict ? 409 : 500, { ok: false, error: msg });
  }
};
