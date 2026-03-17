const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  STATUS_APPROVED,
  STATUS_REJECTED,
  ensureManualPaymentsTable,
  findManualPaymentByUuid,
  markMainSynced,
  reviewManualPayment,
} = require("./_lib/manual-payments");
const { syncFlodeskSubscriber } = require("./_lib/flodesk");

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
      const synced = await syncFlodeskSubscriber({
        firstName: payment.first_name,
        email: payment.email,
      });
      if (synced.ok) {
        await markMainSynced(pool, paymentUuid);
        flodeskSyncedMain = true;
      }
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
