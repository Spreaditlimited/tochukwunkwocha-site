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
  if (explicit) {
    const normalized = explicit.replace(/\/+$/, "");
    if (normalized.includes("test.httpapi.com")) {
      throw new Error("ResellerClub test API is disabled. Use live API base URL.");
    }
    return normalized;
  }
  if (boolEnvAny(["RESCLUB_USE_TEST", "RESELLERCLUB_USE_TEST"], false)) {
    throw new Error("ResellerClub test mode is disabled. Use live API.");
  }
  return "https://httpapi.com";
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

function looksLikeOrderId(value) {
  return /^[0-9]{2,}$/.test(clean(value, 120));
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

function splitFullName(input) {
  const full = clean(input, 180);
  if (!full) return { firstName: "Domain", lastName: "Customer", fullName: "Domain Customer" };
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0], fullName: full };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
    fullName: full,
  };
}

function registrantProfile(input) {
  const email = clean(input && input.email, 190).toLowerCase();
  if (!email) throw new Error("Buyer email is required for ResellerClub registration.");
  const name = splitFullName(input && input.fullName);
  const address1 = clean(input && input.registrantAddress1, 240);
  const city = clean(input && input.registrantCity, 120);
  const state = clean(input && input.registrantState, 120);
  const country = clean(input && input.registrantCountry, 120);
  const postalCode = clean(input && input.registrantPostalCode, 40);
  const phone = clean(input && input.registrantPhone, 50);
  const phoneCc = clean(input && input.registrantPhoneCc, 10);
  if (!address1 || !city || !state || !country || !postalCode || !phone || !phoneCc) {
    throw new Error(
      "Registrant profile is incomplete. Address, city, state, country, postal code, phone, and phone country code are required."
    );
  }
  return {
    fullName: name.fullName,
    firstName: name.firstName,
    lastName: name.lastName,
    email,
    company: clean(process.env.RESCLUB_CONTACT_COMPANY || process.env.RESELLERCLUB_CONTACT_COMPANY, 120) || name.fullName,
    address1,
    city,
    state,
    country,
    postalCode,
    phoneCc,
    phone,
    usernamePrefix: clean(
      process.env.RESCLUB_CUSTOMER_USERNAME_PREFIX || process.env.RESELLERCLUB_CUSTOMER_USERNAME_PREFIX,
      40
    ) || "tncust",
  };
}

function sanitizeUsernameToken(value) {
  return clean(value, 60).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function looksLikeId(value) {
  const text = clean(value, 120);
  return /^[0-9]{2,}$/.test(text);
}

function findAnyId(value, depth) {
  if (depth > 6 || value === null || value === undefined) return "";
  if (looksLikeId(value)) return clean(value, 120);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAnyId(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") {
    const preferredKeys = ["entityid", "contactid", "contact_id", "id", "customerid", "customer_id"];
    for (const key of preferredKeys) {
      const found = findAnyId(value[key], depth + 1);
      if (found) return found;
    }
    for (const key of Object.keys(value)) {
      const found = findAnyId(value[key], depth + 1);
      if (found) return found;
    }
  }
  return "";
}

function generatedUsername(profile) {
  const emailRaw = clean((profile && profile.email) || "", 190).toLowerCase();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw);
  if (emailLooksValid) return emailRaw;
  const emailPart = sanitizeUsernameToken(emailRaw).slice(0, 20) || "buyer";
  const suffix = Date.now().toString(36).slice(-8);
  const prefix = sanitizeUsernameToken((profile && profile.usernamePrefix) || "tncust").slice(0, 12) || "tncust";
  return `${prefix}${emailPart}${suffix}@example.com`.slice(0, 64);
}

function generatedPassword() {
  const raw = Math.random().toString(36).slice(2, 10);
  return `${raw}Aa9!`;
}

