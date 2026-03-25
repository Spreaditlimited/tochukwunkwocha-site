const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { siteBaseUrl, paystackInitialize, paystackPublicKey } = require("./_lib/payments");
const {
  ensureLeadpageTables,
  findLeadpageJobByUuid,
  markLeadpagePaymentInitiated,
} = require("./_lib/leadpage-jobs");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function buildReference(jobUuid) {
  const compact = clean(jobUuid, 72).replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
  const nonce = crypto.randomBytes(3).toString("hex");
  return `LPG_${compact}_${nonce}`.slice(0, 80);
}

function leadpagePriceMinor() {
  const amount = Number(process.env.LEADPAGE_PRICE_NGN_MINOR || 100000);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 100000;
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
    const amountMinor = leadpagePriceMinor();
    const payment = await paystackInitialize({
      email: String(job.email || "").trim(),
      amountMinor,
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
      paymentAmountMinor: amountMinor,
    });

    return json(200, {
      ok: true,
      jobUuid,
      amountMinor,
      currency: "NGN",
      checkoutUrl: payment.checkoutUrl,
      accessCode: payment.accessCode || null,
      publicKey: paystackPublicKey(),
      reference: payment.providerReference || reference,
      email: String(job.email || "").trim(),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not initialize payment" });
  }
};
