const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureManualPaymentsTable, createManualPayment, reviewManualPayment, markMainSynced, STATUS_APPROVED } = require("./_lib/manual-payments");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { syncFlodeskSubscriber } = require("./_lib/flodesk");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug, getCourseDefaultAmountMinor } = require("./_lib/course-config");

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return ok ? email : "";
}

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

  const firstName = String(body.firstName || "").trim().slice(0, 160);
  const email = normalizeEmail(body.email);
  const country = String(body.country || "").trim().slice(0, 120);
  const adminNote = String(body.adminNote || "").trim().slice(0, 500);
  const proofUrl = String(body.proofUrl || "").trim();
  const proofPublicId = String(body.proofPublicId || "").trim().slice(0, 255);
  const courseSlug = normalizeCourseSlug(body.courseSlug, DEFAULT_COURSE_SLUG);

  if (!firstName || !email) {
    return json(400, { ok: false, error: "Full Name and valid email are required" });
  }

  const pool = getPool();

  try {
    await ensureManualPaymentsTable(pool);
    await ensureCourseOrdersBatchColumns(pool);
    await ensureCourseBatchesTable(pool);
    const batch = await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey });
    if (!batch) return json(500, { ok: false, error: "No active batch configured" });
    const amountMinor = Number(batch.paystack_amount_minor || getCourseDefaultAmountMinor(courseSlug));
    const currency = "NGN";

    const [existingManual] = await pool.query(
      `SELECT id
       FROM course_manual_payments
       WHERE course_slug = ?
         AND batch_key = ?
         AND email = ?
         AND status = 'approved'
       ORDER BY id DESC
       LIMIT 1`,
      [courseSlug, batch.batch_key, email]
    );
    if (existingManual && existingManual.length) {
      return json(409, {
        ok: false,
        error: `This email already has an approved payment in ${batch.batch_label}.`,
      });
    }

    const [existingOrder] = await pool.query(
      `SELECT id
       FROM course_orders
       WHERE course_slug = ?
         AND batch_key = ?
         AND email = ?
         AND status = 'paid'
       ORDER BY id DESC
       LIMIT 1`,
      [courseSlug, batch.batch_key, email]
    );
    if (existingOrder && existingOrder.length) {
      return json(409, {
        ok: false,
        error: `This email already has a paid order in ${batch.batch_label}.`,
      });
    }

    const paymentUuid = await createManualPayment(pool, {
      courseSlug,
      batchKey: batch.batch_key,
      batchLabel: batch.batch_label,
      firstName,
      email,
      country,
      currency,
      amountMinor,
      transferReference: "",
      proofUrl,
      proofPublicId,
    });

    const reviewNote = adminNote || `Added by admin as external bank payment (${batch.batch_label})`;
    await reviewManualPayment(pool, {
      paymentUuid,
      nextStatus: STATUS_APPROVED,
      reviewedBy: "admin",
      reviewNote,
    });

    const synced = await syncFlodeskSubscriber({ firstName, email });
    if (synced.ok) {
      await markMainSynced(pool, paymentUuid);
    }

    return json(200, {
      ok: true,
      paymentUuid,
      batchKey: batch.batch_key,
      batchLabel: batch.batch_label,
      flodeskMainSynced: !!synced.ok,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not add student" });
  }
};
