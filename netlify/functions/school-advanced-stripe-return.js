const { getPool } = require("./_lib/db");
const { siteBaseUrl, stripeRetrieveCheckoutSession } = require("./_lib/payments");
const { ensureSchoolTables, markSchoolOrderPaidBy } = require("./_lib/schools");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  const qs = event.queryStringParameters || {};
  const sessionId = String(qs.session_id || "").trim();
  if (!sessionId) {
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}/schools/dashboard/?advanced_payment=failed` },
      body: "",
    };
  }

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    const session = await stripeRetrieveCheckoutSession(sessionId);
    if (String(session && session.payment_status || "").toLowerCase() !== "paid") {
      return {
        statusCode: 302,
        headers: { Location: `${siteBaseUrl()}/schools/dashboard/?advanced_payment=failed` },
        body: "",
      };
    }

    const metadata = session.metadata || {};
    const result = await markSchoolOrderPaidBy(pool, {
      provider: "stripe",
      providerReference: session.id ? String(session.id) : "",
      providerOrderId: session.payment_intent ? String(session.payment_intent) : "",
      orderUuid: metadata.school_order_uuid ? String(metadata.school_order_uuid) : "",
    });
    if (!result.ok) throw new Error(result.error || "Could not mark advanced order paid");

    console.info("school_advanced_purchase_confirmed", {
      provider: "stripe",
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
