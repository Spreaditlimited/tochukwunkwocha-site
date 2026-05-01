const { json, badMethod } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureManualPaymentsTable, findManualPaymentByUuid } = require("./_lib/manual-payments");
const { sendMetaPurchase, requestContextToMetaData } = require("./_lib/meta");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 1000);
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

  const paymentUuid = clean(body.paymentUuid, 80);
  const fbp = clean(body.fbp, 300);
  const fbc = clean(body.fbc, 300);
  const eventSourceUrl = clean(body.eventSourceUrl, 1000);
  if (!paymentUuid) return json(400, { ok: false, error: "Missing paymentUuid" });

  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  try {
    await ensureManualPaymentsTable(pool);
    const payment = await findManualPaymentByUuid(pool, paymentUuid);
    if (!payment) return json(404, { ok: false, error: "Manual payment not found" });
    if (String(payment.status || "").toLowerCase() !== "approved") {
      return json(400, { ok: false, error: "Only approved manual payments can send Meta purchase events." });
    }

    const reqMeta = requestContextToMetaData({ headers: event.headers || {} });
    const eventId = `ptp_manual_${payment.payment_uuid}_${Date.now()}`;
    const sent = await sendMetaPurchase({
      eventId,
      email: payment.email,
      value: Number(payment.amount_minor || 0) / 100,
      currency: payment.currency || "NGN",
      contentName: payment.course_slug || "Course",
      contentIds: [payment.course_slug || "course"],
      fbp: fbp || reqMeta.fbp || "",
      fbc: fbc || reqMeta.fbc || "",
      clientIpAddress: reqMeta.clientIpAddress || "",
      clientUserAgent: reqMeta.clientUserAgent || "",
      eventSourceUrl: eventSourceUrl || "",
    });
    if (!sent || !sent.ok) {
      return json(500, {
        ok: false,
        error: (sent && sent.error) || "Meta CAPI request failed",
      });
    }

    await pool.query(
      `UPDATE course_manual_payments
       SET meta_purchase_sent = 1,
           meta_purchase_sent_at = ?,
           updated_at = ?
       WHERE payment_uuid = ?
       LIMIT 1`,
      [nowSql(), nowSql(), paymentUuid]
    );

    return json(200, {
      ok: true,
      paymentUuid,
      eventId,
      metaPurchaseSent: true,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not send Meta purchase event" });
  }
};