async function createRuntimeCustomer(profile) {
  const username = generatedUsername(profile);
  const passwd = generatedPassword();
  try {
    const json = await callApi(
      "/api/customers/signup.json",
      {
        username,
        passwd,
        name: profile.fullName,
        company: profile.company,
        email: profile.email,
        "address-line-1": profile.address1,
        city: profile.city,
        state: profile.state,
        country: profile.country,
        zipcode: profile.postalCode,
        "phone-cc": profile.phoneCc,
        phone: profile.phone,
        "lang-pref": "en",
      },
      "POST"
    );
    const customerId = firstTruthy([json && json.customerid, json && json.customer_id, json && json.entityid, json && json.id]);
    if (!customerId) {
      throw new Error("Could not create ResellerClub customer for buyer.");
    }
    return customerId;
  } catch (error) {
    const message = clean(error && error.message, 1200);
    if (!/already a customer/i.test(message)) throw error;
    const existingId = await findRuntimeCustomerIdByUsername(username, profile && profile.email);
    if (!existingId) throw error;
    return existingId;
  }
}

async function findRuntimeCustomerIdByUsername(username, emailFallback) {
  const candidates = [clean(username, 190), clean(emailFallback, 190).toLowerCase()].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const details = await callApi("/api/customers/details.json", { username: candidate });
      const detailsId = firstTruthy([
        details && details.customerid,
        details && details.customer_id,
        details && details.entityid,
        details && details.id,
        details && details.customer && details.customer.customerid,
      ]);
      if (detailsId) return detailsId;
    } catch (_error) {
      // Try search endpoint fallback below.
    }
    try {
      const search = await callApi("/api/customers/search.json", {
        username: candidate,
        "no-of-records": 10,
        "page-no": 1,
      });
      const searchId = firstTruthy([
        search && search.customerid,
        search && search.customer_id,
        search && search.entityid,
        search && search.id,
        search && search.customer && search.customer.customerid,
        search &&
          Array.isArray(search.customer) &&
          search.customer[0] &&
          (search.customer[0].customerid || search.customer[0].customer_id || search.customer[0].id),
      ]);
      if (searchId) return searchId;
    } catch (_error) {}
  }
  return "";
}

async function createRuntimeContact(profile, customerId, contactType) {
  const json = await callApi(
    "/api/contacts/add.json",
    {
      "customer-id": customerId,
      type: contactType || "Contact",
      name: profile.fullName,
      company: profile.company,
      email: profile.email,
      "address-line-1": profile.address1,
      city: profile.city,
      state: profile.state,
      country: profile.country,
      zipcode: profile.postalCode,
      "phone-cc": profile.phoneCc,
      phone: profile.phone,
    },
    "POST"
  );
  const contactId = firstTruthy([
    json && json.entityid,
    json && json.contactid,
    json && json.contact_id,
    json && json.id,
    findAnyId(json, 0),
  ]);
  if (contactId) return contactId;
  const existingId = await findRuntimeContactId(customerId, profile && profile.email);
  if (existingId) return existingId;
  const apiError = errorFromJson(json);
  if (apiError) {
    throw new Error(`Could not create ResellerClub ${contactType || "contact"} profile. ${apiError}`);
  }
  throw new Error(`Could not create ResellerClub ${contactType || "contact"} profile.`);
}

async function findRuntimeContactId(customerId, email) {
  const custId = clean(customerId, 120);
  const addr = clean(email, 190).toLowerCase();
  if (!custId) return "";
  try {
    const search = await callApi("/api/contacts/search.json", {
      "customer-id": custId,
      email: addr || undefined,
      "no-of-records": 10,
      "page-no": 1,
    });
    return firstTruthy([
      search && search.entityid,
      search && search.contactid,
      search && search.contact_id,
      search && search.id,
      findAnyId(search, 0),
    ]);
  } catch (_error) {
    return "";
  }
}

async function resolveRegistrationIds(input) {
  const profile = registrantProfile(input || {});
  const customerId = await createRuntimeCustomer(profile);
  const contactId = await createRuntimeContact(profile, customerId, "Contact");
  const reg = contactId;
  const admin = contactId;
  const tech = contactId;
  const billing = contactId;
  return { customerId, reg, admin, tech, billing, mode: "runtime" };
}

