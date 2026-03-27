const { json, badMethod } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  STATUS_APPROVED,
  STATUS_REJECTED,
  ensureManualPaymentsTable,
  findManualPaymentByUuid,
  markMainSynced,
  reviewManualPayment,
} = require("./_lib/manual-payments");
const { syncBrevoSubscriber } = require("./_lib/brevo");
const { sendMetaPurchase } = require("./_lib/meta");
const { resolveCourseBatch } = require("./_lib/batch-store");

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

  const paymentUuid = String(body.paymentUuid || "").trim();
  const action = String(body.action || "").trim().toLowerCase();
  const reviewNote = String(body.reviewNote || "").trim();

  if (!paymentUuid) return json(400, { ok: false, error: "Missing paymentUuid" });
  if (action !== "approve" && action !== "reject") return json(400, { ok: false, error: "Invalid action" });

  const nextStatus = action === "approve" ? STATUS_APPROVED : STATUS_REJECTED;

  const pool = getPool();

  try {
    await ensureManualPaymentsTable(pool);

    const payment = await findManualPaymentByUuid(pool, paymentUuid);
    if (!payment) return json(404, { ok: false, error: "Manual payment not found" });

    await reviewManualPayment(pool, {
      paymentUuid,
      nextStatus,
      reviewedBy: "admin",
      reviewNote,
    });

    let flodeskSyncedMain = !!payment.flodesk_main_synced;

    if (nextStatus === STATUS_APPROVED && !flodeskSyncedMain) {
      const batch = await resolveCourseBatch(pool, { courseSlug: payment.course_slug, batchKey: payment.batch_key });
      const listId = batch && batch.brevo_list_id ? batch.brevo_list_id : "";
      const synced = await syncBrevoSubscriber({
        fullName: payment.first_name,
        email: payment.email,
        listId,
      });
      if (synced.ok) {
        await markMainSynced(pool, paymentUuid);
        flodeskSyncedMain = true;
      }
    }

    if (nextStatus === STATUS_APPROVED && !Number(payment.meta_purchase_sent || 0)) {
      try {
        const sent = await sendMetaPurchase({
          eventId: `ptp_${payment.payment_uuid}`,
          email: payment.email,
          value: Number(payment.amount_minor || 0) / 100,
          currency: payment.currency || "NGN",
          contentName: payment.course_slug || "Course",
          contentIds: [payment.course_slug || "course"],
        });
        if (sent && sent.ok) {
          await pool.query(
            `UPDATE course_manual_payments
             SET meta_purchase_sent = 1,
                 meta_purchase_sent_at = ?
             WHERE payment_uuid = ?`,
            [nowSql(), paymentUuid]
          );
        }
      } catch (_error) {}
    }

    return json(200, {
      ok: true,
      paymentUuid,
      status: nextStatus,
      flodeskMainSynced: !!flodeskSyncedMain,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not review manual payment" });
  }
};
