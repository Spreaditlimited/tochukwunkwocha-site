const { getPool } = require("./_lib/db");
const { siteBaseUrl, paypalCaptureOrder } = require("./_lib/payments");
const { markOrderPaidBy } = require("./_lib/orders");
const { getCourseLandingPath } = require("./_lib/course-config");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: "Method not allowed",
    };
  }

  const orderId = event.queryStringParameters && event.queryStringParameters.token;

  if (!orderId) {
    const fallbackPath = getCourseLandingPath("prompt-to-profit");
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}${fallbackPath}?payment=failed` },
      body: "",
    };
  }

  try {
    await paypalCaptureOrder(orderId);

    const pool = getPool();
    const result = await markOrderPaidBy({
      pool,
      provider: "paypal",
      providerOrderId: String(orderId),
    });

    return {
      statusCode: 302,
      headers: {
        Location: `${siteBaseUrl()}${getCourseLandingPath(result.courseSlug)}?payment=success${
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