function errorFromJson(json) {
  if (!json) return "";
  if (typeof json === "string") {
    const raw = clean(json, 1200);
    if (!raw) return "";
    try {
      const parsed = JSON.parse(raw);
      const nested = errorFromJson(parsed);
      if (nested) return nested;
    } catch (_error) {}
    return clean(raw, 400);
  }
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
  if (json && json.data) {
    const nested = errorFromJson(json.data);
    if (nested) return nested;
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
  return customKey;
}

function tldToProductKeys(tld) {
  const cleanTld = clean(tld, 80).toLowerCase().replace(/^\.+/, "");
  if (!cleanTld) return [];

  const customMap = parseJsonMapEnv("RESCLUB_DOMAIN_PRODUCT_KEYS_JSON");
  const customValue = customMap[cleanTld];
  const customKeys = Array.isArray(customValue) ? customValue : customValue ? [customValue] : [];
  const ordered = []
    .concat(customKeys)
    .concat(tldToProductKey(cleanTld) || [])
    .map((x) => clean(x, 120))
    .filter(Boolean);
  return ordered.filter((x, idx) => ordered.indexOf(x) === idx);
}

function serviceToProductKey(serviceCode) {
  const code = clean(serviceCode, 120).toLowerCase();
  if (!code) return "";
  if (code === "business_email") return "enterpriseemailus";
  const customMap = parseJsonMapEnv("RESCLUB_SERVICE_PRODUCT_KEYS_JSON");
  const customKey = clean(customMap[code], 120);
  if (customKey) return customKey;
  const fallbackMap = {
    business_email: "enterpriseemailus",
  };
  return clean(fallbackMap[code], 120);
}

function serviceToProductKeys(serviceCode) {
  const code = clean(serviceCode, 120).toLowerCase();
  if (!code) return [];
  if (code === "business_email") return ["enterpriseemailus", "gappsin"];

  const customMap = parseJsonMapEnv("RESCLUB_SERVICE_PRODUCT_KEYS_JSON");
  const customValue = customMap[code];
  const customKeys = Array.isArray(customValue) ? customValue : customValue ? [customValue] : [];

  const fallbackMap = {
    business_email: ["enterpriseemailus", "gappsin"],
  };
  const fallbackKeys = fallbackMap[code] || [];
  const ordered = []
    .concat(customKeys)
    .concat(serviceToProductKey(code) || [])
    .concat(fallbackKeys)
    .map((x) => clean(x, 120))
    .filter(Boolean);
  return ordered.filter((x, idx) => ordered.indexOf(x) === idx);
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

function normalizeMoneyMinorFlexible(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return value >= 1000 ? Math.round(value) : Math.round(value * 100);
  }
  const raw = clean(value, 120).replace(/[, ]/g, "");
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return num >= 1000 ? Math.round(num) : Math.round(num * 100);
}

function extractAnyPricingBlock(product) {
  if (!product || typeof product !== "object") return null;

  const directCandidates = [
    product.addnewdomain,
    product.add_new_domain,
    product.addnew,
    product.register,
    product.registration,
    product.renew,
    product.renewal,
    product.pricing && product.pricing.addnewdomain,
    product.pricing && product.pricing.add_new_domain,
    product.pricing && product.pricing.addnew,
    product.pricing && product.pricing.register,
    product.pricing && product.pricing.registration,
    product.pricing && product.pricing.renew,
    product.pricing && product.pricing.renewal,
  ];
  for (const candidate of directCandidates) {
    if (candidate && typeof candidate === "object") return candidate;
  }

  // Recursive fallback: find any nested object that looks like a pricing map.
  const stack = [product];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (seen.has(current)) continue;
    seen.add(current);
    const keys = Object.keys(current).map((k) => String(k || "").toLowerCase());
    const hasYearKey = keys.some((k) => k === "1" || k === "1y" || k === "1yr" || k === "1year");
    const hasPriceKey = keys.some((k) =>
      ["price", "sellingprice", "amount", "cost", "unitprice", "registration", "renewal", "monthly", "yearly"].includes(k)
    );
    if (hasYearKey || hasPriceKey) return current;

    Object.values(current).forEach((value) => {
      if (value && typeof value === "object") stack.push(value);
    });
  }
  return null;
}

