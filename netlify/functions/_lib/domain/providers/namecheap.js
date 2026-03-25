function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function required(name) {
  const value = clean(process.env[name], 400);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function boolEnv(name, fallback) {
  const raw = clean(process.env[name], 8);
  if (!raw) return Boolean(fallback);
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

function normalizeDomain(input) {
  return clean(input, 190).toLowerCase();
}

function splitDomain(domainName) {
  const parts = normalizeDomain(domainName).split(".").filter(Boolean);
  if (parts.length < 2) return { sld: "", tld: "" };
  return {
    sld: parts.shift(),
    tld: parts.join("."),
  };
}

function parseAttrs(input) {
  const out = {};
  const text = String(input || "");
  const re = /([A-Za-z0-9:_-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) {
    out[m[1]] = m[2];
  }
  return out;
}

function parseErrors(xml) {
  const errors = [];
  const re = /<Error\b[^>]*>([\s\S]*?)<\/Error>/gi;
  let m;
  while ((m = re.exec(String(xml || "")))) {
    const message = clean(m[1], 500);
    if (message) errors.push(message);
  }
  return errors;
}

function parseDomainCheckResults(xml) {
  const out = [];
  const text = String(xml || "");
  const re = /<DomainCheckResult\b([^>]*)\/?>/gi;
  let m;
  while ((m = re.exec(text))) {
    const attrs = parseAttrs(m[1]);
    const domainName = clean(attrs.Domain, 190).toLowerCase();
    if (!domainName) continue;
    const available = String(attrs.Available || "").toLowerCase() === "true";
    out.push({
      domainName,
      available,
      reason: available ? "available" : "unavailable",
    });
  }
  return out;
}

function parseCreateResult(xml) {
  const text = String(xml || "");
  const nodeMatch = text.match(/<DomainCreateResult\b([^>]*)>/i);
  if (!nodeMatch) return null;
  const attrs = parseAttrs(nodeMatch[1]);
  const chargedAmount = Number(attrs.ChargedAmount || 0);
  const amountMinor = Number.isFinite(chargedAmount) ? Math.round(chargedAmount * 100) : null;
  return {
    domainName: clean(attrs.Domain, 190).toLowerCase(),
    registered: String(attrs.Registered || "").toLowerCase() === "true",
    orderId: clean(attrs.OrderID, 120),
    transactionId: clean(attrs.TransactionID, 120),
    chargedAmount,
    amountMinor,
    currency: "USD",
  };
}

function endpoint() {
  const sandbox = boolEnv("NAMECHEAP_USE_SANDBOX", true);
  return sandbox ? "https://api.sandbox.namecheap.com/xml.response" : "https://api.namecheap.com/xml.response";
}

async function callNamecheap(command, extraParams) {
  const params = new URLSearchParams({
    ApiUser: required("NAMECHEAP_API_USER"),
    ApiKey: required("NAMECHEAP_API_KEY"),
    UserName: required("NAMECHEAP_USERNAME"),
    ClientIp: required("NAMECHEAP_CLIENT_IP"),
    Command: command,
    ...extraParams,
  });

  const res = await fetch(`${endpoint()}?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/xml,text/xml",
    },
  });

  const xml = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Namecheap API failed (${res.status})`);
  }

  const errors = parseErrors(xml);
  if (errors.length) throw new Error(`Namecheap: ${errors.join("; ")}`);

  return xml;
}

function contactPayload() {
  return {
    RegistrantFirstName: required("NAMECHEAP_CONTACT_FIRST_NAME"),
    RegistrantLastName: required("NAMECHEAP_CONTACT_LAST_NAME"),
    RegistrantAddress1: required("NAMECHEAP_CONTACT_ADDRESS1"),
    RegistrantCity: required("NAMECHEAP_CONTACT_CITY"),
    RegistrantStateProvince: required("NAMECHEAP_CONTACT_STATE"),
    RegistrantPostalCode: required("NAMECHEAP_CONTACT_POSTAL_CODE"),
    RegistrantCountry: required("NAMECHEAP_CONTACT_COUNTRY"),
    RegistrantPhone: required("NAMECHEAP_CONTACT_PHONE"),
    RegistrantEmailAddress: required("NAMECHEAP_CONTACT_EMAIL"),
    TechFirstName: required("NAMECHEAP_CONTACT_FIRST_NAME"),
    TechLastName: required("NAMECHEAP_CONTACT_LAST_NAME"),
    TechAddress1: required("NAMECHEAP_CONTACT_ADDRESS1"),
    TechCity: required("NAMECHEAP_CONTACT_CITY"),
    TechStateProvince: required("NAMECHEAP_CONTACT_STATE"),
    TechPostalCode: required("NAMECHEAP_CONTACT_POSTAL_CODE"),
    TechCountry: required("NAMECHEAP_CONTACT_COUNTRY"),
    TechPhone: required("NAMECHEAP_CONTACT_PHONE"),
    TechEmailAddress: required("NAMECHEAP_CONTACT_EMAIL"),
    AdminFirstName: required("NAMECHEAP_CONTACT_FIRST_NAME"),
    AdminLastName: required("NAMECHEAP_CONTACT_LAST_NAME"),
    AdminAddress1: required("NAMECHEAP_CONTACT_ADDRESS1"),
    AdminCity: required("NAMECHEAP_CONTACT_CITY"),
    AdminStateProvince: required("NAMECHEAP_CONTACT_STATE"),
    AdminPostalCode: required("NAMECHEAP_CONTACT_POSTAL_CODE"),
    AdminCountry: required("NAMECHEAP_CONTACT_COUNTRY"),
    AdminPhone: required("NAMECHEAP_CONTACT_PHONE"),
    AdminEmailAddress: required("NAMECHEAP_CONTACT_EMAIL"),
    AuxBillingFirstName: required("NAMECHEAP_CONTACT_FIRST_NAME"),
    AuxBillingLastName: required("NAMECHEAP_CONTACT_LAST_NAME"),
    AuxBillingAddress1: required("NAMECHEAP_CONTACT_ADDRESS1"),
    AuxBillingCity: required("NAMECHEAP_CONTACT_CITY"),
    AuxBillingStateProvince: required("NAMECHEAP_CONTACT_STATE"),
    AuxBillingPostalCode: required("NAMECHEAP_CONTACT_POSTAL_CODE"),
    AuxBillingCountry: required("NAMECHEAP_CONTACT_COUNTRY"),
    AuxBillingPhone: required("NAMECHEAP_CONTACT_PHONE"),
    AuxBillingEmailAddress: required("NAMECHEAP_CONTACT_EMAIL"),
  };
}

async function checkAvailability(input) {
  const domainName = normalizeDomain(input && input.domainName);
  const xml = await callNamecheap("namecheap.domains.check", {
    DomainList: domainName,
  });
  const results = parseDomainCheckResults(xml);
  const item = results.find((x) => x.domainName === domainName) || {
    domainName,
    available: false,
    reason: "unknown",
  };
  return {
    provider: "namecheap",
    domainName: item.domainName,
    available: item.available,
    reason: item.reason,
    raw: null,
  };
}

async function checkAvailabilityMany(input) {
  const domainNames = Array.isArray(input && input.domainNames) ? input.domainNames : [];
  const cleaned = domainNames.map((x) => normalizeDomain(x)).filter(Boolean).slice(0, 20);
  if (!cleaned.length) return [];

  const xml = await callNamecheap("namecheap.domains.check", {
    DomainList: cleaned.join(","),
  });

  const parsed = parseDomainCheckResults(xml);
  const byName = new Map(parsed.map((x) => [x.domainName, x]));
  return cleaned.map((name) => {
    const item = byName.get(name) || { domainName: name, available: false, reason: "unknown" };
    return {
      provider: "namecheap",
      domainName: item.domainName,
      available: item.available,
      reason: item.reason,
      raw: null,
    };
  });
}

async function registerDomain(input) {
  const domainName = normalizeDomain(input && input.domainName);
  const years = Math.max(1, Math.min(Number(input && input.years) || 1, 10));
  const parts = splitDomain(domainName);
  if (!parts.sld || !parts.tld) throw new Error("Invalid domain name");

  const availability = await checkAvailability({ domainName });
  if (!availability.available) {
    return {
      provider: "namecheap",
      domainName,
      success: false,
      orderId: "",
      amountMinor: null,
      currency: "USD",
      reason: "unavailable",
      raw: null,
    };
  }

  const xml = await callNamecheap("namecheap.domains.create", {
    DomainName: parts.sld,
    TLD: parts.tld,
    Years: String(years),
    ...contactPayload(),
  });

  const result = parseCreateResult(xml);
  if (!result || !result.registered) {
    return {
      provider: "namecheap",
      domainName,
      success: false,
      orderId: result ? result.orderId : "",
      amountMinor: result ? result.amountMinor : null,
      currency: "USD",
      reason: "registration_failed",
      raw: null,
    };
  }

  return {
    provider: "namecheap",
    domainName: result.domainName || domainName,
    success: true,
    orderId: result.orderId,
    amountMinor: result.amountMinor,
    currency: "USD",
    reason: "registered",
    raw: null,
  };
}

module.exports = {
  checkAvailability,
  checkAvailabilityMany,
  registerDomain,
};
