const namecheap = require("./domain/providers/namecheap");
const mock = require("./domain/providers/mock");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeDomain(input) {
  return clean(input, 190).toLowerCase();
}

function selectedDomainProviderName() {
  const raw = clean(process.env.LEADPAGE_DOMAIN_PROVIDER, 40).toLowerCase();
  if (raw === "mock") return "mock";
  return "namecheap";
}

function allowMockFallback() {
  return String(process.env.LEADPAGE_DOMAIN_ALLOW_MOCK || "1").trim() !== "0";
}

function selectedProvider() {
  return selectedDomainProviderName() === "mock" ? mock : namecheap;
}

function hasProviderConfig(name) {
  if (name === "mock") return true;
  return Boolean(clean(process.env.NAMECHEAP_API_KEY, 20));
}

function parseTlds() {
  const csv = clean(process.env.LEADPAGE_DOMAIN_TLDS || "com,com.ng,ng", 200);
  const tlds = csv
    .split(",")
    .map((x) => clean(x, 20).toLowerCase().replace(/^\.+/, ""))
    .filter(Boolean);
  return tlds.length ? tlds : ["com"];
}

function slugPart(input) {
  return clean(input, 160)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePreferredStem(input, tlds) {
  const raw = clean(input, 190).toLowerCase();
  if (!raw) return "";

  let working = raw
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];

  if (working.includes(".")) {
    const sortedTlds = (tlds || []).slice().sort((a, b) => b.length - a.length);
    for (const tld of sortedTlds) {
      const suffix = `.${tld}`;
      if (working.endsWith(suffix) && working.length > suffix.length + 1) {
        working = working.slice(0, -suffix.length);
        break;
      }
    }
  }

  let stem = slugPart(working.replace(/\./g, "-"));
  if (!stem) return "";

  const tldTokens = new Set(["com", "ng"]);
  let parts = stem.split("-").filter(Boolean);
  while (parts.length > 2 && tldTokens.has(parts[parts.length - 1])) {
    parts = parts.slice(0, -1);
  }
  stem = parts.join("-");
  return stem;
}

function uniquePush(arr, seen, value) {
  const cleaned = slugPart(value);
  if (!cleaned || cleaned.length < 3) return;
  if (seen.has(cleaned)) return;
  seen.add(cleaned);
  arr.push(cleaned);
}

function buildDomainCandidates(input) {
  const businessName = clean(input && input.businessName, 220);
  const businessType = clean(input && input.businessType, 160);
  const serviceOffer = clean(input && input.serviceOffer, 280);
  const targetLocation = clean(input && input.targetLocation, 180);
  const preferredName = clean(input && input.preferredName, 160);
  const limit = Math.max(3, Math.min(Number(input && input.limit) || 12, 40));
  const tlds = parseTlds();
  const preferredStem = normalizePreferredStem(preferredName, tlds);

  const stems = [];
  const seen = new Set();
  uniquePush(stems, seen, preferredStem);
  uniquePush(stems, seen, businessName);
  uniquePush(stems, seen, `${businessName} ${targetLocation}`);
  uniquePush(stems, seen, `${businessName} ${businessType}`);
  uniquePush(stems, seen, `${businessName} ${serviceOffer}`);
  uniquePush(stems, seen, `${serviceOffer} ${targetLocation}`);
  uniquePush(stems, seen, `${businessName} hq`);
  uniquePush(stems, seen, `${businessName} online`);
  uniquePush(stems, seen, `${businessName} pro`);
  uniquePush(stems, seen, `${businessName} now`);

  const out = [];
  const seenDomain = new Set();
  for (const stem of stems) {
    for (const tld of tlds) {
      const domain = normalizeDomain(`${stem}.${tld}`);
      if (!domain || seenDomain.has(domain)) continue;
      seenDomain.add(domain);
      out.push(domain);
      if (out.length >= limit) return out;
    }
  }
  return out.slice(0, limit);
}

async function checkAvailability(input) {
  const providerName = selectedDomainProviderName();
  let provider = selectedProvider();
  let actualProvider = providerName;

  if (!hasProviderConfig(providerName)) {
    if (!allowMockFallback()) {
      throw new Error(`Missing registrar config for provider: ${providerName}`);
    }
    provider = mock;
    actualProvider = "mock";
  }

  const domainName = normalizeDomain(input && input.domainName);
  if (!domainName) throw new Error("domainName is required");

  const result = await provider.checkAvailability({ domainName });
  return { ...result, provider: actualProvider };
}

async function checkAvailabilityMany(input) {
  const providerName = selectedDomainProviderName();
  let provider = selectedProvider();
  let actualProvider = providerName;

  if (!hasProviderConfig(providerName)) {
    if (!allowMockFallback()) {
      throw new Error(`Missing registrar config for provider: ${providerName}`);
    }
    provider = mock;
    actualProvider = "mock";
  }

  const domainNames = Array.isArray(input && input.domainNames) ? input.domainNames.map((x) => normalizeDomain(x)).filter(Boolean) : [];
  if (!domainNames.length) return [];

  const items = await provider.checkAvailabilityMany({ domainNames });
  return (items || []).map((x) => ({ ...x, provider: actualProvider }));
}

async function registerDomain(input) {
  const providerName = selectedDomainProviderName();
  let provider = selectedProvider();
  let actualProvider = providerName;

  if (!hasProviderConfig(providerName)) {
    if (!allowMockFallback()) {
      throw new Error(`Missing registrar config for provider: ${providerName}`);
    }
    provider = mock;
    actualProvider = "mock";
  }

  const domainName = normalizeDomain(input && input.domainName);
  if (!domainName) throw new Error("domainName is required");

  const result = await provider.registerDomain({
    domainName,
    years: Number(input && input.years) || 1,
  });
  return { ...result, provider: actualProvider };
}

module.exports = {
  selectedDomainProviderName,
  buildDomainCandidates,
  checkAvailability,
  checkAvailabilityMany,
  registerDomain,
};
