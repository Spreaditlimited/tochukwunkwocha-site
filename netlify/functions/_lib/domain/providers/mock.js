function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeDomain(input) {
  return clean(input, 190).toLowerCase();
}

function looksTaken(domainName) {
  const d = normalizeDomain(domainName);
  if (!d) return true;
  if (d.includes("taken")) return true;
  if (d.includes("busy")) return true;
  if (d.startsWith("www.")) return true;
  return false;
}

async function checkAvailability(input) {
  const domainName = normalizeDomain(input && input.domainName);
  return {
    provider: "mock",
    domainName,
    available: !looksTaken(domainName),
    reason: looksTaken(domainName) ? "mock_unavailable" : "mock_available",
    raw: null,
  };
}

async function checkAvailabilityMany(input) {
  const names = Array.isArray(input && input.domainNames) ? input.domainNames : [];
  const results = [];
  for (const name of names) {
    results.push(await checkAvailability({ domainName: name }));
  }
  return results;
}

async function registerDomain(input) {
  const domainName = normalizeDomain(input && input.domainName);
  const unavailable = looksTaken(domainName);
  if (unavailable) {
    return {
      provider: "mock",
      domainName,
      success: false,
      orderId: "",
      amountMinor: null,
      currency: "USD",
      reason: "mock_unavailable",
      raw: null,
    };
  }

  return {
    provider: "mock",
    domainName,
    success: true,
    orderId: `mock_${Date.now()}`,
    amountMinor: 1200,
    currency: "USD",
    reason: "mock_registered",
    raw: null,
  };
}

async function getDnsZone(input) {
  const domainName = normalizeDomain(input && input.domainName);
  return {
    provider: "mock",
    domainName,
    nameservers: ["ns1.mockdns.local", "ns2.mockdns.local"],
    records: [
      { host: "@", type: "A", value: "203.0.113.10", ttl: 3600 },
      { host: "www", type: "CNAME", value: "@", ttl: 3600 },
    ],
  };
}

async function updateNameservers(input) {
  const domainName = normalizeDomain(input && input.domainName);
  const nameservers = Array.isArray(input && input.nameservers) ? input.nameservers.map((x) => clean(x, 190).toLowerCase()).filter(Boolean) : [];
  if (nameservers.length < 2) throw new Error("Provide at least two nameservers.");
  return {
    provider: "mock",
    domainName,
    nameservers,
    success: true,
  };
}

async function updateDnsRecords(input) {
  const domainName = normalizeDomain(input && input.domainName);
  const records = Array.isArray(input && input.records) ? input.records : [];
  if (!records.length) throw new Error("Provide at least one DNS record.");
  return {
    provider: "mock",
    domainName,
    records,
    success: true,
  };
}

module.exports = {
  checkAvailability,
  checkAvailabilityMany,
  registerDomain,
  getDnsZone,
  updateNameservers,
  updateDnsRecords,
};
