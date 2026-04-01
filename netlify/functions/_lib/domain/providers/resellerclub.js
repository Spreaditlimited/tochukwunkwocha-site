function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function required(name) {
  const value = clean(process.env[name], 500);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function firstEnv(names, max) {
  for (const name of names) {
    const value = clean(process.env[name], max);
    if (value) return value;
  }
  return "";
}

function optionalAny(names, max) {
  return firstEnv(names, max || 500);
}

function requiredAny(names, label) {
  const value = firstEnv(names, 500);
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

function boolEnv(name, fallback) {
  const raw = clean(process.env[name], 16).toLowerCase();
  if (!raw) return Boolean(fallback);
  return raw === "1" || raw === "true" || raw === "yes";
}

function boolEnvAny(names, fallback) {
  for (const name of names) {
    const raw = clean(process.env[name], 16).toLowerCase();
    if (!raw) continue;
    return raw === "1" || raw === "true" || raw === "yes";
  }
  return Boolean(fallback);
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

function parseJsonMapEnv(name) {
  const raw = clean(process.env[name], 4000);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return {};
  } catch (_error) {
    return {};
  }
}

function proxyEndpoint() {
  return optionalAny(["RESCLUB_PROXY_BASE_URL", "RESELLERCLUB_PROXY_BASE_URL"], 500).replace(/\/+$/, "");
}

function proxyToken() {
  return optionalAny(["RESCLUB_PROXY_TOKEN", "RESELLERCLUB_PROXY_TOKEN"], 500);
}

function apiBaseUrl() {
  const explicit = firstEnv(["RESCLUB_API_BASE_URL", "RESELLERCLUB_API_BASE_URL"], 300);
  if (explicit) return explicit.replace(/\/+$/, "");
  return boolEnvAny(["RESCLUB_USE_TEST", "RESELLERCLUB_USE_TEST"], true)
    ? "https://test.httpapi.com"
    : "https://httpapi.com";
}

function authParams() {
  return {
    "auth-userid": requiredAny(["RESCLUB_AUTH_USERID", "RESELLERCLUB_RESELLER_ID"], "RESCLUB_AUTH_USERID / RESELLERCLUB_RESELLER_ID"),
    "api-key": requiredAny(["RESCLUB_API_KEY", "RESELLERCLUB_API_KEY"], "RESCLUB_API_KEY / RESELLERCLUB_API_KEY"),
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
  const ns1 = firstTruthy([
    process.env.RESCLUB_NS1,
    process.env.RESCLUB_NAMESERVER_1,
    process.env.RESELLERCLUB_NS1,
    process.env.RESELLERCLUB_NAMESERVER_1,
  ]);
  const ns2 = firstTruthy([
    process.env.RESCLUB_NS2,
    process.env.RESCLUB_NAMESERVER_2,
    process.env.RESELLERCLUB_NS2,
    process.env.RESELLERCLUB_NAMESERVER_2,
  ]);
  if (!ns1 || !ns2) {
    throw new Error("Missing RESCLUB_NS1/RESELLERCLUB_NS1 and RESCLUB_NS2/RESELLERCLUB_NS2");
  }
  return [ns1, ns2];
}

function contactIds() {
  const customerId = requiredAny(["RESCLUB_CUSTOMER_ID", "RESELLERCLUB_CUSTOMER_ID"], "RESCLUB_CUSTOMER_ID / RESELLERCLUB_CUSTOMER_ID");
  const reg = firstTruthy([
    process.env.RESCLUB_REG_CONTACT_ID,
    process.env.RESELLERCLUB_REG_CONTACT_ID,
    process.env.RESCLUB_CONTACT_ID,
    process.env.RESELLERCLUB_CONTACT_ID,
  ]);
  const admin = firstTruthy([
    process.env.RESCLUB_ADMIN_CONTACT_ID,
    process.env.RESELLERCLUB_ADMIN_CONTACT_ID,
    process.env.RESCLUB_CONTACT_ID,
    process.env.RESELLERCLUB_CONTACT_ID,
    reg,
  ]);
  const tech = firstTruthy([
    process.env.RESCLUB_TECH_CONTACT_ID,
    process.env.RESELLERCLUB_TECH_CONTACT_ID,
    process.env.RESCLUB_CONTACT_ID,
    process.env.RESELLERCLUB_CONTACT_ID,
    reg,
  ]);
  const billing = firstTruthy([
    process.env.RESCLUB_BILLING_CONTACT_ID,
    process.env.RESELLERCLUB_BILLING_CONTACT_ID,
    process.env.RESCLUB_CONTACT_ID,
    process.env.RESELLERCLUB_CONTACT_ID,
    reg,
  ]);
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

function normalizeCurrencyCode(input) {
  const raw = clean(input, 40);
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) return upper;
  if (upper === "NAIRA" || upper === "NIGERIAN NAIRA" || raw === "₦") return "NGN";
  if (raw === "$" || upper === "USDOLLAR") return "USD";
  if (raw === "£") return "GBP";
  if (raw === "€") return "EUR";
  if (raw === "₹") return "INR";
  return "";
}

function normalizeMoneyMinor(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100);
}

function tldToProductKey(tld) {
  const cleanTld = clean(tld, 80).toLowerCase().replace(/^\.+/, "");
  if (!cleanTld) return "";

  const customMap = parseJsonMapEnv("RESCLUB_DOMAIN_PRODUCT_KEYS_JSON");
  const customKey = clean(customMap[cleanTld], 120);
  if (customKey) return customKey;

  const fallbackMap = {
    com: "domcno",
    net: "domnet",
    org: "domorg",
    io: "domio",
    co: "domco",
  };
  return clean(fallbackMap[cleanTld], 120);
}

function valueHasToken(value, token) {
  const text = clean(value, 600).toLowerCase();
  if (!text || !token) return false;
  const t = token.toLowerCase();
  return (
    text.includes(`.${t}`) ||
    text.includes(` ${t} `) ||
    text.includes(`(${t})`) ||
    text.includes(`-${t}`) ||
    text.includes(`${t}-`) ||
    text === t
  );
}

function objectContainsTldHint(value, tld) {
  if (!value || typeof value !== "object") return false;
  const stack = [value];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const [k, v] of Object.entries(current)) {
      if (valueHasToken(k, tld) || valueHasToken(v, tld)) return true;
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return false;
}

function pickYearPrice(pricingMap, years) {
  const wantedYears = Math.max(1, Math.min(Number(years) || 1, 10));
  if (!pricingMap || typeof pricingMap !== "object") return null;
  const direct = normalizeMoneyMinor(pricingMap[String(wantedYears)]);
  if (direct !== null) return direct;
  const oneYear = normalizeMoneyMinor(pricingMap["1"]);
  if (oneYear !== null) return oneYear * wantedYears;
  return null;
}

function extractAddNewPricingBlock(product) {
  if (!product) return null;

  if (product && typeof product === "object" && !Array.isArray(product)) {
    if (product.addnewdomain && typeof product.addnewdomain === "object") {
      return product.addnewdomain;
    }
    if (product.pricing && product.pricing.addnewdomain && typeof product.pricing.addnewdomain === "object") {
      return product.pricing.addnewdomain;
    }

    for (const value of Object.values(product)) {
      if (!value || typeof value !== "object") continue;
      if (value.addnewdomain && typeof value.addnewdomain === "object") return value.addnewdomain;
      if (value.pricing && value.pricing.addnewdomain && typeof value.pricing.addnewdomain === "object") {
        return value.pricing.addnewdomain;
      }
    }
  }

  if (Array.isArray(product)) {
    for (const item of product) {
      const extracted = extractAddNewPricingBlock(item);
      if (extracted) return extracted;
    }
  }

  return null;
}

function resolveProductForTld(pricingJson, tld) {
  const safeTld = clean(tld, 80).toLowerCase().replace(/^\.+/, "");
  if (!pricingJson || typeof pricingJson !== "object") return { key: "", product: null };

  const mappedKey = tldToProductKey(safeTld);
  if (mappedKey && pricingJson[mappedKey] && typeof pricingJson[mappedKey] === "object") {
    return { key: mappedKey, product: pricingJson[mappedKey] };
  }

  const entries = Object.entries(pricingJson);

  // Pass 1: key/name hints + addnewdomain present
  for (const [key, product] of entries) {
    if (!product || typeof product !== "object") continue;
    const addBlock = extractAddNewPricingBlock(product);
    if (!addBlock) continue;
    if (valueHasToken(key, safeTld) || objectContainsTldHint(product, safeTld)) {
      return { key, product };
    }
  }

  // Pass 2: any product that has addnewdomain and a direct TLD key in pricing map
  for (const [key, product] of entries) {
    if (!product || typeof product !== "object") continue;
    const addBlock = extractAddNewPricingBlock(product);
    if (!addBlock) continue;
    if (Object.prototype.hasOwnProperty.call(addBlock, "1")) {
      // last-resort candidate only if key somewhat resembles domain family
      if (key.toLowerCase().startsWith("dom")) return { key, product };
    }
  }

  return { key: mappedKey || "", product: null };
}

function collectPricingKeys(pricingJson) {
  if (!pricingJson || typeof pricingJson !== "object") return [];
  return Object.keys(pricingJson)
    .filter((k) => k && typeof pricingJson[k] === "object")
    .slice(0, 80);
}

function pricingDebugSnippet(pricingJson) {
  if (pricingJson === null) return "null";
  if (pricingJson === undefined) return "undefined";
  const type = Array.isArray(pricingJson) ? "array" : typeof pricingJson;
  let snippet = "";
  try {
    snippet = clean(JSON.stringify(pricingJson), 1200);
  } catch (_error) {
    snippet = clean(String(pricingJson), 1200);
  }
  return `type=${type}; payload=${snippet || "<empty>"}`;
}

function extractCurrencyFromResellerDetails(json) {
  const queue = [json];
  const seen = new Set();
  const collected = [];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (seen.has(current)) continue;
    seen.add(current);
    collected.push(current);
    Object.values(current).forEach((value) => {
      if (value && typeof value === "object") queue.push(value);
    });
  }

  const candidates = [
    ...collected.flatMap((obj) => [
      obj && obj.sellingcurrency,
      obj && obj.selling_currency,
      obj && obj.sellingcurrencyname,
      obj && obj.selling_currency_name,
      obj && obj.sellingcurrencysymbol,
      obj && obj.selling_currency_symbol,
      obj && obj.currencysymbol,
      obj && obj.currency_symbol,
      obj && obj.currency,
      obj && obj.defaultcurrency,
      obj && obj.currencyname,
      obj && obj.currency_name,
    ]),
  ];
  for (const candidate of candidates) {
    const code = normalizeCurrencyCode(candidate);
    if (code) return code;
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
  const proxyBase = proxyEndpoint();
  const qp = new URLSearchParams();
  const merged = { ...authParams(), ...(params || {}) };
  for (const [key, value] of Object.entries(merged)) {
    if (Array.isArray(value)) {
      value.forEach((item) => qp.append(key, String(item)));
    } else if (value !== undefined && value !== null && String(value) !== "") {
      qp.append(key, String(value));
    }
  }

  if (proxyBase) {
    const proxyUrl = proxyBase;
    const token = proxyToken();
    let proxyRes;
    try {
      proxyRes = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          pathname: pathname.startsWith("/") ? pathname : `/${pathname}`,
          method: safeMethod,
          params: merged,
          baseUrl: base,
        }),
      });
    } catch (_error) {
      console.error("[resellerclub] proxy_network_error", {
        endpoint: pathname,
        method: safeMethod,
        proxyUrl,
      });
      throw new Error("Registrar proxy is unreachable right now.");
    }

    const proxyText = await proxyRes.text().catch(() => "");
    let proxyJson = null;
    try {
      proxyJson = proxyText ? JSON.parse(proxyText) : null;
    } catch (_error) {
      proxyJson = null;
    }

    if (!proxyRes.ok) {
      const providerMessage = errorFromJson(proxyJson) || clean(proxyText, 400);
      console.error("[resellerclub] proxy_http_error", {
        endpoint: pathname,
        method: safeMethod,
        status: proxyRes.status,
        providerMessage: providerMessage,
      });
      throw new Error(providerMessage || `Registrar proxy failed (${proxyRes.status})`);
    }

    if (proxyJson && typeof proxyJson === "object" && Object.prototype.hasOwnProperty.call(proxyJson, "data")) {
      return proxyJson.data || {};
    }
    return proxyJson || {};
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
    console.error("[resellerclub] network_error", {
      endpoint: pathname,
      method: safeMethod,
      base: base,
    });
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
    const providerMessage = errorFromJson(json) || "";
    console.error("[resellerclub] http_error", {
      endpoint: pathname,
      method: safeMethod,
      status: res.status,
      providerMessage: providerMessage,
      rawBody: clean(text, 1200),
    });
    throw new Error(providerMessage || `ResellerClub API failed (${res.status})`);
  }

  if (json && typeof json.status === "string" && json.status.toLowerCase().includes("error")) {
    const providerMessage = errorFromJson(json) || "ResellerClub API returned an error";
    console.error("[resellerclub] api_error_status", {
      endpoint: pathname,
      method: safeMethod,
      providerMessage: providerMessage,
      payload: json,
    });
    throw new Error(providerMessage);
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
      "invoice-option": firstEnv(["RESCLUB_INVOICE_OPTION", "RESELLERCLUB_INVOICE_OPTION"], 60) || "KeepInvoice",
      "discount-amount": firstEnv(["RESCLUB_DISCOUNT_AMOUNT", "RESELLERCLUB_DISCOUNT_AMOUNT"], 40) || "0.0",
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

async function getRegistrationPrice(input) {
  const domainName = normalizeDomain(input && input.domainName);
  const years = Math.max(1, Math.min(Number(input && input.years) || 1, 10));
  const parts = splitDomain(domainName);
  if (!parts.sld || !parts.tld) throw new Error("Invalid domain name");

  const preferredKey = tldToProductKey(parts.tld);
  if (!preferredKey) {
    throw new Error(`Pricing lookup is not configured for .${parts.tld} yet.`);
  }

  const pricingJson = await callApi("/api/products/reseller-price.json", {});
  const resolved = resolveProductForTld(pricingJson, parts.tld);
  const product = resolved.product;
  const productKey = resolved.key || preferredKey;
  if (!product || typeof product !== "object") {
    const keys = collectPricingKeys(pricingJson);
    const keysSnippet = keys.length ? ` Available keys: ${keys.join(", ")}` : " Available keys: <none>";
    const debug = pricingDebugSnippet(pricingJson);
    throw new Error(`Could not find pricing for ${parts.tld} domains on ResellerClub.${keysSnippet} ${debug}`);
  }

  const addNewPricing = extractAddNewPricingBlock(product) || product.add_new_domain || {};
  const amountMinor = pickYearPrice(addNewPricing, years);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    console.error("[resellerclub] pricing_parse_failed", {
      domainName,
      years,
      tld: parts.tld,
      productKey,
      productSample: clean(JSON.stringify(product), 1200),
    });
    throw new Error(`Could not determine registration price for ${domainName}.`);
  }

  const detailsJson = await callApi("/api/resellers/details.json", {});
  const currency = extractCurrencyFromResellerDetails(detailsJson);
  if (!currency) {
    throw new Error("Could not determine selling currency from ResellerClub.");
  }

  return {
    provider: "resellerclub",
    domainName,
    years,
    productKey,
    amountMinor,
    currency,
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
  getRegistrationPrice,
  getDnsZone,
  updateNameservers,
  updateDnsRecords,
};
