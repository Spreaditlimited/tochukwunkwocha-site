const crypto = require("crypto");
const { nowSql } = require("./db");
const { applyRuntimeSettings } = require("./runtime-settings");
const { ensureLearningTables, ensureCourseSlugForeignKey } = require("./learning");
const { runtimeSchemaChangesAllowed } = require("./schema-mode");

let installmentTablesEnsured = false;

async function ensureInstallmentTables(pool) {
  if (installmentTablesEnsured) return;
  await applyRuntimeSettings(pool);
  if (!runtimeSchemaChangesAllowed()) {
    installmentTablesEnsured = true;
    return;
  }
  await ensureLearningTables(pool);
  let shouldBackfillBaseAmount = false;

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
      base_amount_minor INT NULL,
      discount_minor INT NOT NULL DEFAULT 0,
      coupon_code VARCHAR(40) NULL,
      coupon_id BIGINT NULL,
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

  try {
    await pool.query(`ALTER TABLE student_installment_plans ADD COLUMN base_amount_minor INT NULL`);
    shouldBackfillBaseAmount = true;
  } catch (_error) {}
  try {
    await pool.query(`ALTER TABLE student_installment_plans ADD COLUMN discount_minor INT NOT NULL DEFAULT 0`);
  } catch (_error) {}
  try {
    await pool.query(`ALTER TABLE student_installment_plans ADD COLUMN coupon_code VARCHAR(40) NULL`);
  } catch (_error) {}
  try {
    await pool.query(`ALTER TABLE student_installment_plans ADD COLUMN coupon_id BIGINT NULL`);
  } catch (_error) {}
  try {
    await pool.query(`ALTER TABLE student_installment_plans ADD KEY idx_installment_plan_coupon_id (coupon_id)`);
  } catch (_error) {}
  if (shouldBackfillBaseAmount) {
    try {
      await pool.query(
        `UPDATE student_installment_plans
         SET base_amount_minor = target_amount_minor
         WHERE base_amount_minor IS NULL`
      );
    } catch (_error) {}
  }

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

  await ensureCourseSlugForeignKey(pool, {
    tableName: "student_installment_plans",
    columnName: "course_slug",
    constraintName: "fk_installment_plans_learning_course_slug",
  });

  installmentTablesEnsured = true;
}

async function createInstallmentPlan(pool, input) {
  const now = nowSql();
  const planUuid = `ip_${crypto.randomUUID().replace(/-/g, "")}`;
  await pool.query(
    `INSERT INTO student_installment_plans
      (plan_uuid, account_id, course_slug, batch_key, batch_label, currency, target_amount_minor, base_amount_minor, discount_minor, coupon_code, coupon_id, total_paid_minor, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'open', ?, ?)`,
    [
      planUuid,
      Number(input.accountId),
      input.courseSlug,
      input.batchKey,
      input.batchLabel,
      input.currency || "NGN",
      Number(input.targetAmountMinor || 0),
      Number(input.baseAmountMinor || input.targetAmountMinor || 0),
      Number(input.discountMinor || 0),
      input.couponCode ? String(input.couponCode).trim().toUpperCase() : null,
      Number.isFinite(Number(input.couponId)) ? Number(input.couponId) : null,
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

async function listPaymentCountsForPlanIds(pool, planIds) {
  const ids = Array.isArray(planIds)
    ? planIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    : [];
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => "?").join(", ");
  const [rows] = await pool.query(
    `SELECT plan_id, COUNT(*) AS payment_count
     FROM student_installment_payments
     WHERE plan_id IN (${placeholders})
     GROUP BY plan_id`,
    ids
  );

  const out = new Map();
  for (const row of rows || []) {
    const planId = Number(row.plan_id);
    if (!Number.isFinite(planId) || planId <= 0) continue;
    out.set(planId, Number(row.payment_count || 0));
  }
  return out;
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

async function cancelPlanIfUnpaid(pool, input) {
  const planId = Number(input && input.planId);
  if (!Number.isFinite(planId) || planId <= 0) {
    return { ok: false, error: "Invalid plan id" };
  }

  const [planRows] = await pool.query(
    `SELECT id, status, total_paid_minor
     FROM student_installment_plans
     WHERE id = ?
     LIMIT 1`,
    [planId]
  );
  if (!planRows || !planRows.length) return { ok: false, error: "Plan not found" };
  const plan = planRows[0];
  if (String(plan.status || "").toLowerCase() !== "open") {
    return { ok: false, error: "Only open plans can be cancelled" };
  }
  if (Number(plan.total_paid_minor || 0) > 0) {
    return { ok: false, error: "Plan cannot be cancelled after payment has started" };
  }

  const [paymentRows] = await pool.query(
    `SELECT id
     FROM student_installment_payments
     WHERE plan_id = ?
     LIMIT 1`,
    [planId]
  );
  if (paymentRows && paymentRows.length) {
    return { ok: false, error: "Plan cannot be cancelled after payment has started" };
  }

  const now = nowSql();
  await pool.query(
    `UPDATE student_installment_plans
     SET status = 'cancelled',
         updated_at = ?
     WHERE id = ?
       AND status = 'open'
       AND total_paid_minor = 0`,
    [now, planId]
  );
  return { ok: true };
}

module.exports = {
  ensureInstallmentTables,
  createInstallmentPlan,
  findOpenPlan,
  createInstallmentPayment,
  markInstallmentPaymentPaidByReference,
  listPlansForAccount,
  listPaymentsForPlan,
  listPaymentCountsForPlanIds,
  findPlanByUuidForAccount,
  markPlanEnrolled,
  cancelPlanIfUnpaid,
};
