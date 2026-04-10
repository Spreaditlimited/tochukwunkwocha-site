const { registerDomain } = require("./domain-client");
const {
  ensureDomainTables,
  markDomainOrder,
  upsertUserDomain,
  addYearsSql,
} = require("./domains");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function normalizeEmail(value) {
  const email = clean(value, 190).toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return ok ? email : "";
}

function parseSelectedServicesJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function parseRegistrantProfileJson(value) {
  if (!value) return null;
  try {
    const first = JSON.parse(String(value));
    if (first && typeof first === "object") return first;
    if (typeof first === "string") {
      const second = JSON.parse(first);
      return second && typeof second === "object" ? second : null;
    }
    return null;
  } catch (_error) {
    return null;
  }
}

function pickFirstNonEmpty() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = clean(arguments[i], 500);
    if (value) return value;
  }
  return "";
}

function normalizeKey(value) {
  return clean(value, 120).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collectProfileValues(source, out, depth) {
  if (!source || typeof source !== "object" || depth > 6) return;
  Object.keys(source).forEach((key) => {
    const normalized = normalizeKey(key);
    if (!normalized) return;
    const value = source[key];
    if (value && typeof value === "object") {
      collectProfileValues(value, out, depth + 1);
      return;
    }
    const cleaned = clean(value, 500);
    if (!cleaned) return;
    if (!out[normalized]) out[normalized] = cleaned;
  });
}

function valueFromProfileMap(profileMap, aliases) {
  const list = Array.isArray(aliases) ? aliases : [];
  for (let i = 0; i < list.length; i += 1) {
    const key = normalizeKey(list[i]);
    if (!key) continue;
    const value = clean(profileMap && profileMap[key], 500);
    if (value) return value;
  }
  return "";
}

function normalizedRegistrantProfile(primaryProfile, fallbackProfile) {
  const primary = primaryProfile && typeof primaryProfile === "object" ? primaryProfile : {};
  const fallback = fallbackProfile && typeof fallbackProfile === "object" ? fallbackProfile : {};
  const primaryMap = {};
  const fallbackMap = {};
  collectProfileValues(primary, primaryMap, 0);
  collectProfileValues(fallback, fallbackMap, 0);
  return {
    address1: pickFirstNonEmpty(
      primary.address1,
      primary.registrantAddress1,
      primary.address,
      primary.address_line_1,
      valueFromProfileMap(primaryMap, ["registrant_address1", "addressline1", "address1"]),
      fallback.address1,
      fallback.registrantAddress1,
      fallback.address,
      fallback.address_line_1,
      valueFromProfileMap(fallbackMap, ["registrant_address1", "addressline1", "address1"])
    ),
    city: pickFirstNonEmpty(
      primary.city,
      primary.registrantCity,
      valueFromProfileMap(primaryMap, ["registrant_city", "city", "town"]),
      fallback.city,
      fallback.registrantCity,
      valueFromProfileMap(fallbackMap, ["registrant_city", "city", "town"])
    ),
    state: pickFirstNonEmpty(
      primary.state,
      primary.registrantState,
      primary.province,
      valueFromProfileMap(primaryMap, ["registrant_state", "state", "province", "region"]),
      fallback.state,
      fallback.registrantState,
      fallback.province,
      valueFromProfileMap(fallbackMap, ["registrant_state", "state", "province", "region"])
    ),
    country: pickFirstNonEmpty(
      primary.country,
      primary.registrantCountry,
      primary.countryCode,
      valueFromProfileMap(primaryMap, ["registrant_country", "country", "countrycode", "country_code"]),
      fallback.country,
      fallback.registrantCountry,
      fallback.countryCode,
      valueFromProfileMap(fallbackMap, ["registrant_country", "country", "countrycode", "country_code"])
    ),
    postalCode: pickFirstNonEmpty(
      primary.postalCode,
      primary.postcode,
      primary.zip,
      primary.zipCode,
      primary.registrantPostalCode,
      valueFromProfileMap(primaryMap, ["registrant_postal_code", "postalcode", "postcode", "zipcode", "zip"]),
      fallback.postalCode,
      fallback.postcode,
      fallback.zip,
      fallback.zipCode,
      fallback.registrantPostalCode,
      valueFromProfileMap(fallbackMap, ["registrant_postal_code", "postalcode", "postcode", "zipcode", "zip"])
    ),
    phone: pickFirstNonEmpty(
      primary.phone,
      primary.registrantPhone,
      primary.phoneNumber,
      valueFromProfileMap(primaryMap, ["registrant_phone", "phone", "phonenumber", "telephone", "mobile"]),
      fallback.phone,
      fallback.registrantPhone,
      fallback.phoneNumber,
      valueFromProfileMap(fallbackMap, ["registrant_phone", "phone", "phonenumber", "telephone", "mobile"])
    ),
    phoneCc: pickFirstNonEmpty(
      primary.phoneCc,
      primary.phoneCC,
      primary.phoneCountryCode,
      primary.registrantPhoneCc,
      valueFromProfileMap(primaryMap, [
        "registrant_phone_cc",
        "phonecc",
        "phonecountrycode",
        "countrycallingcode",
        "dialcode",
        "phonecode",
      ]),
      fallback.phoneCc,
      fallback.phoneCC,
      fallback.phoneCountryCode,
      fallback.registrantPhoneCc,
      valueFromProfileMap(fallbackMap, [
        "registrant_phone_cc",
        "phonecc",
        "phonecountrycode",
        "countrycallingcode",
        "dialcode",
        "phonecode",
      ])
    ),
  };
}

async function findDomainOrderByUuid(pool, orderUuid) {
  const uuid = clean(orderUuid, 72);
  if (!uuid) return null;
  const [rows] = await pool.query(
    `SELECT id, order_uuid, account_id, email, domain_name, years, provider, status, payment_status,
            purchase_currency, purchase_amount_minor, provider_order_id, registrant_profile_json, selected_services_json, auto_renew_enabled,
            notes, created_at, updated_at
     FROM domain_orders
     WHERE order_uuid = ?
     LIMIT 1`,
    [uuid]
  );
  return rows && rows.length ? rows[0] : null;
}

async function findCheckoutBuyerByOrderUuid(pool, orderUuid, paymentReference) {
  const uuid = clean(orderUuid, 72);
  const reference = clean(paymentReference, 120);
  if (!uuid && !reference) return null;
  const [rows] = await pool.query(
    `SELECT full_name, email, registrant_profile_json
     FROM domain_checkouts
     WHERE order_uuid = ?
        OR payment_reference = ?
     ORDER BY CASE WHEN order_uuid = ? THEN 0 ELSE 1 END, id DESC
     LIMIT 1`,
    [uuid, reference, uuid]
  );
  return rows && rows.length ? rows[0] : null;
}

async function processDomainRegistrationForOrder(pool, orderUuid) {
  await ensureDomainTables(pool);
  const order = await findDomainOrderByUuid(pool, orderUuid);
  if (!order) return { ok: false, error: "Order not found" };
  if (String(order.status || "").toLowerCase() === "registered") {
    return { ok: true, alreadyRegistered: true, orderUuid: order.order_uuid, domainName: order.domain_name };
  }

  const domainName = String(order.domain_name || "").trim().toLowerCase();
  const years = Math.max(1, Math.min(Number(order.years) || 1, 10));
  const provider = String(order.provider || "").trim().toLowerCase() || "namecheap";
  const selectedServices = parseSelectedServicesJson(order.selected_services_json);
  const orderRegistrantProfile = parseRegistrantProfileJson(order.registrant_profile_json);
  const autoRenewEnabled = Number(order.auto_renew_enabled || 0) === 1;
  const checkoutBuyer = await findCheckoutBuyerByOrderUuid(
    pool,
    order.order_uuid,
    order.provider_order_id
  );
  const checkoutRegistrantProfile = parseRegistrantProfileJson(
    checkoutBuyer && checkoutBuyer.registrant_profile_json
  );
  const registrantProfile = normalizedRegistrantProfile(orderRegistrantProfile, checkoutRegistrantProfile);
  const buyerEmail = normalizeEmail(checkoutBuyer && checkoutBuyer.email) || normalizeEmail(order && order.email);
  const buyerFullName = clean((checkoutBuyer && checkoutBuyer.full_name) || "", 180) || "Domain Buyer";
  console.info("[domain-registration] process_attempt", {
    orderUuid: String(order.order_uuid || ""),
    domainName,
    years,
    currentStatus: String(order.status || ""),
    provider,
    registrantFields: {
      address1: !!clean(registrantProfile.address1, 240),
      city: !!clean(registrantProfile.city, 120),
      state: !!clean(registrantProfile.state, 120),
      country: !!clean(registrantProfile.country, 120),
      postalCode: !!clean(registrantProfile.postalCode, 40),
      phone: !!clean(registrantProfile.phone, 50),
      phoneCc: !!clean(registrantProfile.phoneCc, 10),
    },
  });

  let registration;
  try {
    if (!buyerEmail) {
      throw new Error("Buyer email is invalid or missing for domain registration.");
    }
    registration = await registerDomain({
      domainName,
      years,
      fullName: buyerFullName,
      email: buyerEmail,
      registrantAddress1: clean(registrantProfile.address1, 240),
      registrantCity: clean(registrantProfile.city, 120),
      registrantState: clean(registrantProfile.state, 120),
      registrantCountry: clean(registrantProfile.country, 120),
      registrantPostalCode: clean(registrantProfile.postalCode, 40),
      registrantPhone: clean(registrantProfile.phone, 50),
      registrantPhoneCc: clean(registrantProfile.phoneCc, 10),
    });
  } catch (error) {
    await markDomainOrder(pool, {
      orderUuid: order.order_uuid,
      status: "registration_failed",
      provider,
      note: clean(error && error.message ? error.message : "registration_failed", 500),
      setRegisteredAt: false,
    });
    console.error("[domain-registration] process_error", {
      orderUuid: String(order.order_uuid || ""),
      domainName,
      years,
      provider,
      error: clean(error && error.message ? error.message : "registration_failed", 500),
    });
    return { ok: false, error: clean(error && error.message ? error.message : "registration_failed", 500) };
  }

  if (!registration || !registration.success) {
    await markDomainOrder(pool, {
      orderUuid: order.order_uuid,
      status: "registration_failed",
      provider: (registration && registration.provider) || provider,
      providerOrderId: registration && registration.orderId ? String(registration.orderId) : null,
      note: clean((registration && registration.reason) || "registration_failed", 500),
      setRegisteredAt: false,
    });
    console.warn("[domain-registration] process_failed", {
      orderUuid: String(order.order_uuid || ""),
      domainName,
      years,
      provider,
      reason: clean((registration && registration.reason) || "registration_failed", 500),
    });
    return { ok: false, error: clean((registration && registration.reason) || "registration_failed", 500) };
  }

  const registeredAt = new Date().toISOString().slice(0, 19).replace("T", " ");
  const purchaseCurrency = String(order.purchase_currency || "").trim().toUpperCase();
  const purchaseAmountMinor = Number(order.purchase_amount_minor || 0);

  await markDomainOrder(pool, {
    orderUuid: order.order_uuid,
    status: "registered",
    provider: registration.provider || provider,
    purchaseCurrency: purchaseCurrency || null,
    purchaseAmountMinor: Number.isFinite(purchaseAmountMinor) ? purchaseAmountMinor : null,
    providerOrderId: registration.orderId || order.provider_order_id || null,
    selectedServices,
    autoRenewEnabled,
    setRegisteredAt: true,
  });

  await upsertUserDomain(pool, {
    accountId: Number(order.account_id),
    email: String(order.email || "").trim().toLowerCase(),
    domainName: registration.domainName || domainName,
    provider: registration.provider || provider,
    status: "registered",
    years,
    purchaseCurrency: purchaseCurrency || null,
    purchaseAmountMinor: Number.isFinite(purchaseAmountMinor) ? purchaseAmountMinor : null,
    providerOrderId: registration.orderId || order.provider_order_id || "",
    selectedServices,
    autoRenewEnabled,
    registeredAt,
    renewalDueAt: addYearsSql(registeredAt, years),
  });
  console.info("[domain-registration] process_success", {
    orderUuid: String(order.order_uuid || ""),
    domainName: registration.domainName || domainName,
    years,
    provider: registration.provider || provider,
    registrarOrderId: registration.orderId || "",
  });

  return { ok: true, orderUuid: order.order_uuid, domainName: registration.domainName || domainName };
}

module.exports = {
  findDomainOrderByUuid,
  processDomainRegistrationForOrder,
};
