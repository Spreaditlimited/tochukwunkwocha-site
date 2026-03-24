const { getPool } = require("./_lib/db");
const { siteBaseUrl, paystackVerifyTransaction } = require("./_lib/payments");
const { markOrderPaidBy } = require("./_lib/orders");
const { getCourseLandingPath, normalizeCourseSlug } = require("./_lib/course-config");

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
    const fallbackPath = getCourseLandingPath("prompt-to-profit");
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}${fallbackPath}?payment=failed` },
      body: "",
    };
  }

  try {
    const tx = await paystackVerifyTransaction(reference);
    const status = String(tx.status || "").toLowerCase();

    if (status !== "success") {
      const txCourseSlug = normalizeCourseSlug(tx && tx.metadata && tx.metadata.course_slug, "prompt-to-profit");
      return {
        statusCode: 302,
        headers: { Location: `${siteBaseUrl()}${getCourseLandingPath(txCourseSlug)}?payment=failed` },
        body: "",
      };
    }

    const txCourseSlug = normalizeCourseSlug(tx && tx.metadata && tx.metadata.course_slug, "prompt-to-profit");
    const orderUuid = tx && tx.metadata && tx.metadata.order_uuid ? String(tx.metadata.order_uuid) : null;

    const pool = getPool();
    const result = await markOrderPaidBy({
      pool,
      provider: "paystack",
      providerReference: reference,
      providerOrderId: tx.id ? String(tx.id) : null,
      orderUuid,
    });

    return {
      statusCode: 302,
      headers: {
        Location: `${siteBaseUrl()}${getCourseLandingPath(result.courseSlug || txCourseSlug)}?payment=success${
          result.orderUuid ? `&order_uuid=${encodeURIComponent(result.orderUuid)}` : ""
        }`,
      },
      body: "",
    };
  } catch (_error) {
    const fallbackPath = getCourseLandingPath("prompt-to-profit");
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}${fallbackPath}?payment=failed` },
      body: "",
    };
  }
};
