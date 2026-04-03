const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { checkAvailability, getRegistrationPrice, getServicePrices } = require("./_lib/domain-client");
const { ensureDomainTables, normalizeDomain, normalizeSelectedServices } = require("./_lib/domains");
const { buildDomainCheckoutQuote } = require("./_lib/domain-pricing");

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

  const domainName = normalizeDomain(body.domainName || body.domain_name);
  const years = Math.max(1, Math.min(Number(body.years) || 1, 10));
  const selectedServices = normalizeSelectedServices(body.selectedServices);
  const debug = Boolean(body.debug);
  if (!domainName) return json(400, { ok: false, error: "domainName is required." });

  const pool = getPool();
  try {
    await ensureDomainTables(pool);

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
            ? `We could not fetch live registrar pricing. ${reason}`
            : "We could not fetch live registrar pricing. Please try again shortly.",
        });
      }
      throw error;
    }

    const servicesPricing = await getServicePrices({
      domainName,
      years,
      serviceCodes: selectedServices,
      debug,
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

    return json(200, {
      ok: true,
      domainName,
      quote,
      ...(debug ? { debug: servicesPricing.debug || null } : {}),
    });
  } catch (error) {
    console.error("[domain-quote] failed", {
      message: error && error.message ? String(error.message) : "unknown",
      stack: error && error.stack ? String(error.stack) : "",
    });
    return json(500, { ok: false, error: error.message || "Could not build domain quote" });
  }
};
