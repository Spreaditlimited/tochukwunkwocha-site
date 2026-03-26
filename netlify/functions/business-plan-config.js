const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function priceMinor() {
  const raw = Number(process.env.BUSINESS_PLAN_PRICE_NGN_MINOR || 20000);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 20000;
}

function formatNaira(minor) {
  const amount = Math.max(0, Number(minor || 0)) / 100;
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch (_error) {
    return `N${Math.round(amount)}`;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  try {
    const pool = getPool();
    await applyRuntimeSettings(pool, { force: true });
  } catch (_error) {}

  const amountMinor = priceMinor();
  return json(200, {
    ok: true,
    price: {
      currency: "NGN",
      amountMinor,
      amountLabel: formatNaira(amountMinor),
    },
    verifier: {
      name: clean(process.env.BUSINESS_PLAN_VERIFIER_NAME || "Jane Doe", 120),
      imageUrl: clean(
        process.env.BUSINESS_PLAN_VERIFIER_IMAGE_URL ||
          "https://ui-avatars.com/api/?name=Jane+Doe&background=10b981&color=fff",
        1000
      ),
      bio: clean(
        process.env.BUSINESS_PLAN_VERIFIER_BIO ||
          "Every business plan generated through our system crosses my desk. I ensure your financial projections are realistic, investor-ready, and optimized for growth before you pitch.",
        4000
      ),
      linkedinUrl: clean(process.env.BUSINESS_PLAN_VERIFIER_LINKEDIN_URL || "https://linkedin.com/in/your-expert-link", 1000),
    },
  });
};
