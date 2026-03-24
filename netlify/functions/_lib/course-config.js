const COURSE_CONFIGS = {
  "prompt-to-profit": {
    slug: "prompt-to-profit",
    name: "Prompt to Profit",
    landingPath: "/courses/prompt-to-profit",
    defaultBatchKey: "ptp-batch-1",
    defaultBatchLabel: "Batch 1",
    defaultPrefix: "PTP",
    defaultAmountMinor: Number(process.env.PROMPT_TO_PROFIT_PRICE_NGN_MINOR || 1075000),
    defaultPaypalAmount: String(process.env.PROMPT_TO_PROFIT_PRICE_GBP || "24.00"),
  },
  "prompt-to-production": {
    slug: "prompt-to-production",
    name: "Prompt to Production",
    landingPath: "/courses/prompt-to-production",
    defaultBatchKey: "ptprod-batch-1",
    defaultBatchLabel: "Batch 1",
    defaultPrefix: "PTPROD",
    defaultAmountMinor: Number(process.env.PROMPT_TO_PRODUCTION_PRICE_NGN_MINOR || 25000000),
    defaultPaypalAmount: String(process.env.PROMPT_TO_PRODUCTION_PRICE_GBP || "24.00"),
  },
};

const DEFAULT_COURSE_SLUG = "prompt-to-profit";

function normalizeCourseSlug(raw, fallback) {
  const fallbackSlug = String(fallback || DEFAULT_COURSE_SLUG).trim() || DEFAULT_COURSE_SLUG;
  const slug = String(raw || "").trim().toLowerCase();
  if (slug && COURSE_CONFIGS[slug]) return slug;
  if (COURSE_CONFIGS[fallbackSlug]) return fallbackSlug;
  return DEFAULT_COURSE_SLUG;
}

function getCourseConfig(rawSlug) {
  const slug = normalizeCourseSlug(rawSlug);
  return COURSE_CONFIGS[slug];
}

function listCourseConfigs() {
  return Object.keys(COURSE_CONFIGS).map(function (slug) {
    return COURSE_CONFIGS[slug];
  });
}

function getCourseLandingPath(rawSlug) {
  const cfg = getCourseConfig(rawSlug);
  return String((cfg && cfg.landingPath) || COURSE_CONFIGS[DEFAULT_COURSE_SLUG].landingPath);
}

function getCourseName(rawSlug) {
  const cfg = getCourseConfig(rawSlug);
  return String((cfg && cfg.name) || COURSE_CONFIGS[DEFAULT_COURSE_SLUG].name);
}

function getCourseDefaultAmountMinor(rawSlug) {
  const cfg = getCourseConfig(rawSlug);
  const amount = Number(cfg && cfg.defaultAmountMinor);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 1075000;
}

function getCourseDefaultPaypalAmount(rawSlug) {
  const cfg = getCourseConfig(rawSlug);
  const raw = String((cfg && cfg.defaultPaypalAmount) || "24.00").trim();
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(2) : "24.00";
}

function getCourseDefaultPaypalMinor(rawSlug) {
  const major = Number(getCourseDefaultPaypalAmount(rawSlug));
  return Number.isFinite(major) && major > 0 ? Math.round(major * 100) : 2400;
}

module.exports = {
  DEFAULT_COURSE_SLUG,
  normalizeCourseSlug,
  getCourseConfig,
  listCourseConfigs,
  getCourseLandingPath,
  getCourseName,
  getCourseDefaultAmountMinor,
  getCourseDefaultPaypalAmount,
  getCourseDefaultPaypalMinor,
};
