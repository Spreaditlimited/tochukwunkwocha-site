const { getPool } = require("./_lib/db");
const { siteBaseUrl, paystackVerifyTransaction } = require("./_lib/payments");
const {
  ensureBuildScorecardTablesTochukwu,
  findBuildDiscoveryPaymentByReference,
  markBuildDiscoveryPaymentPaid,
  findBuildScorecardLeadByUuid,
  issueBuildBookingAccess,
} = require("./_lib/build-scorecards-tochukwu");

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max || 400);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const qs = event.queryStringParameters || {};
  const reference = clean(qs.reference || qs.trxref, 120);
  if (!reference) {
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}/build-scorecard/?payment=failed` },
      body: "",
    };
  }

  try {
    const pool = getPool();
    await ensureBuildScorecardTablesTochukwu(pool);

    const tx = await paystackVerifyTransaction(reference);
    if (clean(tx && tx.status, 20).toLowerCase() !== "success") {
      return {
        statusCode: 302,
        headers: { Location: `${siteBaseUrl()}/build-scorecard/?payment=failed` },
        body: "",
      };
    }

    const payment = await findBuildDiscoveryPaymentByReference(pool, reference);
    if (!payment) {
      return {
        statusCode: 302,
        headers: { Location: `${siteBaseUrl()}/build-scorecard/?payment=failed` },
        body: "",
      };
    }

    await markBuildDiscoveryPaymentPaid(pool, {
      paymentReference: reference,
      paymentOrderId: tx && tx.id ? String(tx.id) : "",
    });

    const lead = await findBuildScorecardLeadByUuid(pool, payment.leadUuid);
    if (!lead || Number(lead.score || 0) < 70) {
      return {
        statusCode: 302,
        headers: { Location: `${siteBaseUrl()}/build-scorecard/?payment=failed` },
        body: "",
      };
    }

    const issued = await issueBuildBookingAccess(pool, {
      score: Number(lead.score || 0),
      leadUuid: clean(lead.leadUuid, 64),
      answers: Array.isArray(lead.answers) ? lead.answers : [],
      sourcePath: "/build-scorecard/",
    });

    return {
      statusCode: 302,
      headers: {
        Location: `${siteBaseUrl()}/schools/book-call/?source=build&build_access=${encodeURIComponent(issued.token)}&payment=success`,
      },
      body: "",
    };
  } catch (_error) {
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}/build-scorecard/?payment=failed` },
      body: "",
    };
  }
};
