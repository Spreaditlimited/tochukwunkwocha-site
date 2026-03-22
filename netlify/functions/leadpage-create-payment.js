const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { siteBaseUrl, paystackInitialize } = require("./_lib/payments");
const {
  ensureLeadpageTables,
  findLeadpageJobByUuid,
  markLeadpagePaymentInitiated,
} = require("./_lib/leadpage-jobs");

const LEADPAGE_PRICE_NGN_MINOR = Number(process.env.LEADPAGE_PRICE_NGN_MINOR || 100000);

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function buildReference(jobUuid) {
  const compact = clean(jobUuid, 72).replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
  const nonce = crypto.randomBytes(3).toString("hex");
  return `LPG_${compact}_${nonce}`.slice(0, 80);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const jobUuid = clean(body.jobUuid, 72);
  if (!jobUuid) return json(400, { ok: false, error: "Missing jobUuid" });

  const pool = getPool();

  try {
    await ensureLeadpageTables(pool);
    const job = await findLeadpageJobByUuid(pool, jobUuid);
    if (!job) return json(404, { ok: false, error: "Job not found" });

    if (String(job.payment_status || "").toLowerCase() === "paid") {
      return json(200, {
        ok: true,
        alreadyPaid: true,
        message: "Payment has already been confirmed for this job.",
      });
    }

    const reference = buildReference(jobUuid);
    const payment = await paystackInitialize({
      email: String(job.email || "").trim(),
      amountMinor: LEADPAGE_PRICE_NGN_MINOR,
      reference,
      callbackUrl: `${siteBaseUrl()}/.netlify/functions/leadpage-paystack-return`,
      metadata: {
        flow: "leadpage_service",
        job_uuid: jobUuid,
        business_name: String(job.business_name || "").trim().slice(0, 120),
      },
    });

    await markLeadpagePaymentInitiated(pool, {
      jobUuid,
      paymentProvider: "paystack",
      paymentReference: payment.providerReference || reference,
      paymentCurrency: "NGN",
      paymentAmountMinor: LEADPAGE_PRICE_NGN_MINOR,
    });

    return json(200, {
      ok: true,
      jobUuid,
      amountMinor: LEADPAGE_PRICE_NGN_MINOR,
      currency: "NGN",
      checkoutUrl: payment.checkoutUrl,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not initialize payment" });
  }
};
