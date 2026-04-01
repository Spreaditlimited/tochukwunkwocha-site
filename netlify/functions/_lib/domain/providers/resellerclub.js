function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function required(name) {
  const value = clean(process.env[name], 500);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function boolEnv(name, fallback) {
  const raw = clean(process.env[name], 16).toLowerCase();
  if (!raw) return Boolean(fallback);
  return raw === "1" || raw === "true" || raw === "yes";
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

function apiBaseUrl() {
  const explicit = clean(process.env.RESCLUB_API_BASE_URL, 300);
  if (explicit) return explicit.replace(/\/+$/, "");
  return boolEnv("RESCLUB_USE_TEST", false) ? "https://test.httpapi.com" : "https://httpapi.com";
}

function authParams() {
  return {
    "auth-userid": required("RESCLUB_AUTH_USERID"),
    "api-key": required("RESCLUB_API_KEY"),
  };
}

function firstTruthy(values) {
  for (const value of values) {
    const out = clean(value, 200);
    if (out) return out;
  }
  return "";
}

function nsPair() {
  const ns1 = firstTruthy([process.env.RESCLUB_NS1, process.env.RESCLUB_NAMESERVER_1]);
  const ns2 = firstTruthy([process.env.RESCLUB_NS2, process.env.RESCLUB_NAMESERVER_2]);
  if (!ns1 || !ns2) {
    throw new Error("Missing RESCLUB_NS1 and RESCLUB_NS2");
  }
  return [ns1, ns2];
}

function contactIds() {
  const customerId = required("RESCLUB_CUSTOMER_ID");
  const reg = firstTruthy([process.env.RESCLUB_REG_CONTACT_ID, process.env.RESCLUB_CONTACT_ID]);
  const admin = firstTruthy([process.env.RESCLUB_ADMIN_CONTACT_ID, process.env.RESCLUB_CONTACT_ID, reg]);
  const tech = firstTruthy([process.env.RESCLUB_TECH_CONTACT_ID, process.env.RESCLUB_CONTACT_ID, reg]);
  const billing = firstTruthy([process.env.RESCLUB_BILLING_CONTACT_ID, process.env.RESCLUB_CONTACT_ID, reg]);
  if (!reg || !admin || !tech || !billing) {
    throw new Error(
      "Missing contact ids. Set RESCLUB_CONTACT_ID or all of RESCLUB_REG_CONTACT_ID, RESCLUB_ADMIN_CONTACT_ID, RESCLUB_TECH_CONTACT_ID, RESCLUB_BILLING_CONTACT_ID."
    );
  }
  return { customerId, reg, admin, tech, billing };
}

function errorFromJson(json) {
  if (!json) return "";
  if (typeof json === "string") return clean(json, 400);
  if (Array.isArray(json)) {
    for (const item of json) {
      const e = errorFromJson(item);
      if (e) return e;
    }
    return "";
  }
  const keys = ["message", "error", "description", "msg", "error_desc", "statusdescription"];
  for (const key of keys) {
    const value = clean(json[key], 400);
    if (value) return value;
  }
  return "";
}

function isAvailableValue(value) {
  const s = clean(value, 120).toLowerCase();
  if (!s) return null;
  if (s.includes("regthroughothers")) return false;
  if (s.includes("unavailable")) return false;
  if (s.includes("available")) return true;
  if (s === "true") return true;
  if (s === "false") return false;
  return null;
}

function parseAvailabilityFromPayload(domainName, payload) {
  const normalized = normalizeDomain(domainName);
  if (!payload) return null;

  if (typeof payload === "string") {
    const bool = isAvailableValue(payload);
    if (bool !== null) return bool;
    return null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const parsed = parseAvailabilityFromPayload(normalized, item);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  if (typeof payload === "object") {
    if (Object.prototype.hasOwnProperty.call(payload, normalized)) {
      return parseAvailabilityFromPayload(normalized, payload[normalized]);
    }

    if (payload.status !== undefined) {
      const bool = isAvailableValue(payload.status);
      if (bool !== null) return bool;
    }

    if (payload.available !== undefined) {
      if (typeof payload.available === "boolean") return payload.available;
      const bool = isAvailableValue(payload.available);
      if (bool !== null) return bool;
    }

    if (payload.domain && normalizeDomain(payload.domain) === normalized) {
      const fromStatus = parseAvailabilityFromPayload(normalized, payload.status);
      if (fromStatus !== null) return fromStatus;
    }

    for (const key of Object.keys(payload)) {
      const parsed = parseAvailabilityFromPayload(normalized, payload[key]);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function normalizeNsList(payload) {
  const candidates = []
    .concat(toArray(payload && payload.ns))
    .concat(toArray(payload && payload.nameservers))
    .concat(toArray(payload && payload.name_servers))
    .concat(toArray(payload && payload.nameServers));

  const cleanList = candidates
    .map((x) => clean(x, 190).toLowerCase())
    .filter(Boolean)
    .filter((x, idx, arr) => arr.indexOf(x) === idx);

  return cleanList;
}

function normalizeDnsRecords(payload) {
  const out = [];
  const seen = new Set();

  function pushRecord(item) {
    if (!item || typeof item !== "object") return;
    const host = clean(item.host || item.name || item.hostname, 190);
    const type = clean(item.type || item.record_type, 20).toUpperCase();
    const value = clean(item.value || item.data || item.address || item.content, 500);
    const ttlRaw = Number(item.ttl || item.ttl_secs || item.ttlSeconds || 3600);
    const ttl = Number.isFinite(ttlRaw) ? Math.max(60, Math.min(Math.round(ttlRaw), 86400)) : 3600;
    if (!host || !type || !value) return;
    const key = `${host}|${type}|${value}|${ttl}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ host, type, value, ttl });
  }

  const stack = [payload];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    if (Array.isArray(current)) {
      current.forEach((item) => stack.push(item));
      continue;
    }
    if (typeof current !== "object") continue;

    if (
      Object.prototype.hasOwnProperty.call(current, "host") ||
      Object.prototype.hasOwnProperty.call(current, "name")
    ) {
      pushRecord(current);
    }

    Object.keys(current).forEach((key) => {
      const value = current[key];
      if (value && typeof value === "object") stack.push(value);
    });
  }

  return out;
}

async function callApi(pathname, params, method) {
  const safeMethod = clean(method, 8).toUpperCase() || "GET";
  const base = apiBaseUrl();
  const qp = new URLSearchParams();
  const merged = { ...authParams(), ...(params || {}) };
  for (const [key, value] of Object.entries(merged)) {
    if (Array.isArray(value)) {
      value.forEach((item) => qp.append(key, String(item)));
    } else if (value !== undefined && value !== null && String(value) !== "") {
      qp.append(key, String(value));
    }
  }

  const url = `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  const requestUrl = safeMethod === "GET" ? `${url}?${qp.toString()}` : url;
  let res;
  try {
    res = await fetch(requestUrl, {
      method: safeMethod,
      headers: { Accept: "application/json" },
      ...(safeMethod === "GET"
        ? {}
        : {
            headers: {
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: qp.toString(),
          }),
    });
  } catch (_error) {
    throw new Error("Registrar provider is unreachable right now.");
  }

  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_error) {
    json = null;
  }

  if (!res.ok) {
    throw new Error(errorFromJson(json) || `ResellerClub API failed (${res.status})`);
  }

  if (json && typeof json.status === "string" && json.status.toLowerCase().includes("error")) {
    throw new Error(errorFromJson(json) || "ResellerClub API returned an error");
  }

  return json || {};
}

async function checkAvailability(input) {
  const domainName = normalizeDomain(input && input.domainName);
  const parts = splitDomain(domainName);
  if (!parts.sld || !parts.tld) throw new Error("Invalid domain name");

  const json = await callApi("/api/domains/available.json", {
    "domain-name": parts.sld,
    tlds: parts.tld,
  });

  const available = parseAvailabilityFromPayload(domainName, json);
  if (available === null) {
    throw new Error("Registrar availability response could not be verified.");
  }
  return {
    provider: "resellerclub",
    domainName,
    available: Boolean(available),
    reason: available ? "available" : "unavailable",
    raw: null,
  };
}

async function checkAvailabilityMany(input) {
  const names = Array.isArray(input && input.domainNames) ? input.domainNames : [];
  const checks = await Promise.all(
    names.map(async (name) => {
      try {
        return await checkAvailability({ domainName: name });
      } catch (_error) {
        const domainName = normalizeDomain(name);
        return {
          provider: "resellerclub",
          domainName,
          available: false,
          reason: "lookup_failed",
          raw: null,
        };
      }
    })
  );
  return checks;
}

async function registerDomain(input) {
  const domainName = normalizeDomain(input && input.domainName);
  const years = Math.max(1, Math.min(Number(input && input.years) || 1, 10));
  const availability = await checkAvailability({ domainName });
  if (!availability.available) {
    return {
      provider: "resellerclub",
      domainName,
      success: false,
      orderId: "",
      amountMinor: null,
      currency: "USD",
      reason: "unavailable",
      raw: null,
    };
  }

  const ids = contactIds();
  const [ns1, ns2] = nsPair();
  const json = await callApi(
    "/api/domains/register.json",
    {
      "domain-name": domainName,
      years,
      ns: [ns1, ns2],
      "customer-id": ids.customerId,
      "reg-contact-id": ids.reg,
      "admin-contact-id": ids.admin,
      "tech-contact-id": ids.tech,
      "billing-contact-id": ids.billing,
      "invoice-option": clean(process.env.RESCLUB_INVOICE_OPTION, 60) || "KeepInvoice",
      "discount-amount": clean(process.env.RESCLUB_DISCOUNT_AMOUNT, 40) || "0.0",
    },
    "POST"
  );

  const orderId = firstTruthy([json && json.entityid, json && json.orderid, json && json.actiontypedesc]);
  return {
    provider: "resellerclub",
    domainName,
    success: true,
    orderId,
    amountMinor: null,
    currency: "USD",
    reason: "registered",
    raw: null,
  };
}

async function getDnsZone(input) {
  const domainName = normalizeDomain(input && input.domainName);
  if (!domainName) throw new Error("Invalid domain name");

  const nsJson = await callApi("/api/dns/retrieve-ns.json", {
    "domain-name": domainName,
  });
  const recordJson = await callApi("/api/dns/retrieve-records.json", {
    "domain-name": domainName,
  });

  const nameservers = normalizeNsList(nsJson);
  const records = normalizeDnsRecords(recordJson);
  return {
    provider: "resellerclub",
    domainName,
    nameservers,
    records,
  };
}

async function updateNameservers(input) {
  const domainName = normalizeDomain(input && input.domainName);
  const nameservers = toArray(input && input.nameservers)
    .map((x) => clean(x, 190).toLowerCase())
    .filter(Boolean)
    .slice(0, 6);
  if (!domainName) throw new Error("Invalid domain name");
  if (nameservers.length < 2) throw new Error("Provide at least two nameservers.");

  await callApi(
    "/api/dns/manage-ns.json",
    {
      "domain-name": domainName,
      ns: nameservers,
    },
    "POST"
  );
  return {
    provider: "resellerclub",
    domainName,
    nameservers,
    success: true,
  };
}

async function updateDnsRecords(input) {
  const domainName = normalizeDomain(input && input.domainName);
  const recordsIn = Array.isArray(input && input.records) ? input.records : [];
  if (!domainName) throw new Error("Invalid domain name");

  const records = recordsIn
    .map((item) => ({
      host: clean(item && item.host, 190),
      type: clean(item && item.type, 20).toUpperCase(),
      value: clean(item && item.value, 500),
      ttl: Math.max(60, Math.min(Number(item && item.ttl) || 3600, 86400)),
    }))
    .filter((item) => item.host && item.type && item.value)
    .slice(0, 60);

  if (!records.length) throw new Error("Provide at least one DNS record.");

  await callApi(
    "/api/dns/manage-records.json",
    {
      "domain-name": domainName,
      host: records.map((r) => r.host),
      type: records.map((r) => r.type),
      value: records.map((r) => r.value),
      ttl: records.map((r) => String(r.ttl)),
    },
    "POST"
  );

  return {
    provider: "resellerclub",
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
