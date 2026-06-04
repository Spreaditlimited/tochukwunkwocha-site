const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { paystackInitialize, siteBaseUrl } = require("./_lib/payments");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { buildDiscoveryPricing } = require("./_lib/build-discovery-pricing");
const {
  ensureBuildScorecardTablesTochukwu,
  findBuildScorecardLeadByUuid,
  createBuildDiscoveryPayment,
  isBuildDiscoveryEligible,
} = require("./_lib/build-scorecards-tochukwu");

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max || 400);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (_error) { return json(400, { ok: false, error: "Invalid JSON body" }); }

  const leadUuid = clean(body.leadUuid, 64);
  if (!leadUuid) return json(400, { ok: false, error: "leadUuid is required" });

  try {
    const pool = getPool();
    try { await applyRuntimeSettings(pool); } catch (_error) {}
    await ensureBuildScorecardTablesTochukwu(pool);
    const lead = await findBuildScorecardLeadByUuid(pool, leadUuid);
    if (!lead) return json(404, { ok: false, error: "Lead not found" });
    if (!isBuildDiscoveryEligible(lead)) {
      return json(403, { ok: false, error: "Payment is only available for approved applications" });
    }

    const pricing = buildDiscoveryPricing();
    const reference = `BLD_${leadUuid.replace(/[^a-z0-9]/gi, "").slice(0, 34).toUpperCase()}_${Date.now().toString().slice(-6)}`;
    const callbackUrl = `${siteBaseUrl()}/.netlify/functions/build-discovery-paystack-return`;
    const payment = await paystackInitialize({
      email: clean(lead.workEmail, 220).toLowerCase(),
      amountMinor: Number(pricing.payableMinor || 0),
      reference,
      callbackUrl,
      metadata: {
        build_lead_uuid: leadUuid,
        lead_source_type: "build",
        full_name: clean(lead.fullName, 180),
        business_name: clean(lead.businessName, 220),
      },
    });

    await createBuildDiscoveryPayment(pool, {
      paymentUuid: `buildpay_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
      leadUuid,
      workEmail: clean(lead.workEmail, 220).toLowerCase(),
      fullName: clean(lead.fullName, 180),
      amountMinor: Number(pricing.payableMinor || 0),
      paymentReference: payment.providerReference || reference,
      checkoutUrl: payment.checkoutUrl,
    });

    return json(200, {
      ok: true,
      checkoutUrl: payment.checkoutUrl,
      reference: payment.providerReference || reference,
      pricing,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not initialize payment" });
  }
};
