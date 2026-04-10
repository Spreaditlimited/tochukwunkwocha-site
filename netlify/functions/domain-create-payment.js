const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { checkAvailability, getRegistrationPrice, getServicePrices, selectedDomainProviderName } = require("./_lib/domain-client");
const { paystackInitialize, paystackPublicKey, siteBaseUrl } = require("./_lib/payments");
const {
  ensureDomainTables,
  normalizeDomain,
  findDomainByName,
  createDomainCheckout,
  normalizeSelectedServices,
  normalizeAutoRenew,
} = require("./_lib/domains");
const { buildDomainCheckoutQuote } = require("./_lib/domain-pricing");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return ok ? email : "";
}

function normalizeRegistrantField(value, max) {
  return clean(value, max || 190);
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
  const selectedServices = normalizeSelectedServices(body.selectedServices);
  const autoRenewEnabled = normalizeAutoRenew(body.autoRenewEnabled, true);
  const registrantAddress1 = normalizeRegistrantField(body.registrantAddress1, 240);
  const registrantCity = normalizeRegistrantField(body.registrantCity, 120);
  const registrantState = normalizeRegistrantField(body.registrantState, 120);
  const registrantCountry = normalizeRegistrantField(body.registrantCountry, 120);
  const registrantPostalCode = normalizeRegistrantField(body.registrantPostalCode, 40);
  const registrantPhone = normalizeRegistrantField(body.registrantPhone, 50);
  const registrantPhoneCc = normalizeRegistrantField(body.registrantPhoneCc, 10);
  if (!fullName || !email || !domainName) {
    return json(400, { ok: false, error: "Full name, valid email, and domain are required." });
  }
  if (!registrantAddress1 || !registrantCity || !registrantState || !registrantCountry || !registrantPostalCode || !registrantPhone || !registrantPhoneCc) {
    return json(400, {
      ok: false,
      error: "Address, city, state, country, postal code, phone, and phone country code are required for domain ownership registration.",
    });
  }
  const registrantProfile = {
    address1: registrantAddress1,
    city: registrantCity,
    state: registrantState,
    country: registrantCountry,
    postalCode: registrantPostalCode,
    phone: registrantPhone,
    phoneCc: registrantPhoneCc,
  };

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
    const servicesPricing = await getServicePrices({
      domainName,
      years,
      serviceCodes: selectedServices,
    });
    const serviceCurrency = String((servicesPricing && servicesPricing.currency) || "").toUpperCase();
    if (serviceCurrency && serviceCurrency !== "NGN") {
      return json(503, {
        ok: false,
        error: `Registrar returned ${serviceCurrency} for add-ons. Set your ResellerClub selling/display currency to NGN.`,
      });
    }
    const servicePriceMap = {};
    (Array.isArray(servicesPricing && servicesPricing.items) ? servicesPricing.items : []).forEach((item) => {
      const code = String(item && item.code ? item.code : "").trim().toLowerCase();
      const amountMinor = Number(item && item.amountMinor ? item.amountMinor : 0);
      if (!code || !Number.isFinite(amountMinor) || amountMinor < 0) return;
      servicePriceMap[code] = {
        currency: serviceCurrency || "NGN",
        termAmountMinor: Math.round(amountMinor),
        unitAmountMinor: Math.max(0, Math.round(amountMinor / years)),
        unavailable: Boolean(item && item.unavailable),
        note: String((item && item.note) || ""),
      };
    });

    const quote = buildDomainCheckoutQuote({
      basePricing: pricing,
      years,
      selectedServices,
      servicePrices: servicePriceMap,
    });
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
      paymentCurrency: quote.currency,
      paymentAmountMinor: quote.totalAmountMinor,
      registrantProfile,
      selectedServices,
      autoRenewEnabled,
    });

    const payment = await paystackInitialize({
      email,
      amountMinor: quote.totalAmountMinor,
      reference,
      callbackUrl: `${siteBaseUrl()}/.netlify/functions/domain-paystack-return`,
      metadata: {
        domain_checkout_uuid: checkoutUuid,
        domain_name: domainName,
        years,
        full_name: fullName,
        email,
        registrant_address1: registrantAddress1,
        registrant_city: registrantCity,
        registrant_state: registrantState,
        registrant_country: registrantCountry,
        registrant_postal_code: registrantPostalCode,
        registrant_phone: registrantPhone,
        registrant_phone_cc: registrantPhoneCc,
        selected_services: selectedServices,
        auto_renew_enabled: autoRenewEnabled,
      },
    });

    return json(200, {
      ok: true,
      checkoutUuid,
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
    console.error("[domain-create-payment] failed", {
      message: error && error.message ? String(error.message) : "unknown",
      stack: error && error.stack ? String(error.stack) : "",
    });
    return json(500, { ok: false, error: error.message || "Could not initialize payment" });
  }
};
