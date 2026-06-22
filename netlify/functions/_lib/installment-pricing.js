const { DEFAULT_COURSE_SLUG, getCourseDefaultAmountMinor, normalizeCourseSlug } = require("./course-config");

function normalizeCountry(value) {
  return String(value || "").trim().slice(0, 120);
}

function isNigeriaCountry(value) {
  const text = normalizeCountry(value).toLowerCase();
  return text === "ng" || text === "nga" || text === "nigeria";
}

function resolveStripeCurrency(country) {
  const text = normalizeCountry(country).toLowerCase();
  const eu = new Set([
    "at", "austria", "be", "belgium", "cy", "cyprus", "ee", "estonia", "fi", "finland", "fr", "france",
    "de", "germany", "gr", "greece", "ie", "ireland", "it", "italy", "lv", "latvia", "lt", "lithuania",
    "lu", "luxembourg", "mt", "malta", "nl", "netherlands", "pt", "portugal", "sk", "slovakia",
    "si", "slovenia", "es", "spain",
  ]);
  if (text === "gb" || text === "gbr" || text === "uk" || text === "united kingdom" || text === "england" || text === "scotland" || text === "wales") return "GBP";
  if (text === "us" || text === "usa" || text === "united states" || text === "united states of america") return "USD";
  if (text === "eu" || text === "european union" || text === "eurozone") return "EUR";
  if (eu.has(text)) return "EUR";
  return "USD";
}

function resolveStripeBaseMinor({ learningCourse, courseSlug, currency }) {
  const cur = String(currency || "USD").toUpperCase();
  const slug = normalizeCourseSlug(courseSlug, DEFAULT_COURSE_SLUG);
  const fallbackMajor = {
    "prompt-to-profit": { GBP: 25, USD: 30, EUR: 25 },
    "prompt-to-production": { GBP: 100, USD: 150, EUR: 100 },
    "ai-for-everyday-business-owners": { GBP: 20, USD: 25, EUR: 20 },
  };
  const col = cur === "GBP" ? "price_gbp_minor" : (cur === "EUR" ? "price_eur_minor" : "price_usd_minor");
  const configured = Number(learningCourse && learningCourse[col]);
  const fallback = Number((fallbackMajor[slug] && (fallbackMajor[slug][cur] || fallbackMajor[slug].USD)) || 30) * 100;
  const single = Number.isFinite(configured) && configured > 0 ? Math.round(configured) : Math.round(fallback);
  return Math.max(0, single);
}

function stripeFixedFeeMinor(currency) {
  const cur = String(currency || "USD").toUpperCase();
  const raw = Number(process.env[`STRIPE_FEE_FIXED_${cur}_MINOR`]);
  if (Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  if (cur === "GBP") return 20;
  if (cur === "EUR") return 25;
  return 30;
}

function grossUpStripeAmount(netMinor, currency) {
  const net = Math.max(0, Math.round(Number(netMinor || 0)));
  const bpsRaw = Number(process.env.STRIPE_FEE_BPS);
  const bps = Number.isFinite(bpsRaw) && bpsRaw >= 0 ? Math.round(bpsRaw) : 150;
  const fixed = stripeFixedFeeMinor(currency);
  if (bps >= 10000) return net + fixed;
  return Math.ceil(((net + fixed) / (1 - bps / 10000)) + 1);
}

function installmentSurchargePercent() {
  const raw = Number(process.env.INSTALLMENT_SURCHARGE_PERCENT || "20");
  return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

function internationalVatPercent() {
  const raw = Number(process.env.INTL_VAT_PERCENT);
  return Number.isFinite(raw) && raw >= 0 ? raw : 20;
}

function resolveInstallmentPlanPricing({ country, courseSlug, batch, learningCourse }) {
  const nigeria = isNigeriaCountry(country);
  const surchargePercent = installmentSurchargePercent();
  if (nigeria) {
    const courseNgnMinor = Number(learningCourse && learningCourse.price_ngn_minor);
    const baseAmountMinor = Number.isFinite(courseNgnMinor) && courseNgnMinor > 0
      ? Math.round(courseNgnMinor)
      : Number((batch && batch.paystack_amount_minor) || getCourseDefaultAmountMinor(courseSlug));
    return {
      provider: "paystack",
      currency: "NGN",
      country: normalizeCountry(country) || "Nigeria",
      baseAmountMinor,
      vatMinor: 0,
      surchargePercent,
      targetAmountMinor: Math.round(baseAmountMinor * (1 + surchargePercent / 100)),
    };
  }

  const currency = resolveStripeCurrency(country);
  const baseAmountMinor = resolveStripeBaseMinor({ learningCourse, courseSlug, currency });
  const vatMinor = Math.round((baseAmountMinor * internationalVatPercent()) / 100);
  const subtotalMinor = baseAmountMinor + vatMinor;
  return {
    provider: "stripe",
    currency,
    country: normalizeCountry(country),
    baseAmountMinor,
    vatMinor,
    surchargePercent,
    targetAmountMinor: Math.round(subtotalMinor * (1 + surchargePercent / 100)),
  };
}

module.exports = {
  grossUpStripeAmount,
  isNigeriaCountry,
  resolveInstallmentPlanPricing,
  resolveStripeCurrency,
};
