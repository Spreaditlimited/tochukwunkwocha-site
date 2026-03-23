const crypto = require("crypto");
const { nowSql } = require("./db");

async function ensureInstallmentTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_installment_plans (
      id BIGINT NOT NULL AUTO_INCREMENT,
      plan_uuid VARCHAR(64) NOT NULL,
      account_id BIGINT NOT NULL,
      course_slug VARCHAR(120) NOT NULL,
      batch_key VARCHAR(64) NOT NULL,
      batch_label VARCHAR(120) NOT NULL,
      currency VARCHAR(12) NOT NULL DEFAULT 'NGN',
      target_amount_minor INT NOT NULL,
      total_paid_minor INT NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      enrolled_order_uuid VARCHAR(64) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_installment_plan_uuid (plan_uuid),
      KEY idx_installment_plan_account (account_id, created_at),
      KEY idx_installment_plan_batch (course_slug, batch_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_installment_payments (
      id BIGINT NOT NULL AUTO_INCREMENT,
      payment_uuid VARCHAR(64) NOT NULL,
      plan_id BIGINT NOT NULL,
      provider VARCHAR(40) NOT NULL,
      provider_reference VARCHAR(120) NULL,
      provider_order_id VARCHAR(120) NULL,
      currency VARCHAR(12) NOT NULL DEFAULT 'NGN',
      amount_minor INT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      paid_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_installment_payment_uuid (payment_uuid),
      KEY idx_installment_payment_plan (plan_id, created_at),
      KEY idx_installment_payment_reference (provider_reference)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function createInstallmentPlan(pool, input) {
  const now = nowSql();
  const planUuid = `ip_${crypto.randomUUID().replace(/-/g, "")}`;
  await pool.query(
    `INSERT INTO student_installment_plans
      (plan_uuid, account_id, course_slug, batch_key, batch_label, currency, target_amount_minor, total_paid_minor, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'open', ?, ?)`,
    [
      planUuid,
      Number(input.accountId),
      input.courseSlug,
      input.batchKey,
      input.batchLabel,
      input.currency || "NGN",
      Number(input.targetAmountMinor || 0),
      now,
      now,
    ]
  );
  const [rows] = await pool.query(
    `SELECT *
     FROM student_installment_plans
     WHERE plan_uuid = ?
     LIMIT 1`,
    [planUuid]
  );
  return rows && rows.length ? rows[0] : null;
}

async function findOpenPlan(pool, input) {
  const [rows] = await pool.query(
    `SELECT *
     FROM student_installment_plans
     WHERE account_id = ?
       AND course_slug = ?
       AND batch_key = ?
       AND status = 'open'
     ORDER BY id DESC
     LIMIT 1`,
    [Number(input.accountId), input.courseSlug, input.batchKey]
  );
  return rows && rows.length ? rows[0] : null;
}

async function createInstallmentPayment(pool, input) {
  const now = nowSql();
  const paymentUuid = `iw_${crypto.randomUUID().replace(/-/g, "")}`;
  await pool.query(
    `INSERT INTO student_installment_payments
      (payment_uuid, plan_id, provider, provider_reference, provider_order_id, currency, amount_minor, status, paid_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)`,
    [
      paymentUuid,
      Number(input.planId),
      String(input.provider || "paystack"),
      input.providerReference || null,
      input.providerOrderId || null,
      input.currency || "NGN",
      Number(input.amountMinor || 0),
      now,
      now,
    ]
  );
  return paymentUuid;
}

async function markInstallmentPaymentPaidByReference(pool, input) {
  const ref = String(input.providerReference || "").trim();
  if (!ref) return { ok: false, error: "Missing provider reference" };
  const [rows] = await pool.query(
    `SELECT p.id,
            p.plan_id,
            p.amount_minor,
            p.status,
            pl.plan_uuid
     FROM student_installment_payments p
     JOIN student_installment_plans pl ON pl.id = p.plan_id
     WHERE p.provider_reference = ?
     ORDER BY p.id DESC
     LIMIT 1`,
    [ref]
  );
  if (!rows || !rows.length) return { ok: false, error: "Installment payment not found" };
  const row = rows[0];
  if (String(row.status || "").toLowerCase() === "paid") {
    return { ok: true, planId: Number(row.plan_id), planUuid: row.plan_uuid, alreadyPaid: true };
  }

  const now = nowSql();
  await pool.query(
    `UPDATE student_installment_payments
     SET status = 'paid',
         provider_order_id = COALESCE(?, provider_order_id),
         paid_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [input.providerOrderId || null, now, now, Number(row.id)]
  );
  await pool.query(
    `UPDATE student_installment_plans
     SET total_paid_minor = total_paid_minor + ?,
         updated_at = ?
     WHERE id = ?`,
    [Number(row.amount_minor || 0), now, Number(row.plan_id)]
  );

  return { ok: true, planId: Number(row.plan_id), planUuid: row.plan_uuid, alreadyPaid: false };
}

async function listPlansForAccount(pool, accountId) {
  const [rows] = await pool.query(
    `SELECT *
     FROM student_installment_plans
     WHERE account_id = ?
     ORDER BY created_at DESC`,
    [Number(accountId)]
  );
  return rows || [];
}

async function listPaymentsForPlan(pool, planId) {
  const [rows] = await pool.query(
    `SELECT payment_uuid, provider, provider_reference, currency, amount_minor, status, paid_at, created_at
     FROM student_installment_payments
     WHERE plan_id = ?
     ORDER BY created_at DESC`,
    [Number(planId)]
  );
  return rows || [];
}

async function findPlanByUuidForAccount(pool, input) {
  const [rows] = await pool.query(
    `SELECT *
     FROM student_installment_plans
     WHERE plan_uuid = ?
       AND account_id = ?
     LIMIT 1`,
    [String(input.planUuid || ""), Number(input.accountId)]
  );
  return rows && rows.length ? rows[0] : null;
}

async function markPlanEnrolled(pool, input) {
  const now = nowSql();
  await pool.query(
    `UPDATE student_installment_plans
     SET status = 'enrolled',
         enrolled_order_uuid = ?,
         updated_at = ?
     WHERE id = ?`,
    [String(input.orderUuid || ""), now, Number(input.planId)]
  );
}

module.exports = {
  ensureInstallmentTables,
  createInstallmentPlan,
  findOpenPlan,
  createInstallmentPayment,
  markInstallmentPaymentPaidByReference,
  listPlansForAccount,
  listPaymentsForPlan,
  findPlanByUuidForAccount,
  markPlanEnrolled,
};
