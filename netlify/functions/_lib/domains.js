const crypto = require("crypto");
const { nowSql } = require("./db");
const { applyRuntimeSettings } = require("./runtime-settings");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeDomain(value) {
  return clean(value, 190).toLowerCase();
}

function positiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Number(fallback) || 1;
  return Math.floor(n);
}

function buildOrderUuid() {
  return `dmo_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildCheckoutUuid() {
  return `dmc_${crypto.randomUUID().replace(/-/g, "")}`;
}

function dateToSql(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function addYearsSql(baseDateSql, years) {
  const base = new Date(String(baseDateSql || nowSql()).replace(" ", "T") + "Z");
  if (!Number.isFinite(base.getTime())) return null;
  const out = new Date(base);
  out.setUTCFullYear(out.getUTCFullYear() + Math.max(1, positiveInt(years, 1)));
  return dateToSql(out);
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

async function ensureDomainTables(pool) {
  await applyRuntimeSettings(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS domain_orders (
      id BIGINT NOT NULL AUTO_INCREMENT,
      order_uuid VARCHAR(72) NOT NULL,
      account_id BIGINT NOT NULL,
      email VARCHAR(190) NOT NULL,
      domain_name VARCHAR(190) NOT NULL,
      years INT NOT NULL DEFAULT 1,
      provider VARCHAR(40) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'registration_in_progress',
      payment_provider VARCHAR(40) NOT NULL DEFAULT 'direct',
      payment_status VARCHAR(40) NOT NULL DEFAULT 'paid',
      purchase_currency VARCHAR(16) NULL,
      purchase_amount_minor BIGINT NULL,
      provider_order_id VARCHAR(120) NULL,
      notes VARCHAR(500) NULL,
      registered_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_domain_order_uuid (order_uuid),
      KEY idx_domain_orders_account (account_id, created_at),
      KEY idx_domain_orders_email (email),
      KEY idx_domain_orders_domain (domain_name),
      KEY idx_domain_orders_status (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_domains (
      id BIGINT NOT NULL AUTO_INCREMENT,
      account_id BIGINT NOT NULL,
      email VARCHAR(190) NOT NULL,
      domain_name VARCHAR(190) NOT NULL,
      provider VARCHAR(40) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'registered',
      years INT NOT NULL DEFAULT 1,
      purchase_currency VARCHAR(16) NULL,
      purchase_amount_minor BIGINT NULL,
      provider_order_id VARCHAR(120) NULL,
      registered_at DATETIME NULL,
      renewal_due_at DATETIME NULL,
      last_synced_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_user_domain_account_name (account_id, domain_name),
      KEY idx_user_domains_email (email),
      KEY idx_user_domains_due (renewal_due_at),
      KEY idx_user_domains_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS domain_checkouts (
      id BIGINT NOT NULL AUTO_INCREMENT,
      checkout_uuid VARCHAR(72) NOT NULL,
      full_name VARCHAR(180) NOT NULL,
      email VARCHAR(190) NOT NULL,
      domain_name VARCHAR(190) NOT NULL,
      years INT NOT NULL DEFAULT 1,
      provider VARCHAR(40) NOT NULL DEFAULT 'namecheap',
      status VARCHAR(40) NOT NULL DEFAULT 'payment_pending',
      payment_provider VARCHAR(40) NOT NULL DEFAULT 'paystack',
      payment_reference VARCHAR(120) NULL,
      payment_currency VARCHAR(16) NULL,
      payment_amount_minor BIGINT NULL,
      payment_paid_at DATETIME NULL,
      linked_account_id BIGINT NULL,
      order_uuid VARCHAR(72) NULL,
      notes VARCHAR(500) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_domain_checkout_uuid (checkout_uuid),
      UNIQUE KEY uniq_domain_checkout_reference (payment_reference),
      KEY idx_domain_checkout_email (email, created_at),
      KEY idx_domain_checkout_status (status, created_at),
      KEY idx_domain_checkout_domain (domain_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE domain_orders ADD COLUMN payment_provider VARCHAR(40) NOT NULL DEFAULT 'direct'`);
  await safeAlter(pool, `ALTER TABLE domain_orders ADD COLUMN payment_status VARCHAR(40) NOT NULL DEFAULT 'paid'`);

}

