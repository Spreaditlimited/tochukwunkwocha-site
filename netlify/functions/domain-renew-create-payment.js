const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { getRegistrationPrice } = require("./_lib/domain-client");
const { paystackInitialize, paystackPublicKey, siteBaseUrl } = require("./_lib/payments");
const {
  ensureDomainTables,
  normalizeDomain,
  findDomainForAccount,
  createDomainRenewalCheckout,
} = require("./_lib/domains");
const { buildDomainCheckoutQuote } = require("./_lib/domain-pricing");

function registrarPricingError(error) {
  const message = String((error && error.message) || "").toLowerCase();
  if (!message) return false;
  return (
    message.includes("reseller-price") ||
    message.includes("pricing") ||
    message.includes("selling/display currency") ||
    message.includes("selling currency") ||
    message.includes("currency is") ||
    message.includes("registration amount") ||
    message.includes("product key")
  );
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const domainName = normalizeDomain(body.domainName || body.domain_name);
  const years = Math.max(1, Math.min(Number(body.years) || 1, 10));
  if (!domainName) return json(400, { ok: false, error: "domainName is required." });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureDomainTables(pool);

    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const accountId = Number(session.account.id);
    const email = String(session.account.email || "").trim().toLowerCase();
    const domain = await findDomainForAccount(pool, { accountId, domainName });
    if (!domain) return json(404, { ok: false, error: "Domain not found in your account." });

    const status = String(domain.status || "").toLowerCase();
    if (status !== "registered") {
      return json(400, { ok: false, error: "Only registered domains can be renewed." });
    }

    let pricing;
    try {
      pricing = await getRegistrationPrice({ domainName, years });
    } catch (error) {
      if (registrarPricingError(error)) {
        const reason = String((error && error.message) || "").trim();
        return json(503, {
          ok: false,
          error: reason
            ? `We could not fetch live registrar pricing to start renewal payment. ${reason}`
            : "We could not fetch live registrar pricing to start renewal payment. Please try again shortly.",
        });
      }
      throw error;
    }

    const quote = buildDomainCheckoutQuote({
      basePricing: pricing,
      years,
      selectedServices: [],
      servicePrices: {},
    });

    const reference = `DRN_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const autoRenewEnabled = Number(domain.auto_renew_enabled || 0) === 1;

    const renewalUuid = await createDomainRenewalCheckout(pool, {
      accountId,
      email,
      domainName,
      years,
      paymentProvider: "paystack",
      paymentReference: reference,
      paymentCurrency: quote.currency,
      paymentAmountMinor: quote.totalAmountMinor,
      autoRenewEnabled,
    });

    const payment = await paystackInitialize({
      email,
      amountMinor: quote.totalAmountMinor,
      reference,
      callbackUrl: `${siteBaseUrl()}/.netlify/functions/domain-renew-paystack-return`,
      metadata: {
        domain_renewal_uuid: renewalUuid,
        domain_name: domainName,
        years,
        email,
      },
    });

    return json(200, {
      ok: true,
      renewalUuid,
      provider: "paystack",
      paymentReference: reference,
      amountMinor: quote.totalAmountMinor,
      currency: quote.currency,
      quote,
      checkoutUrl: payment.checkoutUrl || "",
      accessCode: payment.accessCode || "",
      publicKey: paystackPublicKey(),
    });
  } catch (error) {
    console.error("[domain-renew-create-payment] failed", {
      message: error && error.message ? String(error.message) : "unknown",
      stack: error && error.stack ? String(error.stack) : "",
    });
    return json(500, { ok: false, error: error.message || "Could not initialize domain renewal payment" });
  }
};
