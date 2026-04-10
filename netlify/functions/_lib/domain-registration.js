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
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
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

async function findCheckoutBuyerByOrderUuid(pool, orderUuid) {
  const uuid = clean(orderUuid, 72);
  if (!uuid) return null;
  const [rows] = await pool.query(
    `SELECT full_name, email
     FROM domain_checkouts
     WHERE order_uuid = ?
     ORDER BY id DESC
     LIMIT 1`,
    [uuid]
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
  const registrantProfile = parseRegistrantProfileJson(order.registrant_profile_json) || {};
  const autoRenewEnabled = Number(order.auto_renew_enabled || 0) === 1;
  const checkoutBuyer = await findCheckoutBuyerByOrderUuid(pool, order.order_uuid);
  const buyerEmail = clean(
    (checkoutBuyer && checkoutBuyer.email) || (order && order.email) || "",
    190
  ).toLowerCase();
  const buyerFullName = clean((checkoutBuyer && checkoutBuyer.full_name) || "", 180) || "Domain Buyer";
  console.info("[domain-registration] process_attempt", {
    orderUuid: String(order.order_uuid || ""),
    domainName,
    years,
    currentStatus: String(order.status || ""),
    provider,
  });

  let registration;
  try {
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
