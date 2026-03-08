const { getPool } = require("./_lib/db");
const { siteBaseUrl, paystackVerifyTransaction } = require("./_lib/payments");
const { markOrderPaidBy } = require("./_lib/orders");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: "Method not allowed",
    };
  }

  const qs = event.queryStringParameters || {};
  const reference = String(qs.reference || qs.trxref || "").trim();

  if (!reference) {
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}/courses/prompt-to-profit?payment=failed` },
      body: "",
    };
  }

  try {
    const tx = await paystackVerifyTransaction(reference);
    const status = String(tx.status || "").toLowerCase();

    if (status !== "success") {
      return {
        statusCode: 302,
        headers: { Location: `${siteBaseUrl()}/courses/prompt-to-profit?payment=failed` },
        body: "",
      };
    }

    const orderUuid = tx.metadata && tx.metadata.order_uuid ? String(tx.metadata.order_uuid) : null;

    const pool = getPool();
    await markOrderPaidBy({
      pool,
      provider: "paystack",
      providerReference: reference,
      providerOrderId: tx.id ? String(tx.id) : null,
      orderUuid,
    });

    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}/courses/prompt-to-profit?payment=success` },
      body: "",
    };
  } catch (_error) {
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}/courses/prompt-to-profit?payment=failed` },
      body: "",
    };
  }
};
