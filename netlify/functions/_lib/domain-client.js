const namecheap = require("./domain/providers/namecheap");
const resellerclub = require("./domain/providers/resellerclub");
const mock = require("./domain/providers/mock");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeDomain(input) {
  return clean(input, 190).toLowerCase();
}

function selectedDomainProviderName() {
  const raw = clean(
    process.env.LEADPAGE_DOMAIN_PROVIDER || process.env.DOMAIN_REGISTRAR_PROVIDER || process.env.DOMAIN_PROVIDER,
    40
  ).toLowerCase();
  if (raw === "mock") return "mock";
  if (raw === "resellerclub") return "resellerclub";
  // Auto-select ResellerClub when only reseller vars are configured.
  if (clean(process.env.RESELLERCLUB_RESELLER_ID || process.env.RESCLUB_AUTH_USERID, 120)) return "resellerclub";
  return "namecheap";
}

function allowMockFallback() {
  return String(process.env.LEADPAGE_DOMAIN_ALLOW_MOCK || "1").trim() !== "0";
}

function strictMode(input) {
  return Boolean(input && input.strict);
}

function selectedProvider() {
  const name = selectedDomainProviderName();
  if (name === "mock") return mock;
  if (name === "resellerclub") return resellerclub;
  return namecheap;
}

function hasProviderConfig(name) {
  if (name === "mock") return true;
  if (name === "resellerclub") {
    const authUserId = clean(process.env.RESCLUB_AUTH_USERID || process.env.RESELLERCLUB_RESELLER_ID, 120);
    const apiKey = clean(process.env.RESCLUB_API_KEY || process.env.RESELLERCLUB_API_KEY, 240);
    return Boolean(authUserId && apiKey);
  }
  return Boolean(clean(process.env.NAMECHEAP_API_KEY, 120));
}

function parseTlds() {
  const csv = clean(process.env.LEADPAGE_DOMAIN_TLDS || "com,net,org,io,co", 200);
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

function hasMeaningfulText(value) {
  return Boolean(slugPart(value));
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

  const hasBusinessName = hasMeaningfulText(businessName);
  const hasServiceOffer = hasMeaningfulText(serviceOffer);
  const hasTargetLocation = hasMeaningfulText(targetLocation);
  const hasBusinessType = hasMeaningfulText(businessType);

  if (hasBusinessName) uniquePush(stems, seen, businessName);
  if (hasBusinessName && hasTargetLocation) uniquePush(stems, seen, `${businessName} ${targetLocation}`);
  if (hasBusinessName && hasBusinessType) uniquePush(stems, seen, `${businessName} ${businessType}`);
  if (hasBusinessName && hasServiceOffer) uniquePush(stems, seen, `${businessName} ${serviceOffer}`);
  if (hasServiceOffer && hasTargetLocation) uniquePush(stems, seen, `${serviceOffer} ${targetLocation}`);
  if (hasBusinessName) uniquePush(stems, seen, `${businessName} hq`);
  if (hasBusinessName) uniquePush(stems, seen, `${businessName} online`);
  if (hasBusinessName) uniquePush(stems, seen, `${businessName} pro`);
  if (hasBusinessName) uniquePush(stems, seen, `${businessName} now`);

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
    if (!allowMockFallback() || strictMode(input)) {
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
    if (!allowMockFallback() || strictMode(input)) {
      throw new Error(`Missing registrar config for provider: ${providerName}`);
    }
    provider = mock;
    actualProvider = "mock";
  }

  const domainNames = Array.isArray(input && input.domainNames) ? input.domainNames.map((x) => normalizeDomain(x)).filter(Boolean) : [];
  if (!domainNames.length) return [];

  const items = await provider.checkAvailabilityMany({ domainNames });
  const mapped = (items || []).map((x) => ({ ...x, provider: actualProvider }));
  if (
    strictMode(input) &&
    mapped.length &&
    mapped.every((x) => {
      const reason = String((x && x.reason) || "").toLowerCase();
      return reason === "lookup_failed";
    })
  ) {
    throw new Error("Registrar provider is unreachable right now.");
  }
  return mapped;
}

async function registerDomain(input) {
  const providerName = selectedDomainProviderName();
  let provider = selectedProvider();
  let actualProvider = providerName;

  if (!hasProviderConfig(providerName)) {
    if (!allowMockFallback() || strictMode(input)) {
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

async function getRegistrationPrice(input) {
  const providerName = selectedDomainProviderName();
  const provider = selectedProvider();
  if (!hasProviderConfig(providerName)) {
    throw new Error(`Missing registrar config for provider: ${providerName}`);
  }
  if (!provider || typeof provider.getRegistrationPrice !== "function") {
    throw new Error(`Price lookup is not supported for provider: ${providerName}`);
  }
  const domainName = normalizeDomain(input && input.domainName);
  if (!domainName) throw new Error("domainName is required");
  const years = Math.max(1, Math.min(Number(input && input.years) || 1, 10));
  const result = await provider.getRegistrationPrice({ domainName, years });
  return {
    ...result,
    provider: providerName,
    domainName,
    years,
  };
}

async function getDnsZone(input) {
  const providerName = selectedDomainProviderName();
  const provider = selectedProvider();
  if (!hasProviderConfig(providerName)) {
    throw new Error(`Missing registrar config for provider: ${providerName}`);
  }
  if (!provider || typeof provider.getDnsZone !== "function") {
    throw new Error(`DNS management is not supported for provider: ${providerName}`);
  }
  const domainName = normalizeDomain(input && input.domainName);
  if (!domainName) throw new Error("domainName is required");
  const result = await provider.getDnsZone({ domainName });
  return {
    ...result,
    provider: providerName,
  };
}

async function updateNameservers(input) {
  const providerName = selectedDomainProviderName();
  const provider = selectedProvider();
  if (!hasProviderConfig(providerName)) {
    throw new Error(`Missing registrar config for provider: ${providerName}`);
  }
  if (!provider || typeof provider.updateNameservers !== "function") {
    throw new Error(`Nameserver management is not supported for provider: ${providerName}`);
  }
  const domainName = normalizeDomain(input && input.domainName);
  if (!domainName) throw new Error("domainName is required");
  const nameservers = Array.isArray(input && input.nameservers) ? input.nameservers : [];
  const result = await provider.updateNameservers({ domainName, nameservers });
  return {
    ...result,
    provider: providerName,
  };
}

async function updateDnsRecords(input) {
  const providerName = selectedDomainProviderName();
  const provider = selectedProvider();
  if (!hasProviderConfig(providerName)) {
    throw new Error(`Missing registrar config for provider: ${providerName}`);
  }
  if (!provider || typeof provider.updateDnsRecords !== "function") {
    throw new Error(`DNS record management is not supported for provider: ${providerName}`);
  }
  const domainName = normalizeDomain(input && input.domainName);
  if (!domainName) throw new Error("domainName is required");
  const records = Array.isArray(input && input.records) ? input.records : [];
  const result = await provider.updateDnsRecords({ domainName, records });
  return {
    ...result,
    provider: providerName,
  };
}

module.exports = {
  selectedDomainProviderName,
  buildDomainCandidates,
  checkAvailability,
  checkAvailabilityMany,
  registerDomain,
  getRegistrationPrice,
  getDnsZone,
  updateNameservers,
  updateDnsRecords,
};
