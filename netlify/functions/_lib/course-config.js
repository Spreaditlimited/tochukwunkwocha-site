const COURSE_CONFIGS = {
  "prompt-to-profit": {
    slug: "prompt-to-profit",
    name: "Prompt to Profit",
    landingPath: "/courses/prompt-to-profit",
    defaultBatchKey: "ptp-batch-1",
    defaultBatchLabel: "Batch 1",
    defaultPrefix: "PTP",
  },
  "prompt-to-production": {
    slug: "prompt-to-production",
    name: "Prompt to Production",
    landingPath: "/courses/prompt-to-production",
    defaultBatchKey: "ptprod-batch-1",
    defaultBatchLabel: "Batch 1",
    defaultPrefix: "PTPROD",
  },
  "prompt-to-profit-schools": {
    slug: "prompt-to-profit-schools",
    name: "Prompt to Profit for Schools",
    landingPath: "/courses/prompt-to-profit-schools",
    defaultBatchKey: "ptps-batch-1",
    defaultBatchLabel: "Batch 1",
    defaultPrefix: "PTPS",
  },
};

const DEFAULT_COURSE_SLUG = "prompt-to-profit";
const COURSE_SLUG_ALIASES = {
  "prompt-to-profit-for-schools": "prompt-to-profit-schools",
  "prompt-to-profit-school": "prompt-to-profit-schools",
};

function canonicalizeCourseSlug(raw) {
  const slug = String(raw || "").trim().toLowerCase();
  if (!slug) return "";
  return COURSE_SLUG_ALIASES[slug] || slug;
}

function normalizeCourseSlug(raw, fallback) {
  const slug = canonicalizeCourseSlug(raw);
  if (slug && COURSE_CONFIGS[slug]) return slug;

  const fallbackSlug = canonicalizeCourseSlug(fallback || DEFAULT_COURSE_SLUG) || DEFAULT_COURSE_SLUG;
  if (fallbackSlug && COURSE_CONFIGS[fallbackSlug]) return fallbackSlug;
  return DEFAULT_COURSE_SLUG;
}

function getCourseConfig(rawSlug) {
  const slug = normalizeCourseSlug(rawSlug);
  return COURSE_CONFIGS[slug] || null;
}

function listCourseConfigs() {
  return Object.keys(COURSE_CONFIGS).map(function (slug) {
    return COURSE_CONFIGS[slug];
  });
}

function getCourseLandingPath(rawSlug) {
  const slug = normalizeCourseSlug(rawSlug, DEFAULT_COURSE_SLUG);
  const cfg = getCourseConfig(rawSlug);
  return String((cfg && cfg.landingPath) || `/courses/${slug}`);
}

function getCourseName(rawSlug) {
  const slug = normalizeCourseSlug(rawSlug, DEFAULT_COURSE_SLUG);
  const cfg = getCourseConfig(rawSlug);
  if (cfg && cfg.name) return String(cfg.name);
  return slug
    .split("-")
    .filter(Boolean)
    .map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ") || COURSE_CONFIGS[DEFAULT_COURSE_SLUG].name;
}

function getCourseDefaultAmountMinor(rawSlug) {
  const slug = normalizeCourseSlug(rawSlug);
  if (slug === "prompt-to-production") {
    const amount = Number(process.env.PROMPT_TO_PRODUCTION_PRICE_NGN_MINOR || 25000000);
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 25000000;
  }
  if (slug !== "prompt-to-profit") {
    const amount = Number(process.env.DEFAULT_COURSE_PRICE_NGN_MINOR || process.env.PROMPT_TO_PROFIT_PRICE_NGN_MINOR || 1075000);
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 1075000;
  }
  const amount = Number(process.env.PROMPT_TO_PROFIT_PRICE_NGN_MINOR || 1075000);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 1075000;
}

function getCourseDefaultPaypalAmount(rawSlug) {
  const slug = normalizeCourseSlug(rawSlug);
  const raw = slug === "prompt-to-production"
    ? String(process.env.PROMPT_TO_PRODUCTION_PRICE_GBP || "24.00").trim()
    : (slug === "prompt-to-profit"
      ? String(process.env.PROMPT_TO_PROFIT_PRICE_GBP || "24.00").trim()
      : String(process.env.DEFAULT_COURSE_PRICE_GBP || process.env.PROMPT_TO_PROFIT_PRICE_GBP || "24.00").trim());
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(2) : "24.00";
}

function getCourseDefaultPaypalMinor(rawSlug) {
  const major = Number(getCourseDefaultPaypalAmount(rawSlug));
  return Number.isFinite(major) && major > 0 ? Math.round(major * 100) : 2400;
}

module.exports = {
  DEFAULT_COURSE_SLUG,
  canonicalizeCourseSlug,
  normalizeCourseSlug,
  getCourseConfig,
  listCourseConfigs,
  getCourseLandingPath,
  getCourseName,
  getCourseDefaultAmountMinor,
  getCourseDefaultPaypalAmount,
  getCourseDefaultPaypalMinor,
};