async function findDomainForAccount(pool, input) {
  const accountId = Number(input && input.accountId);
  const domainName = normalizeDomain(input && input.domainName);
  if (!Number.isFinite(accountId) || accountId <= 0 || !domainName) return null;
  const [rows] = await pool.query(
    `SELECT id, account_id, email, domain_name, provider, status, years, purchase_currency,
            purchase_amount_minor, provider_order_id, registered_at, renewal_due_at, last_synced_at,
            created_at, updated_at
     FROM user_domains
     WHERE account_id = ? AND domain_name = ?
     LIMIT 1`,
    [accountId, domainName]
  );
  return rows && rows.length ? rows[0] : null;
}

async function createDomainOrder(pool, input) {
  const accountId = Number(input && input.accountId);
  const email = clean(input && input.email, 190).toLowerCase();
  const domainName = normalizeDomain(input && input.domainName);
  const provider = clean(input && input.provider, 40) || "namecheap";
  const years = Math.max(1, positiveInt(input && input.years, 1));
  const purchaseCurrency = clean(input && input.purchaseCurrency, 16).toUpperCase();
  const purchaseAmountMinor = Number(input && input.purchaseAmountMinor);
  const providerOrderId = clean(input && input.providerOrderId, 120);
  const status = clean(input && input.status, 40) || "registration_in_progress";
  const paymentProvider = clean(input && input.paymentProvider, 40) || "direct";
  const paymentStatus = clean(input && input.paymentStatus, 40) || "paid";

  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error("Invalid account.");
  if (!email || !domainName) throw new Error("Email and domain are required.");

  const orderUuid = buildOrderUuid();
  const now = nowSql();
  await pool.query(
    `INSERT INTO domain_orders
      (order_uuid, account_id, email, domain_name, years, provider, status, payment_provider, payment_status,
       purchase_currency, purchase_amount_minor, provider_order_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderUuid,
      accountId,
      email,
      domainName,
      years,
      provider,
      status,
      paymentProvider,
      paymentStatus,
      purchaseCurrency || null,
      Number.isFinite(purchaseAmountMinor) ? Math.round(purchaseAmountMinor) : null,
      providerOrderId || null,
      now,
      now,
    ]
  );
  return orderUuid;
}

async function markDomainOrder(pool, input) {
  const orderUuid = clean(input && input.orderUuid, 72);
  if (!orderUuid) return;
  const status = clean(input && input.status, 40);
  const provider = clean(input && input.provider, 40);
  const purchaseCurrency = clean(input && input.purchaseCurrency, 16).toUpperCase();
  const purchaseAmountMinor = Number(input && input.purchaseAmountMinor);
  const providerOrderId = clean(input && input.providerOrderId, 120);
  const note = clean(input && input.note, 500);
  const setRegisteredAt = input && input.setRegisteredAt ? 1 : 0;
  const now = nowSql();

  await pool.query(
    `UPDATE domain_orders
     SET status = COALESCE(?, status),
         provider = COALESCE(?, provider),
         purchase_currency = COALESCE(?, purchase_currency),
         purchase_amount_minor = COALESCE(?, purchase_amount_minor),
         provider_order_id = COALESCE(?, provider_order_id),
         notes = COALESCE(?, notes),
         registered_at = CASE WHEN ? = 1 THEN ? ELSE registered_at END,
         updated_at = ?
     WHERE order_uuid = ?
     LIMIT 1`,
    [
      status || null,
      provider || null,
      purchaseCurrency || null,
      Number.isFinite(purchaseAmountMinor) ? Math.round(purchaseAmountMinor) : null,
      providerOrderId || null,
      note || null,
      setRegisteredAt,
      setRegisteredAt ? now : null,
      now,
      orderUuid,
    ]
  );
}

async function upsertUserDomain(pool, input) {
  const accountId = Number(input && input.accountId);
  const email = clean(input && input.email, 190).toLowerCase();
  const domainName = normalizeDomain(input && input.domainName);
  const provider = clean(input && input.provider, 40) || "namecheap";
  const status = clean(input && input.status, 40) || "registered";
  const years = Math.max(1, positiveInt(input && input.years, 1));
  const purchaseCurrency = clean(input && input.purchaseCurrency, 16).toUpperCase();
  const purchaseAmountMinor = Number(input && input.purchaseAmountMinor);
  const providerOrderId = clean(input && input.providerOrderId, 120);
  const registeredAt = clean(input && input.registeredAt, 32) || nowSql();
  const renewalDueAt = clean(input && input.renewalDueAt, 32) || addYearsSql(registeredAt, years);
  const now = nowSql();

  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error("Invalid account.");
  if (!email || !domainName) throw new Error("Email and domain are required.");

  await pool.query(
    `INSERT INTO user_domains
      (account_id, email, domain_name, provider, status, years, purchase_currency, purchase_amount_minor,
       provider_order_id, registered_at, renewal_due_at, last_synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       email = VALUES(email),
       provider = VALUES(provider),
       status = VALUES(status),
       years = VALUES(years),
       purchase_currency = VALUES(purchase_currency),
       purchase_amount_minor = VALUES(purchase_amount_minor),
       provider_order_id = VALUES(provider_order_id),
       registered_at = VALUES(registered_at),
       renewal_due_at = VALUES(renewal_due_at),
       last_synced_at = VALUES(last_synced_at),
       updated_at = VALUES(updated_at)`,
    [
      accountId,
      email,
      domainName,
      provider,
      status,
      years,
      purchaseCurrency || null,
      Number.isFinite(purchaseAmountMinor) ? Math.round(purchaseAmountMinor) : null,
      providerOrderId || null,
      registeredAt,
      renewalDueAt || null,
      now,
      now,
      now,
    ]
  );
}

async function listUserDomains(pool, input) {
  const accountId = Number(input && input.accountId);
  const limit = Math.max(1, Math.min(Number((input && input.limit) || 100), 300));
  if (!Number.isFinite(accountId) || accountId <= 0) return [];
  const [rows] = await pool.query(
    `SELECT domain_name, provider, status, years, purchase_currency, purchase_amount_minor,
            (
              SELECT dc.payment_currency
              FROM domain_checkouts dc
              WHERE dc.linked_account_id = user_domains.account_id
                AND dc.domain_name = user_domains.domain_name
                AND dc.payment_amount_minor IS NOT NULL
              ORDER BY dc.payment_paid_at DESC, dc.updated_at DESC
              LIMIT 1
            ) AS checkout_payment_currency,
            (
              SELECT dc.payment_amount_minor
              FROM domain_checkouts dc
              WHERE dc.linked_account_id = user_domains.account_id
                AND dc.domain_name = user_domains.domain_name
                AND dc.payment_amount_minor IS NOT NULL
              ORDER BY dc.payment_paid_at DESC, dc.updated_at DESC
              LIMIT 1
            ) AS checkout_payment_amount_minor,
            provider_order_id, registered_at, renewal_due_at, last_synced_at, created_at, updated_at
     FROM user_domains
     WHERE account_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [accountId, limit]
  );
  return rows || [];
}

async function listDomainOrders(pool, input) {
  const accountId = Number(input && input.accountId);
  const limit = Math.max(1, Math.min(Number((input && input.limit) || 30), 120));
  if (!Number.isFinite(accountId) || accountId <= 0) return [];
  const [rows] = await pool.query(
    `SELECT order_uuid, domain_name, years, provider, status, payment_provider, payment_status,
            purchase_currency, purchase_amount_minor,
            (
              SELECT dc.payment_currency
              FROM domain_checkouts dc
              WHERE dc.order_uuid = domain_orders.order_uuid
                AND dc.payment_amount_minor IS NOT NULL
              ORDER BY dc.payment_paid_at DESC, dc.updated_at DESC
              LIMIT 1
            ) AS checkout_payment_currency,
            (
              SELECT dc.payment_amount_minor
              FROM domain_checkouts dc
              WHERE dc.order_uuid = domain_orders.order_uuid
                AND dc.payment_amount_minor IS NOT NULL
              ORDER BY dc.payment_paid_at DESC, dc.updated_at DESC
              LIMIT 1
            ) AS checkout_payment_amount_minor,
            provider_order_id, notes, registered_at, created_at, updated_at
     FROM domain_orders
     WHERE account_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [accountId, limit]
  );
  return rows || [];
}

async function findDomainByName(pool, input) {
  const domainName = normalizeDomain(input && input.domainName);
  if (!domainName) return null;
  const [rows] = await pool.query(
    `SELECT id, account_id, email, domain_name, provider, status, years, purchase_currency,
            purchase_amount_minor, provider_order_id, registered_at, renewal_due_at, created_at, updated_at
     FROM user_domains
     WHERE domain_name = ?
     ORDER BY id DESC
     LIMIT 1`,
    [domainName]
  );
  return rows && rows.length ? rows[0] : null;
}

async function createDomainCheckout(pool, input) {
  const fullName = clean(input && input.fullName, 180);
  const email = clean(input && input.email, 190).toLowerCase();
  const domainName = normalizeDomain(input && input.domainName);
  const years = Math.max(1, positiveInt(input && input.years, 1));
  const provider = clean(input && input.provider, 40) || "namecheap";
  const paymentProvider = clean(input && input.paymentProvider, 40) || "paystack";
  const paymentReference = clean(input && input.paymentReference, 120);
  const paymentCurrency = clean(input && input.paymentCurrency, 16).toUpperCase();
  const paymentAmountMinor = Number(input && input.paymentAmountMinor);
  if (!fullName || !email || !domainName) throw new Error("Full name, email, and domain are required.");

  const checkoutUuid = buildCheckoutUuid();
  const now = nowSql();
  await pool.query(
    `INSERT INTO domain_checkouts
      (checkout_uuid, full_name, email, domain_name, years, provider, status, payment_provider, payment_reference,
       payment_currency, payment_amount_minor, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'payment_pending', ?, ?, ?, ?, ?, ?)`,
    [
      checkoutUuid,
      fullName,
      email,
      domainName,
      years,
      provider,
      paymentProvider,
      paymentReference || null,
      paymentCurrency || null,
      Number.isFinite(paymentAmountMinor) ? Math.round(paymentAmountMinor) : null,
      now,
      now,
    ]
  );
  return checkoutUuid;
}

async function findDomainCheckoutByReference(pool, paymentReference) {
  const reference = clean(paymentReference, 120);
  if (!reference) return null;
  const [rows] = await pool.query(
    `SELECT id, checkout_uuid, full_name, email, domain_name, years, provider, status, payment_provider,
            payment_reference, payment_currency, payment_amount_minor, payment_paid_at, linked_account_id,
            order_uuid, notes, created_at, updated_at
     FROM domain_checkouts
     WHERE payment_reference = ?
     LIMIT 1`,
    [reference]
  );
  return rows && rows.length ? rows[0] : null;
}

async function markDomainCheckoutPaid(pool, input) {
  const checkoutUuid = clean(input && input.checkoutUuid, 72);
  const paymentCurrency = clean(input && input.paymentCurrency, 16).toUpperCase();
  const paymentAmountMinor = Number(input && input.paymentAmountMinor);
  const status = clean(input && input.status, 40) || "paid";
  if (!checkoutUuid) return;
  const now = nowSql();
  await pool.query(
    `UPDATE domain_checkouts
     SET status = ?,
         payment_currency = COALESCE(?, payment_currency),
         payment_amount_minor = COALESCE(?, payment_amount_minor),
         payment_paid_at = COALESCE(payment_paid_at, ?),
         updated_at = ?
     WHERE checkout_uuid = ?
     LIMIT 1`,
    [
      status,
      paymentCurrency || null,
      Number.isFinite(paymentAmountMinor) ? Math.round(paymentAmountMinor) : null,
      now,
      now,
      checkoutUuid,
    ]
  );
}

async function finalizeDomainCheckout(pool, input) {
  const checkoutUuid = clean(input && input.checkoutUuid, 72);
  const linkedAccountId = Number(input && input.linkedAccountId);
  const orderUuid = clean(input && input.orderUuid, 72);
  const note = clean(input && input.note, 500);
  const status = clean(input && input.status, 40) || "registered";
  if (!checkoutUuid) return;
  const now = nowSql();
  await pool.query(
    `UPDATE domain_checkouts
     SET status = ?,
         linked_account_id = COALESCE(?, linked_account_id),
         order_uuid = COALESCE(?, order_uuid),
         notes = COALESCE(?, notes),
         updated_at = ?
     WHERE checkout_uuid = ?
     LIMIT 1`,
    [
      status,
      Number.isFinite(linkedAccountId) && linkedAccountId > 0 ? linkedAccountId : null,
      orderUuid || null,
      note || null,
      now,
      checkoutUuid,
    ]
  );
}

module.exports = {
  normalizeDomain,
  ensureDomainTables,
  findDomainForAccount,
  findDomainByName,
  createDomainOrder,
  markDomainOrder,
  upsertUserDomain,
  listUserDomains,
  listDomainOrders,
  createDomainCheckout,
  findDomainCheckoutByReference,
  markDomainCheckoutPaid,
  finalizeDomainCheckout,
  addYearsSql,
};
