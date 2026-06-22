const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const {
  schoolsPricingConfigForPool,
  schoolsPricingForPool,
  schoolsStripePricingForPool,
} = require("./_lib/schools");

function formatMoney(minor, currency) {
  const cur = String(currency || "NGN").toUpperCase();
  const locale = cur === "NGN" ? "en-NG" : (cur === "GBP" ? "en-GB" : (cur === "EUR" ? "en-IE" : "en-US"));
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: cur,
    maximumFractionDigits: cur === "NGN" ? 0 : 2,
  }).format(Number(minor || 0) / 100);
}

function introText(config, unitMinor, currency) {
  return `Bulk school access starts at ${config.minSeats} students. Price is ${formatMoney(unitMinor, currency)} per student + VAT.`;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const seatCount = Number(event.queryStringParameters && event.queryStringParameters.seat_count || 0);
  const courseSlug = String(event.queryStringParameters && event.queryStringParameters.course_slug || "prompt-to-profit-schools").trim().toLowerCase() || "prompt-to-profit-schools";

  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  const config = await schoolsPricingConfigForPool(pool, courseSlug);
  const quote = await schoolsPricingForPool(pool, Number.isFinite(seatCount) && seatCount > 0 ? seatCount : config.minSeats, courseSlug);
  const quoteSeats = Number.isFinite(seatCount) && seatCount > 0 ? seatCount : config.minSeats;
  const stripeQuotes = {
    GBP: await schoolsStripePricingForPool(pool, quoteSeats, "United Kingdom", courseSlug),
    USD: await schoolsStripePricingForPool(pool, quoteSeats, "United States", courseSlug),
    EUR: await schoolsStripePricingForPool(pool, quoteSeats, "European Union", courseSlug),
  };
  return json(200, {
    ok: true,
    config,
    quote,
    stripeQuotes,
    pricingIntro: introText(config, config.pricePerStudentMinor, "NGN"),
    pricingIntroByCurrency: {
      NGN: introText(config, config.pricePerStudentMinor, "NGN"),
      GBP: introText(config, config.priceGbpMinor, "GBP"),
      USD: introText(config, config.priceUsdMinor, "USD"),
      EUR: introText(config, config.priceEurMinor, "EUR"),
    },
    feeConfig: {
      stripeFeeBps: Number.isFinite(Number(process.env.STRIPE_FEE_BPS)) && Number(process.env.STRIPE_FEE_BPS) >= 0
        ? Math.round(Number(process.env.STRIPE_FEE_BPS))
        : 150,
      stripeFixedFeeMinor: {
        GBP: Number.isFinite(Number(process.env.STRIPE_FEE_FIXED_GBP_MINOR)) && Number(process.env.STRIPE_FEE_FIXED_GBP_MINOR) >= 0
          ? Math.round(Number(process.env.STRIPE_FEE_FIXED_GBP_MINOR))
          : 20,
        USD: Number.isFinite(Number(process.env.STRIPE_FEE_FIXED_USD_MINOR)) && Number(process.env.STRIPE_FEE_FIXED_USD_MINOR) >= 0
          ? Math.round(Number(process.env.STRIPE_FEE_FIXED_USD_MINOR))
          : 30,
        EUR: Number.isFinite(Number(process.env.STRIPE_FEE_FIXED_EUR_MINOR)) && Number(process.env.STRIPE_FEE_FIXED_EUR_MINOR) >= 0
          ? Math.round(Number(process.env.STRIPE_FEE_FIXED_EUR_MINOR))
          : 25,
      },
    },
  });
};
