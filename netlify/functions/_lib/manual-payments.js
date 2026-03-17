const crypto = require("crypto");
const { nowSql } = require("./db");

const STATUS_PENDING = "pending_verification";
const STATUS_APPROVED = "approved";
const STATUS_REJECTED = "rejected";

function buildPaymentUuid() {
  return `mp_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function ensureManualPaymentsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS course_manual_payments (
      id BIGINT NOT NULL AUTO_INCREMENT,
      payment_uuid VARCHAR(64) NOT NULL,
      course_slug VARCHAR(120) NOT NULL,
      first_name VARCHAR(160) NOT NULL,
      email VARCHAR(190) NOT NULL,
      country VARCHAR(120) NULL,
      currency VARCHAR(12) NOT NULL DEFAULT 'NGN',
      amount_minor INT NOT NULL,
      transfer_reference VARCHAR(190) NULL,
      proof_url TEXT NOT NULL,
      proof_public_id VARCHAR(255) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending_verification',
      flodesk_pre_synced TINYINT(1) NOT NULL DEFAULT 0,
      flodesk_main_synced TINYINT(1) NOT NULL DEFAULT 0,
      reviewed_by VARCHAR(160) NULL,
      review_note VARCHAR(500) NULL,
      reviewed_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_manual_payment_uuid (payment_uuid),
      KEY idx_manual_payment_status_created (status, created_at),
      KEY idx_manual_payment_email (email),
      KEY idx_manual_payment_course (course_slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`ALTER TABLE course_manual_payments MODIFY transfer_reference VARCHAR(190) NULL`);
}

async function createManualPayment(pool, input) {
  const paymentUuid = buildPaymentUuid();
  const now = nowSql();

  await pool.query(
    `INSERT INTO course_manual_payments
     (payment_uuid, course_slug, first_name, email, country, currency, amount_minor, transfer_reference, proof_url, proof_public_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      paymentUuid,
      input.courseSlug,
      input.firstName,
      input.email,
      input.country || null,
      input.currency,
      input.amountMinor,
      input.transferReference || null,
      input.proofUrl,
      input.proofPublicId || null,
      STATUS_PENDING,
      now,
      now,
    ]
  );

  return paymentUuid;
}

async function markPreSynced(pool, paymentUuid) {
  await pool.query(
    `UPDATE course_manual_payments
     SET flodesk_pre_synced = 1,
         updated_at = ?
     WHERE payment_uuid = ?`,
    [nowSql(), paymentUuid]
  );
}

async function markMainSynced(pool, paymentUuid) {
  await pool.query(
    `UPDATE course_manual_payments
     SET flodesk_main_synced = 1,
         updated_at = ?
     WHERE payment_uuid = ?`,
    [nowSql(), paymentUuid]
  );
}

async function findManualPaymentByUuid(pool, paymentUuid) {
  const [rows] = await pool.query(
    `SELECT id,
            payment_uuid,
            course_slug,
            first_name,
            email,
            country,
            currency,
            amount_minor,
            transfer_reference,
            proof_url,
            proof_public_id,
            status,
            flodesk_pre_synced,
            flodesk_main_synced,
            reviewed_by,
            review_note,
            reviewed_at,
            created_at,
            updated_at
     FROM course_manual_payments
     WHERE payment_uuid = ?
     LIMIT 1`,
    [paymentUuid]
  );

  return rows && rows.length ? rows[0] : null;
}

async function listManualPayments(pool, { status, search, limit }) {
  const where = [];
  const params = [];

  if (status) {
    where.push("status = ?");
    params.push(status);
  }

  const q = String(search || "").trim();
  if (q) {
    where.push("(payment_uuid LIKE ? OR first_name LIKE ? OR email LIKE ? OR transfer_reference LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const sql = `
    SELECT payment_uuid,
           course_slug,
           first_name,
           email,
           country,
           currency,
           amount_minor,
           transfer_reference,
           proof_url,
           proof_public_id,
           status,
           flodesk_pre_synced,
           flodesk_main_synced,
           reviewed_by,
           review_note,
           reviewed_at,
           created_at,
           updated_at
    FROM course_manual_payments
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC
    LIMIT ?
  `;

  const safeLimit = Math.max(1, Math.min(Number(limit) || 80, 200));
  params.push(safeLimit);

  const [rows] = await pool.query(sql, params);
  return rows || [];
}

async function reviewManualPayment(pool, { paymentUuid, nextStatus, reviewedBy, reviewNote }) {
  const now = nowSql();
  const note = String(reviewNote || "").trim().slice(0, 500);
  const reviewer = String(reviewedBy || "").trim().slice(0, 160);

  const [res] = await pool.query(
    `UPDATE course_manual_payments
     SET status = ?,
         reviewed_by = ?,
         review_note = ?,
         reviewed_at = ?,
         updated_at = ?
     WHERE payment_uuid = ?`,
    [nextStatus, reviewer || null, note || null, now, now, paymentUuid]
  );

  return Number(res && res.affectedRows ? res.affectedRows : 0);
}

module.exports = {
  STATUS_PENDING,
  STATUS_APPROVED,
  STATUS_REJECTED,
  ensureManualPaymentsTable,
  createManualPayment,
  markPreSynced,
  markMainSynced,
  findManualPaymentByUuid,
  listManualPayments,
  reviewManualPayment,
};
