const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { checkAvailability, selectedDomainProviderName } = require("./_lib/domain-client");
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

function paymentAmountMinorNgn() {
  const raw = Number(process.env.DOMAIN_REGISTRATION_AMOUNT_MINOR_NGN || 150000);
  if (!Number.isFinite(raw) || raw <= 0) return 150000;
  return Math.round(raw);
}

function registrarUnavailableError(error) {
  const message = String((error && error.message) || "").toLowerCase();
  if (!message) return false;
  return (
    message.includes("registrar") ||
    message.includes("lookup_failed") ||
    message.includes("missing registrar config") ||
    message.includes("namecheap") ||
    message.includes("resellerclub")
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

    const availability = await checkAvailability({ domainName, strict: true });
    if (!availability.available) {
      return json(400, { ok: false, error: `${domainName} is not available.` });
    }

    const amountMinor = paymentAmountMinorNgn();
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
      paymentCurrency: "NGN",
      paymentAmountMinor: amountMinor,
    });

    const payment = await paystackInitialize({
      email,
      amountMinor,
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
      amountMinor,
      currency: "NGN",
      checkoutUrl: payment.checkoutUrl || "",
      accessCode: payment.accessCode || "",
      publicKey: paystackPublicKey(),
    });
  } catch (error) {
    if (registrarUnavailableError(error)) {
      return json(503, {
        ok: false,
        error: "Domain lookup is temporarily unavailable. Please try again shortly.",
      });
    }
    return json(500, { ok: false, error: error.message || "Could not initialize payment" });
  }
};
