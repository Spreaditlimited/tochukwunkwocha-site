const { getPool } = require("./_lib/db");
const { siteBaseUrl, paystackVerifyTransaction } = require("./_lib/payments");
const { ensureSchoolTables, markSchoolOrderPaidBy } = require("./_lib/schools");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  const qs = event.queryStringParameters || {};
  const reference = String(qs.reference || qs.trxref || "").trim();
  if (!reference) {
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}/schools/dashboard/?advanced_payment=failed` },
      body: "",
    };
  }

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    const tx = await paystackVerifyTransaction(reference);
    if (String(tx && tx.status || "").toLowerCase() !== "success") {
      return {
        statusCode: 302,
        headers: { Location: `${siteBaseUrl()}/schools/dashboard/?advanced_payment=failed` },
        body: "",
      };
    }

    const orderUuid = String(tx && tx.metadata && tx.metadata.school_order_uuid || "").trim();
    const result = await markSchoolOrderPaidBy(pool, {
      provider: "paystack",
      providerReference: reference,
      providerOrderId: tx && tx.id ? String(tx.id) : "",
      orderUuid: orderUuid || "",
    });
    if (!result.ok) throw new Error(result.error || "Could not mark advanced order paid");

    console.info("school_advanced_purchase_confirmed", {
      school_id: Number(result.schoolId || 0),
      order_uuid: String(result.orderUuid || ""),
      seat_course_slug: String(result.seatCourseSlug || ""),
      order_kind: String(result.orderKind || ""),
    });

    return {
      statusCode: 302,
      headers: {
        Location: `${siteBaseUrl()}/schools/dashboard/?advanced_payment=success`,
      },
      body: "",
    };
  } catch (_error) {
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}/schools/dashboard/?advanced_payment=failed` },
      body: "",
    };
  }
};
