const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { paypalVerifyWebhook } = require("./_lib/payments");
const { markOrderPaidBy } = require("./_lib/orders");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const pool = getPool();
  await applyRuntimeSettings(pool);

  let body;
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "{}";
    body = JSON.parse(rawBody);
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const verified = await paypalVerifyWebhook({
    body,
    headers: event.headers || {},
  });

  if (!verified) {
    return json(401, { ok: false, error: "Invalid PayPal signature" });
  }

  const eventType = String(body.event_type || "");
  if (eventType !== "PAYMENT.CAPTURE.COMPLETED") {
    return json(200, { ok: true, ignored: true });
  }

  const related = body.resource && body.resource.supplementary_data && body.resource.supplementary_data.related_ids;
  const orderId = related && related.order_id ? String(related.order_id) : "";

  const result = await markOrderPaidBy({
    pool,
    provider: "paypal",
    providerOrderId: orderId || null,
  });

  if (!result.ok) {
    return json(404, { ok: false, error: result.error });
  }

  return json(200, { ok: true });
};
