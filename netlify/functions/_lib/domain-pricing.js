function clean(value, max) {
  return String(value || "").trim().slice(0, max);
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

function addOnCatalog() {
  return {};
}

function parseSelectedServices(input) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(input) ? input : [];
  list.forEach((item) => {
    const key = clean(item, 64).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  return out;
}

function yearsInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.min(Math.round(n), 10));
}

function vatPercent() {
  const raw = Number(process.env.SITE_VAT_PERCENT);
  if (!Number.isFinite(raw) || raw < 0) return 7.5;
  return Math.min(raw, 100);
}

function pct(value, fallback) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw < 0) return Number(fallback) / 100;
  return raw / 100;
}

function domainProfitFloorSubtotalMinor(years, vatPct) {
  const worstFx = Number(
    process.env.DOMAIN_WORST_FX_NGN_PER_USD ||
      process.env.DOMAIN_PRICING_WORST_FX_NGN_PER_USD ||
      0
  );
  if (!Number.isFinite(worstFx) || worstFx <= 0) return 0;
  const usdCostPerYear = Number(process.env.DOMAIN_REGISTRAR_COST_USD_PER_YEAR || 17.99);
  if (!Number.isFinite(usdCostPerYear) || usdCostPerYear <= 0) return 0;

  const margin = pct(process.env.DOMAIN_TARGET_MARGIN_PERCENT, 20);
  const paystackPct = pct(process.env.DOMAIN_PAYSTACK_PERCENT, 1.5);
  const paystackFeeVat = pct(process.env.DOMAIN_PAYSTACK_FEE_VAT_PERCENT, 7.5);
  const fixedFeeMinor = Math.max(0, Math.round((Number(process.env.DOMAIN_PAYSTACK_FIXED_FEE_NGN || 100) || 0) * 100));
  const vatRate = Math.max(0, Number(vatPct || 0)) / 100;

  const costMinor = Math.round(usdCostPerYear * years * worstFx * 100);
  const denominator = 1 - paystackPct * (1 + vatRate) * (1 + paystackFeeVat);
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;

  const numerator = (1 + margin) * costMinor + fixedFeeMinor * (1 + paystackFeeVat);
  if (!Number.isFinite(numerator) || numerator <= 0) return 0;

  return Math.max(0, Math.ceil(numerator / denominator));
}

function buildDomainCheckoutQuote(input) {
  const base = requireNgnPricing(input && input.basePricing);
  const years = yearsInt(input && input.years);
  const selectedServices = parseSelectedServices(input && input.selectedServices);
  const servicePrices = input && typeof input.servicePrices === "object" ? input.servicePrices : {};
  const catalog = addOnCatalog();

  const addOns = [];
  let addOnsTotalMinor = 0;

  for (const key of selectedServices) {
    const meta = catalog[key];
    if (!meta) continue;
    const item = servicePrices[key] || {};
    const rawCurrency = String(item.currency || base.currency).toUpperCase();
    const unitMinor = Number(item.unitAmountMinor || 0);
    const termMinor = Number(item.termAmountMinor || 0);
    if (rawCurrency !== "NGN") {
      throw new Error(`${meta.label} pricing is unavailable in NGN right now. Please try again shortly.`);
    }
    const amountMinor =
      Number.isFinite(termMinor) && termMinor > 0
        ? Math.round(termMinor)
        : Number.isFinite(unitMinor) && unitMinor > 0
        ? Math.round(unitMinor * years)
        : Number.isFinite(termMinor) && termMinor === 0
        ? 0
        : Number.isFinite(unitMinor) && unitMinor === 0
        ? 0
        : null;
    if (amountMinor === null) {
      throw new Error(`${meta.label} price is currently unavailable from the registrar.`);
    }
    const normalizedUnit = Math.max(0, Math.round(amountMinor / years));
    addOnsTotalMinor += amountMinor;
    addOns.push({
      code: key,
      label: meta.label,
      unitAmountMinor: normalizedUnit,
      quantity: years,
      amountMinor,
      unavailable: Boolean(item.unavailable),
      note: String(item.note || ""),
    });
  }

  const rawSubtotalMinor = base.amountMinor + addOnsTotalMinor;
  const vatPct = vatPercent();
  const floorSubtotalMinor = domainProfitFloorSubtotalMinor(years, vatPct);
  const subtotalMinor = Math.max(rawSubtotalMinor, floorSubtotalMinor);
  const adjustedBaseAmountMinor = Math.max(0, subtotalMinor - addOnsTotalMinor);
  const vatAmountMinor = Math.round((subtotalMinor * vatPct) / 100);
  const totalAmountMinor = subtotalMinor + vatAmountMinor;

  return {
    currency: base.currency,
    years,
    baseAmountMinor: adjustedBaseAmountMinor,
    rawBaseAmountMinor: base.amountMinor,
    addOns,
    addOnsTotalMinor,
    rawSubtotalMinor,
    floorSubtotalMinor,
    pricingFloorApplied: floorSubtotalMinor > 0 && subtotalMinor > rawSubtotalMinor,
    subtotalMinor,
    vatPercent: vatPct,
    vatAmountMinor,
    totalAmountMinor,
  };
}

module.exports = {
  buildDomainCheckoutQuote,
  requireNgnPricing,
};
