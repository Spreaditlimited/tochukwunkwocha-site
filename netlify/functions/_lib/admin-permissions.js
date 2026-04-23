const ALL_INTERNAL_PAGE_PATHS = [
  "/internal/",
  "/internal/manual-payments/",
  "/internal/installments/",
  "/internal/domain-management/",
  "/internal/video-library/",
  "/internal/learning-progress/",
  "/internal/learning-support/",
  "/internal/schools/",
  "/internal/school-calls/",
  "/internal/school-scorecards/",
  "/internal/settings/",
];

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 400);
}

function normalizePath(path) {
  const raw = clean(path, 220);
  if (!raw) return "";
  const p = raw.startsWith("/") ? raw : `/${raw}`;
  return p.endsWith("/") ? p : `${p}/`;
}

function normalizeAllowedPages(input) {
  if (input === "*" || input === "all") return ALL_INTERNAL_PAGE_PATHS.slice();

  let values = [];
  if (Array.isArray(input)) {
    values = input;
  } else if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return [];
    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) values = parsed;
      } catch (_error) {
        values = raw.split(",");
      }
    } else {
      values = raw.split(",");
    }
  }

  const allowed = new Set();
  values.forEach((entry) => {
    const p = normalizePath(entry);
    if (!p) return;
    if (ALL_INTERNAL_PAGE_PATHS.includes(p)) {
      allowed.add(p);
    }
  });

  return ALL_INTERNAL_PAGE_PATHS.filter((p) => allowed.has(p));
}

function serializeAllowedPages(pages) {
  const normalized = normalizeAllowedPages(pages);
  return normalized.join(",");
}

function parseAllowedPages(raw) {
  return normalizeAllowedPages(raw);
}

function hasPageAccess(payload, pagePath) {
  const path = normalizePath(pagePath);
  if (!path) return true;
  if (payload && payload.isOwner === true) return true;

  const allowed = normalizeAllowedPages(payload && payload.allowedPages);
  return allowed.includes(path);
}

module.exports = {
  ALL_INTERNAL_PAGE_PATHS,
  normalizePath,
  normalizeAllowedPages,
  serializeAllowedPages,
  parseAllowedPages,
  hasPageAccess,
};