function pickAmountMinorFromPricingBlock(block, years) {
  if (!block || typeof block !== "object") return null;
  const wantedYears = Math.max(1, Math.min(Number(years) || 1, 10));

  const yearKeys = [String(wantedYears), `${wantedYears}y`, `${wantedYears}yr`, `${wantedYears}year`, `${wantedYears}years`];
  for (const key of yearKeys) {
    if (Object.prototype.hasOwnProperty.call(block, key)) {
      const amount = normalizeMoneyMinorFlexible(block[key]);
      if (amount !== null) return amount;
    }
  }

  const oneYearKeys = ["1", "1y", "1yr", "1year", "1years"];
  for (const key of oneYearKeys) {
    if (Object.prototype.hasOwnProperty.call(block, key)) {
      const unit = normalizeMoneyMinorFlexible(block[key]);
      if (unit !== null) return unit * wantedYears;
    }
  }

  const monthlyKeys = ["monthly", "month", "1m", "1mo", "permonth", "pricepermonth"];
  for (const key of monthlyKeys) {
    if (Object.prototype.hasOwnProperty.call(block, key)) {
      const monthly = normalizeMoneyMinorFlexible(block[key]);
      if (monthly !== null) return monthly * 12 * wantedYears;
    }
  }

  const flatCandidates = ["price", "sellingprice", "amount", "cost", "base", "unitprice", "fee"];
  for (const key of flatCandidates) {
    if (Object.prototype.hasOwnProperty.call(block, key)) {
      const unit = normalizeMoneyMinorFlexible(block[key]);
      if (unit !== null) return unit * wantedYears;
    }
  }

  for (const value of Object.values(block)) {
    if (value && typeof value === "object") {
      const nested = pickAmountMinorFromPricingBlock(value, years);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function collectMoneyCandidatesFromBlock(block) {
  const out = [];
  const stack = [block];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current === undefined || current === null) continue;
    if (typeof current === "number" || typeof current === "string") {
      const minor = normalizeMoneyMinorFlexible(current);
      if (minor !== null) out.push(minor);
      continue;
    }
    if (typeof current !== "object") continue;
    if (seen.has(current)) continue;
    seen.add(current);
    Object.values(current).forEach((v) => {
      if (v !== undefined && v !== null) stack.push(v);
    });
  }
  return out;
}

function collectKeyedMoneyCandidates(value, trail) {
  const out = [];
  const stack = [{ node: value, path: String(trail || "").toLowerCase() }];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    const node = current.node;
    const path = String(current.path || "").toLowerCase();
    if (node === undefined || node === null) continue;
    if (typeof node === "number" || typeof node === "string") {
      const minor = normalizeMoneyMinorFlexible(node);
      if (minor !== null) out.push({ minor, path });
      continue;
    }
    if (typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);
    Object.entries(node).forEach(([k, v]) => {
      const p = path ? `${path}.${String(k || "").toLowerCase()}` : String(k || "").toLowerCase();
      stack.push({ node: v, path: p });
    });
  }
  return out;
}

function rangeStartValue(key) {
  const raw = String(key || "").toLowerCase();
  const m = raw.match(/(\d+)/);
  if (!m) return Number.POSITIVE_INFINITY;
  return Number(m[1]);
}

function firstEmailRange(emailRanges) {
  const entries = Object.entries(emailRanges || {}).filter(([, value]) => value && typeof value === "object");
  if (!entries.length) return null;
  entries.sort((a, b) => rangeStartValue(a[0]) - rangeStartValue(b[0]));
  return entries[0][1];
}

