const { getPool } = require("./_lib/db");
const { siteBaseUrl, paystackVerifyTransaction } = require("./_lib/payments");
const {
  ensureLeadpageTables,
  findLeadpageJobByUuid,
  findLeadpageJobByPaymentReference,
  markLeadpagePaymentPaid,
} = require("./_lib/leadpage-jobs");

function redirect(location) {
  return {
    statusCode: 302,
    headers: { Location: location },
    body: "",
  };
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const qs = event.queryStringParameters || {};
  const reference = clean(qs.reference || qs.trxref, 120);
  if (!reference) {
    return redirect(`${siteBaseUrl()}/services/lead-capture?payment=failed`);
  }

  try {
    const tx = await paystackVerifyTransaction(reference);
    const status = String(tx.status || "").trim().toLowerCase();
    if (status !== "success") {
      return redirect(`${siteBaseUrl()}/services/lead-capture?payment=failed`);
    }

    const metadata = tx.metadata && typeof tx.metadata === "object" ? tx.metadata : {};
    let jobUuid = clean(metadata.job_uuid, 72);

    const pool = getPool();
    await ensureLeadpageTables(pool);

    if (!jobUuid) {
      const byReference = await findLeadpageJobByPaymentReference(pool, reference);
      jobUuid = byReference ? clean(byReference.job_uuid, 72) : "";
    }

    if (!jobUuid) {
      return redirect(`${siteBaseUrl()}/services/lead-capture?payment=failed`);
    }

    await markLeadpagePaymentPaid(pool, {
      jobUuid,
      paymentProvider: "paystack",
      paymentReference: reference,
      paymentOrderId: tx.id ? clean(String(tx.id), 120) : "",
      paymentCurrency: clean(tx.currency, 16) || "NGN",
      paymentAmountMinor: Number(tx.amount || 0),
    });

    const paidJob = await findLeadpageJobByUuid(pool, jobUuid);
    const accessToken = paidJob ? clean(paidJob.client_access_token, 96) : "";
    if (!accessToken) {
      return redirect(
        `${siteBaseUrl()}/services/lead-capture?payment=success&job_uuid=${encodeURIComponent(jobUuid)}`
      );
    }

    return redirect(
      `${siteBaseUrl()}/dashboard/?job_uuid=${encodeURIComponent(jobUuid)}&access=${encodeURIComponent(
        accessToken
      )}&payment=success`
    );
  } catch (_error) {
    return redirect(`${siteBaseUrl()}/services/lead-capture?payment=failed`);
  }
};
