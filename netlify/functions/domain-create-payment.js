const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { checkAvailability, getRegistrationPrice, selectedDomainProviderName } = require("./_lib/domain-client");
const { paystackInitialize, paystackPublicKey, siteBaseUrl } = require("./_lib/payments");
const { ensureDomainTables, normalizeDomain, findDomainByName, createDomainCheckout } = require("./_lib/domains");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return ok ? email : "";
}

function requireNgnPricing(pricing) {
  const currency = String((pricing && pricing.currency) || "").trim().toUpperCase();
  const amountMinor = Number(pricing && pricing.amountMinor);
  if (currency !== "NGN") {
    throw new Error(`ResellerClub currency is ${currency || "unknown"}. Set your ResellerClub selling/display currency to NGN.`);
  }
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    throw new Error("ResellerClub returned an invalid domain registration amount.");
  }
  return { currency, amountMinor: Math.round(amountMinor) };
}

function registrarLookupUnavailableError(error) {
  const message = String((error && error.message) || "").toLowerCase();
  if (!message) return false;
  return (
    message.includes("registrar") ||
    message.includes("lookup_failed") ||
    message.includes("availability response")
  );
}

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

  const fullName = clean(body.fullName || body.full_name, 180);
  const email = normalizeEmail(body.email);
  const domainName = normalizeDomain(body.domainName || body.domain_name);
  const years = Math.max(1, Math.min(Number(body.years) || 1, 10));
  if (!fullName || !email || !domainName) {
    return json(400, { ok: false, error: "Full name, valid email, and domain are required." });
  }

  const pool = getPool();
  try {
    await ensureDomainTables(pool);
    const taken = await findDomainByName(pool, { domainName });
    if (taken && String(taken.status || "").toLowerCase() === "registered") {
      return json(400, { ok: false, error: "This domain has already been registered on the platform." });
    }

    let availability;
    try {
      availability = await checkAvailability({ domainName, strict: true });
    } catch (error) {
      if (registrarLookupUnavailableError(error)) {
        return json(503, {
          ok: false,
          error: "Domain lookup is temporarily unavailable. Please try again shortly.",
        });
      }
      throw error;
    }
    if (!availability.available) {
      return json(400, { ok: false, error: `${domainName} is not available.` });
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
            ? `We could not fetch live registrar pricing to start payment. ${reason}`
            : "We could not fetch live registrar pricing to start payment. Please try again in a moment.",
        });
      }
      throw error;
    }
    const priced = requireNgnPricing(pricing);
    const reference = `DMN_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const provider = availability.provider || selectedDomainProviderName();
    const checkoutUuid = await createDomainCheckout(pool, {
      fullName,
      email,
      domainName,
      years,
      provider,
      paymentProvider: "paystack",
      paymentReference: reference,
      paymentCurrency: priced.currency,
      paymentAmountMinor: priced.amountMinor,
    });

    const payment = await paystackInitialize({
      email,
      amountMinor: priced.amountMinor,
      reference,
      callbackUrl: `${siteBaseUrl()}/.netlify/functions/domain-paystack-return`,
      metadata: {
        domain_checkout_uuid: checkoutUuid,
        domain_name: domainName,
        years,
        full_name: fullName,
        email,
      },
    });

    return json(200, {
      ok: true,
      checkoutUuid,
      provider: "paystack",
      paymentReference: reference,
      amountMinor: priced.amountMinor,
      currency: priced.currency,
      checkoutUrl: payment.checkoutUrl || "",
      accessCode: payment.accessCode || "",
      publicKey: paystackPublicKey(),
    });
  } catch (error) {
    console.error("[domain-create-payment] failed", {
      message: error && error.message ? String(error.message) : "unknown",
      stack: error && error.stack ? String(error.stack) : "",
    });
    return json(500, { ok: false, error: error.message || "Could not initialize payment" });
  }
};