function pickFromTenureMap(map, months) {
  if (!map || typeof map !== "object") return null;
  const exact = normalizeMoneyMinorFlexible(map[String(months)]);
  if (exact !== null) return exact;
  const one = normalizeMoneyMinorFlexible(map["1"]);
  if (one !== null) return one;
  const numericKeys = Object.keys(map)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (!numericKeys.length) return null;
  return normalizeMoneyMinorFlexible(map[String(numericKeys[0])]);
}

function parseBusinessEmailAmountMinorStrict(product, years) {
  const months = Math.max(1, Math.min(Number(years) || 1, 10)) * 12;
  const root = product && typeof product === "object" ? product : null;
  const ranges =
    (root && root.email_account_ranges && typeof root.email_account_ranges === "object" && root.email_account_ranges) ||
    (root && root.pricing && root.pricing.email_account_ranges && typeof root.pricing.email_account_ranges === "object"
      ? root.pricing.email_account_ranges
      : null);
  if (!ranges) return null;

  const firstRange = firstEmailRange(ranges);
  if (!firstRange) return null;

  const addMap =
    (firstRange.add && typeof firstRange.add === "object" && firstRange.add) ||
    (firstRange.addnew && typeof firstRange.addnew === "object" && firstRange.addnew) ||
    (firstRange.registration && typeof firstRange.registration === "object" && firstRange.registration) ||
    null;
  const renewMap =
    (firstRange.renew && typeof firstRange.renew === "object" && firstRange.renew) ||
    (firstRange.renewal && typeof firstRange.renewal === "object" && firstRange.renewal) ||
    null;

  return pickFromTenureMap(addMap, months) || pickFromTenureMap(renewMap, months);
}

async function getProductsPricingCatalog() {
  const source = clean(process.env.RESCLUB_PRICE_SOURCE || process.env.RESELLERCLUB_PRICE_SOURCE || "customer", 20).toLowerCase();
  const customerId = clean(process.env.RESCLUB_CUSTOMER_ID || process.env.RESELLERCLUB_CUSTOMER_ID, 120);
  const customerParams = customerId ? { "customer-id": customerId } : {};
  if (source === "reseller") {
    return {
      endpoint: "/api/products/reseller-price.json",
      payload: await callApi("/api/products/reseller-price.json", {}),
    };
  }
  if (source !== "customer") {
    throw new Error(`Unsupported RESCLUB_PRICE_SOURCE: ${source}. Use 'customer' or 'reseller'.`);
  }
  return {
    endpoint: "/api/products/customer-price.json",
    payload: await callApi("/api/products/customer-price.json", customerParams),
  };
}

