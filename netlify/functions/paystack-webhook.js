const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { verifyPaystackSignature } = require("./_lib/payments");
const { markOrderPaidBy } = require("./_lib/orders");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const signature = event.headers["x-paystack-signature"] || event.headers["X-Paystack-Signature"];
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";

  try {
    if (!verifyPaystackSignature(rawBody, signature)) {
      return json(401, { ok: false, error: "Invalid signature" });
    }
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Signature check failed" });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  if (body.event !== "charge.success") {
    return json(200, { ok: true, ignored: true });
  }

  const data = body.data || {};
  const reference = String(data.reference || "").trim();
  const orderUuid = data.metadata && String(data.metadata.order_uuid || "").trim();

  const pool = getPool();

  const result = await markOrderPaidBy({
    pool,
    provider: "paystack",
    providerReference: reference || null,
    providerOrderId: data.id ? String(data.id) : null,
    orderUuid: orderUuid || null,
  });

  if (!result.ok) {
    return json(404, { ok: false, error: result.error });
  }

  return json(200, { ok: true });
};
