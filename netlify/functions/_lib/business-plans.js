const crypto = require("crypto");
const { nowSql } = require("./db");
const { applyRuntimeSettings } = require("./runtime-settings");

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

async function ensureBusinessPlanTables(pool) {
  await applyRuntimeSettings(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tochukwu_business_plan_orders (
      id BIGINT NOT NULL AUTO_INCREMENT,
      order_uuid VARCHAR(64) NOT NULL,
      plan_uuid VARCHAR(64) NULL,
      payment_reference VARCHAR(120) NULL,
      payment_provider_order_id VARCHAR(120) NULL,
      payment_provider VARCHAR(20) NOT NULL DEFAULT 'paystack',
      payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      payment_currency VARCHAR(16) NOT NULL DEFAULT 'NGN',
      payment_amount_minor BIGINT NOT NULL DEFAULT 0,
      full_name VARCHAR(180) NOT NULL,
      email VARCHAR(190) NOT NULL,
      business_name VARCHAR(220) NULL,
      purpose VARCHAR(40) NULL,
      currency VARCHAR(16) NULL,
      exchange_rate DECIMAL(20,6) NULL,
      intake_json LONGTEXT NULL,
      plan_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      verification_status VARCHAR(30) NOT NULL DEFAULT 'awaiting_verification',
      plan_text LONGTEXT NULL,
      verifier_notes TEXT NULL,
      verified_at DATETIME NULL,
      verified_by VARCHAR(120) NULL,
      account_id BIGINT NULL,
      email_sent_at DATETIME NULL,
      generated_email_sent_at DATETIME NULL,
      verified_email_sent_at DATETIME NULL,
      paid_at DATETIME NULL,
      generated_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      last_error TEXT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_bp_order_uuid (order_uuid),
      UNIQUE KEY uniq_bp_plan_uuid (plan_uuid),
      UNIQUE KEY uniq_bp_payment_reference (payment_reference),
      KEY idx_bp_email_status (email, payment_status, plan_status),
      KEY idx_bp_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE tochukwu_business_plan_orders ADD COLUMN verification_status VARCHAR(30) NOT NULL DEFAULT 'awaiting_verification'`);
  await safeAlter(pool, `ALTER TABLE tochukwu_business_plan_orders ADD COLUMN verifier_notes TEXT NULL`);
  await safeAlter(pool, `ALTER TABLE tochukwu_business_plan_orders ADD COLUMN verified_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE tochukwu_business_plan_orders ADD COLUMN verified_by VARCHAR(120) NULL`);
  await safeAlter(pool, `ALTER TABLE tochukwu_business_plan_orders ADD COLUMN generated_email_sent_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE tochukwu_business_plan_orders ADD COLUMN verified_email_sent_at DATETIME NULL`);
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return ok ? email : "";
}

function newOrderUuid() {
  return `bp_${crypto.randomUUID().replace(/-/g, "")}`;
}

function newPlanUuid() {
  return `bplan_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function insertBusinessPlanOrder(pool, input) {
  const now = nowSql();
  const orderUuid = newOrderUuid();

  const fullName = clean(input.fullName, 180);
  const email = normalizeEmail(input.email);
  const businessName = clean(input.businessName, 220);
  const purpose = clean(input.purpose, 40) || null;
  const currency = clean(input.currency, 16) || null;
  const exchangeRate = Number(input.exchangeRate);
  const exchange = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : null;

  if (!fullName || !email) throw new Error("Full name and valid email are required");

  await pool.query(
    `INSERT INTO tochukwu_business_plan_orders
      (order_uuid, payment_provider, payment_status, payment_currency, payment_amount_minor,
       full_name, email, business_name, purpose, currency, exchange_rate, intake_json,
       plan_status, created_at, updated_at)
     VALUES (?, 'paystack', 'pending', 'NGN', ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      orderUuid,
      Number(input.paymentAmountMinor || 0),
      fullName,
      email,
      businessName || null,
      purpose,
      currency,
      exchange,
      JSON.stringify(input.intake || {}),
      now,
      now,
    ]
  );

  return {
    orderUuid,
    fullName,
    email,
    businessName,
    purpose,
    currency,
    exchangeRate: exchange,
  };
}

async function setOrderPaymentInitiated(pool, input) {
  await pool.query(
    `UPDATE tochukwu_business_plan_orders
     SET payment_reference = ?, updated_at = ?
     WHERE order_uuid = ?
     LIMIT 1`,
    [clean(input.paymentReference, 120) || null, nowSql(), clean(input.orderUuid, 64)]
  );
}

async function findOrderByReference(pool, reference) {
  const ref = clean(reference, 120);
  if (!ref) return null;
  const [rows] = await pool.query(
    `SELECT *
     FROM tochukwu_business_plan_orders
     WHERE payment_reference = ?
     LIMIT 1`,
    [ref]
  );
  return rows && rows.length ? rows[0] : null;
}

async function findLatestPaidOrderForSamePlan(pool, input) {
  const email = normalizeEmail(input && input.email);
  const businessName = clean(input && input.businessName, 220);
  const purpose = clean(input && input.purpose, 40);
  if (!email || !businessName || !purpose) return null;

  const [rows] = await pool.query(
    `SELECT *
     FROM tochukwu_business_plan_orders
     WHERE email = ?
       AND business_name = ?
       AND purpose = ?
       AND payment_status = 'paid'
       AND payment_reference IS NOT NULL
       AND payment_reference != ''
     ORDER BY COALESCE(paid_at, created_at) DESC
     LIMIT 1`,
    [email, businessName, purpose]
  );
  return rows && rows.length ? rows[0] : null;
}

async function markOrderPaid(pool, input) {
  await pool.query(
    `UPDATE tochukwu_business_plan_orders
     SET payment_status = 'paid',
         payment_reference = ?,
         payment_provider_order_id = ?,
         payment_currency = ?,
         payment_amount_minor = ?,
         paid_at = ?,
         updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [
      clean(input.paymentReference, 120) || null,
      clean(input.providerOrderId, 120) || null,
      clean(input.paymentCurrency, 16) || "NGN",
      Number(input.paymentAmountMinor || 0),
      nowSql(),
      nowSql(),
      Number(input.id),
    ]
  );
}

async function markPlanGenerated(pool, input) {
  const planUuid = clean(input.planUuid, 64) || newPlanUuid();
  await pool.query(
    `UPDATE tochukwu_business_plan_orders
     SET plan_uuid = ?,
         plan_status = 'generated',
         verification_status = 'awaiting_verification',
         plan_text = ?,
         verifier_notes = NULL,
         verified_at = NULL,
         verified_by = NULL,
         account_id = ?,
         generated_at = ?,
         updated_at = ?,
         last_error = NULL
     WHERE id = ?
     LIMIT 1`,
    [
      planUuid,
      String(input.planText || ""),
      input.accountId ? Number(input.accountId) : null,
      nowSql(),
      nowSql(),
      Number(input.id),
    ]
  );
  return planUuid;
}

async function markPlanFailed(pool, input) {
  await pool.query(
    `UPDATE tochukwu_business_plan_orders
     SET plan_status = 'failed',
         last_error = ?,
         updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [clean(input.error, 2000), nowSql(), Number(input.id)]
  );
}

async function markEmailSent(pool, id) {
  await pool.query(
    `UPDATE tochukwu_business_plan_orders
     SET email_sent_at = ?, updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [nowSql(), nowSql(), Number(id)]
  );
}

async function markGeneratedEmailSent(pool, id) {
  await pool.query(
    `UPDATE tochukwu_business_plan_orders
     SET generated_email_sent_at = ?, updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [nowSql(), nowSql(), Number(id)]
  );
}

async function markVerifiedEmailSent(pool, id) {
  await pool.query(
    `UPDATE tochukwu_business_plan_orders
     SET verified_email_sent_at = ?, updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [nowSql(), nowSql(), Number(id)]
  );
}

async function markPlanVerified(pool, input) {
  await pool.query(
    `UPDATE tochukwu_business_plan_orders
     SET verification_status = 'verified',
         verified_by = ?,
         verifier_notes = ?,
         verified_at = ?,
         updated_at = ?
     WHERE plan_uuid = ?
       AND plan_status = 'generated'
     LIMIT 1`,
    [
      clean(input.verifiedBy, 120) || "verifier",
      clean(input.verifierNotes, 4000) || null,
      nowSql(),
      nowSql(),
      clean(input.planUuid, 64),
    ]
  );
}

async function listBusinessPlansForInternal(pool, input) {
  const status = clean(input && input.status, 40);
  const params = [];
  let where = `WHERE payment_status = 'paid' AND plan_status = 'generated'`;
  if (status === "awaiting_verification" || status === "verified") {
    where += ` AND verification_status = ?`;
    params.push(status);
  }
  const [rows] = await pool.query(
    `SELECT id, plan_uuid, order_uuid, payment_reference, payment_amount_minor, payment_currency,
            full_name, email, business_name, purpose, currency, created_at, paid_at, generated_at,
            verification_status, verified_at, verified_by, verifier_notes, plan_text
     FROM tochukwu_business_plan_orders
     ${where}
     ORDER BY COALESCE(generated_at, created_at) DESC
     LIMIT 500`,
    params
  );
  return rows || [];
}

async function findPlanByUuidForAccount(pool, input) {
  const planUuid = clean(input && input.planUuid, 64);
  const email = normalizeEmail(input && input.email);
  if (!planUuid || !email) return null;
  const [rows] = await pool.query(
    `SELECT id, plan_uuid, order_uuid, business_name, email, purpose, currency, plan_text,
            verification_status, verified_at, generated_at, created_at
     FROM tochukwu_business_plan_orders
     WHERE plan_uuid = ?
       AND email = ?
       AND payment_status = 'paid'
       AND plan_status = 'generated'
     LIMIT 1`,
    [planUuid, email]
  );
  return rows && rows.length ? rows[0] : null;
}

async function listGeneratedPlansByEmail(pool, emailInput) {
  const email = normalizeEmail(emailInput);
  if (!email) return [];
  const [rows] = await pool.query(
    `SELECT plan_uuid, order_uuid, business_name, full_name, email, purpose, currency, plan_text, generated_at, created_at,
            verification_status, verified_at
     FROM tochukwu_business_plan_orders
     WHERE email = ?
       AND payment_status = 'paid'
       AND plan_status = 'generated'
       AND plan_text IS NOT NULL
       AND plan_text != ''
     ORDER BY COALESCE(generated_at, created_at) DESC`,
    [email]
  );
  return rows || [];
}

module.exports = {
  ensureBusinessPlanTables,
  insertBusinessPlanOrder,
  setOrderPaymentInitiated,
  findOrderByReference,
  findLatestPaidOrderForSamePlan,
  markOrderPaid,
  markPlanGenerated,
  markPlanFailed,
  markEmailSent,
  markGeneratedEmailSent,
  markVerifiedEmailSent,
  markPlanVerified,
  listBusinessPlansForInternal,
  findPlanByUuidForAccount,
  listGeneratedPlansByEmail,
  newPlanUuid,
};