function resolveProductForTld(pricingJson, tld) {
  const safeTld = clean(tld, 80).toLowerCase().replace(/^\.+/, "");
  if (!pricingJson || typeof pricingJson !== "object") return { key: "", product: null };

  const candidates = tldToProductKeys(safeTld);
  for (const mappedKey of candidates) {
    if (!mappedKey) continue;
    if (pricingJson[mappedKey] && typeof pricingJson[mappedKey] === "object") {
      return { key: mappedKey, product: pricingJson[mappedKey] };
    }
  }
  return { key: candidates[0] || tldToProductKey(safeTld) || "", product: null };
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

function isHttp404Error(error) {
  const message = clean(error && error.message, 1200).toLowerCase();
  if (!message) return false;
  return message.includes("404") || message.includes("not found") || message.includes("http 404");
}

function needsDnsActivation(error) {
  const message = clean(error && error.message, 2000).toLowerCase();
  if (!message) return false;
  return (
    message.includes("activate your free dns service") ||
    message.includes("activate free dns service") ||
    message.includes("activate dns service")
  );
}

function dnsActivationRequiredError() {
  const error = new Error("DNS_ACTIVATION_REQUIRED");
  error.code = "DNS_ACTIVATION_REQUIRED";
  return error;
}

function uniqueStrings(input) {
  const list = Array.isArray(input) ? input : [];
  const out = [];
  const seen = new Set();
  list.forEach((item) => {
    const value = clean(item, 190).toLowerCase();
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  });
  return out;
}

async function fetchDnsRecordsViaManageApi(domainName) {
  const dnsTypes = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"];
  const merged = [];
  let lastError = null;
  for (const type of dnsTypes) {
    try {
      const out = await callApi(
        "/api/dns/manage/search-records.json",
        {
          "domain-name": domainName,
          type,
          "no-of-records": 50,
          "page-no": 1,
        },
        "GET"
      );
      merged.push(out);
    } catch (error) {
      if (needsDnsActivation(error)) throw dnsActivationRequiredError();
      lastError = error;
    }
  }
  if (merged.length) {
    return merged;
  }
  throw lastError || new Error("Could not load DNS records from registrar.");
}

function parseDomainOrderId(payload) {
  return firstTruthy([
    payload && payload.orderid,
    payload && payload.order_id,
    payload && payload.entityid,
    payload && payload.id,
    payload && payload.domain && payload.domain.orderid,
    payload && payload.domain && payload.domain.order_id,
  ]);
}

async function resolveDomainOrderId(domainName) {
  try {
    const details = await callApi(
      "/api/domains/details-by-name.json",
      {
        "domain-name": domainName,
        options: "OrderDetails",
      },
      "GET"
    );
    const orderId = parseDomainOrderId(details);
    return looksLikeOrderId(orderId) ? orderId : "";
  } catch (_error) {
    return "";
  }
}

async function activateDnsService(domainName) {
  const orderId = await resolveDomainOrderId(domainName);
  if (!looksLikeOrderId(orderId)) {
    throw new Error("Could not resolve domain order ID required for DNS activation.");
  }
  const paramCandidates = [
    { "order-id": orderId },
    { "domain-name": domainName, "order-id": orderId },
  ].filter(Boolean);
  const endpointCandidates = [
    "/api/dns/activate.json",
    "/api/dns/activate.xml",
  ];

  let lastError = null;
  for (const endpoint of endpointCandidates) {
    for (const params of paramCandidates) {
      try {
        await callApi(endpoint, params, "POST");
        return true;
      } catch (error) {
        lastError = error;
      }
    }
  }
  if (lastError) throw lastError;
  return false;
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
      const data = proxyJson.data || {};
      if (data && typeof data.status === "string" && data.status.toLowerCase().includes("error")) {
        const providerMessage = errorFromJson(data) || "ResellerClub API returned an error";
        console.error("[resellerclub] api_error_status", {
          endpoint: pathname,
          method: safeMethod,
          providerMessage: providerMessage,
          payload: data,
        });
        throw new Error(providerMessage);
      }
      return data;
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
  console.info("[resellerclub] register_domain_start", {
    domainName,
    years,
    apiBase: apiBaseUrl(),
  });
  const availability = await checkAvailability({ domainName });
  if (!availability.available) {
    console.warn("[resellerclub] register_domain_unavailable", {
      domainName,
      years,
      reason: availability && availability.reason ? String(availability.reason) : "unavailable",
    });
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

  const ids = await resolveRegistrationIds({
    fullName: input && input.fullName,
    email: input && input.email,
    registrantAddress1: input && input.registrantAddress1,
    registrantCity: input && input.registrantCity,
    registrantState: input && input.registrantState,
    registrantCountry: input && input.registrantCountry,
    registrantPostalCode: input && input.registrantPostalCode,
    registrantPhone: input && input.registrantPhone,
    registrantPhoneCc: input && input.registrantPhoneCc,
  });
  console.info("[resellerclub] register_domain_ids", {
    domainName,
    years,
    mode: ids && ids.mode ? ids.mode : "unknown",
    customerId: ids && ids.customerId ? String(ids.customerId) : "",
  });
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

  const orderIdCandidate = firstTruthy([json && json.entityid, json && json.orderid]);
  const orderId = looksLikeOrderId(orderIdCandidate) ? orderIdCandidate : "";
  if (!orderId) {
    const providerMessage = errorFromJson(json) || clean(JSON.stringify(json || {}), 500);
    console.warn("[resellerclub] register_domain_missing_order_id", {
      domainName,
      years,
      providerMessage,
    });
    return {
      provider: "resellerclub",
      domainName,
      success: false,
      orderId: "",
      amountMinor: null,
      currency: "USD",
      reason: providerMessage || "Registration response did not include a valid order ID.",
      raw: null,
    };
  }
  console.info("[resellerclub] register_domain_success", {
    domainName,
    years,
    orderId: orderId || "",
  });
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

  const configuredKeys = tldToProductKeys(parts.tld);
  if (!configuredKeys.length) {
    throw new Error(
      `Pricing lookup for .${parts.tld} requires explicit mapping. Set RESCLUB_DOMAIN_PRODUCT_KEYS_JSON (example: {\"${parts.tld}\":[\"product_key\"]}).`
    );
  }

  const catalog = await getProductsPricingCatalog();
  const pricingJson = catalog.payload;
  const resolved = resolveProductForTld(pricingJson, parts.tld);
  const product = resolved.product;
  const productKey = resolved.key || configuredKeys[0];
  if (!product || typeof product !== "object") {
    const keys = collectPricingKeys(pricingJson);
    const keysSnippet = keys.length ? ` Available keys: ${keys.join(", ")}` : " Available keys: <none>";
    const debug = pricingDebugSnippet(pricingJson);
    throw new Error(`Could not find pricing for ${parts.tld} domains on ResellerClub (${catalog.endpoint}).${keysSnippet} ${debug}`);
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
    priceSource: catalog.endpoint,
    raw: null,
  };
}

function resolveServiceProduct(pricingJson, serviceCode) {
  const preferredKey = serviceToProductKey(serviceCode);
  if (!pricingJson || typeof pricingJson !== "object") return { key: preferredKey, product: null };

  const exactKeys = serviceToProductKeys(serviceCode);
  for (const key of exactKeys) {
    if (key && pricingJson[key] && typeof pricingJson[key] === "object") {
      return { key, product: pricingJson[key] };
    }
  }
  return { key: preferredKey, product: null };
}

function buildServiceDebugCandidates(pricingJson, serviceCode, years) {
  const code = clean(serviceCode, 120).toLowerCase();
  const keysToCheck = serviceToProductKeys(code);
  const out = [];
  for (const key of keysToCheck) {
    const product = pricingJson && pricingJson[key];
    if (!product || typeof product !== "object") continue;
    const block = extractAnyPricingBlock(product) || product || {};
    let amountMinor = pickAmountMinorFromPricingBlock(block, years);
    if (code === "business_email") amountMinor = parseBusinessEmailAmountMinorStrict(product, years);
    out.push({
      key,
      amountMinor: Number.isFinite(amountMinor) ? Math.round(amountMinor) : null,
      blockPreview: clean(JSON.stringify(block), 260),
    });
    if (out.length >= 20) break;
  }
  return out;
}

async function getServicePrices(input) {
  const serviceCodes = Array.isArray(input && input.serviceCodes) ? input.serviceCodes : [];
  const domainName = normalizeDomain(input && input.domainName);
  const years = Math.max(1, Math.min(Number(input && input.years) || 1, 10));
  const debugMode = Boolean(input && input.debug);
  const wanted = serviceCodes.map((x) => clean(x, 80).toLowerCase()).filter(Boolean);
  if (!wanted.length) return { currency: "NGN", items: [] };

  const catalog = await getProductsPricingCatalog();
  const pricingJson = catalog.payload;
  const detailsJson = await callApi("/api/resellers/details.json", {});
  const currency = extractCurrencyFromResellerDetails(detailsJson);
  if (!currency) throw new Error("Could not determine selling currency from ResellerClub.");

  const labels = {
    business_email: "Business Email",
  };
  const items = [];
  const debug = {};
  for (const code of wanted) {
    if (debugMode) {
      debug[code] = {
        triedProductKeys: serviceToProductKeys(code),
        tokenCandidates: buildServiceDebugCandidates(pricingJson, code, years),
        priceSource: catalog.endpoint,
      };
    }
    const resolved = resolveServiceProduct(pricingJson, code);
    if (!resolved.product || typeof resolved.product !== "object") {
      const availableKeys = collectPricingKeys(pricingJson).slice(0, 50).join(", ");
      const debug = pricingDebugSnippet(pricingJson);
      throw new Error(
        `${labels[code] || code} product key was not found on ResellerClub (${catalog.endpoint}). Tried: ${serviceToProductKeys(code).join(", ") || "none"}. Available keys: ${availableKeys || "none"}. ${debug}`
      );
    }
    const block = extractAnyPricingBlock(resolved.product) || resolved.product || {};
    let amountMinor = pickAmountMinorFromPricingBlock(block, years);
    if (code === "business_email") {
      amountMinor = parseBusinessEmailAmountMinorStrict(resolved.product, years);
    }
    if (debugMode && debug[code]) {
      debug[code].matchedProductKey = resolved.key || "";
      debug[code].matchedBlockPreview = clean(JSON.stringify(block), 500);
      debug[code].matchedAmountMinor = Number.isFinite(amountMinor) ? Math.round(amountMinor) : null;
    }
    if (!Number.isFinite(amountMinor) || amountMinor < 0) {
      const sample = clean(JSON.stringify(resolved.product), 900);
      throw new Error(
        `${labels[code] || code} price could not be parsed from ResellerClub product ${resolved.key || "<unknown>"}. Product sample: ${sample}`
      );
    }
    items.push({
      code,
      label: labels[code] || code,
      amountMinor: Math.round(amountMinor),
      productKey: resolved.key || serviceToProductKey(code),
      domainName,
      years,
      priceSource: catalog.endpoint,
    });
  }
  return debugMode ? { currency, items, debug, priceSource: catalog.endpoint } : { currency, items, priceSource: catalog.endpoint };
}

async function getDnsZone(input) {
  const domainName = normalizeDomain(input && input.domainName);
  if (!domainName) throw new Error("Invalid domain name");

  let nsJson = null;
  let recordJson = null;
  let records = [];
  let nameservers = [];
  try {
    nsJson = await callApi("/api/dns/retrieve-ns.json", {
      "domain-name": domainName,
    });
    recordJson = await callApi("/api/dns/retrieve-records.json", {
      "domain-name": domainName,
    });
    nameservers = normalizeNsList(nsJson);
    records = normalizeDnsRecords(recordJson);
  } catch (error) {
    if (needsDnsActivation(error)) {
      await activateDnsService(domainName);
      nsJson = await callApi("/api/dns/retrieve-ns.json", {
        "domain-name": domainName,
      });
      recordJson = await callApi("/api/dns/retrieve-records.json", {
        "domain-name": domainName,
      });
      nameservers = normalizeNsList(nsJson);
      records = normalizeDnsRecords(recordJson);
      return {
        provider: "resellerclub",
        domainName,
        nameservers,
        records,
      };
    }
    if (!isHttp404Error(error)) throw error;
    let searchJson;
    try {
      searchJson = await fetchDnsRecordsViaManageApi(domainName);
    } catch (fallbackError) {
      if (fallbackError && fallbackError.code === "DNS_ACTIVATION_REQUIRED") {
        await activateDnsService(domainName);
        searchJson = await fetchDnsRecordsViaManageApi(domainName);
      } else {
        throw fallbackError;
      }
    }
    records = normalizeDnsRecords(searchJson);
    nameservers = uniqueStrings(
      records
        .filter((item) => clean(item && item.type, 20).toUpperCase() === "NS")
        .map((item) => clean(item && item.value, 190))
    );
  }
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
  getServicePrices,
  getDnsZone,
  updateNameservers,
  updateDnsRecords,
};
