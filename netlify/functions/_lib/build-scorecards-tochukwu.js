const crypto = require("crypto");
const { nowSql } = require("./db");

const BUILD_SCORECARDS_TABLE = "tochukwu_build_scorecard_leads";
const BUILD_BOOKING_ACCESS_TABLE = "tochukwu_build_booking_access";
const BUILD_DISCOVERY_PAYMENTS_TABLE = "tochukwu_build_discovery_payments";
const SCHOOL_CALL_BOOKINGS_TABLE = "school_call_bookings_tochukwu";

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max || 400);
}

function normalizeEmail(value) {
  const email = clean(value, 220).toLowerCase();
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function safeJson(value) {
  if (value == null) return null;
  try { return JSON.stringify(value); } catch (_error) { return null; }
}

async function safeAlter(pool, sql) {
  try { await pool.query(sql); } catch (_error) { return; }
}

function sha256(input) {
  return crypto.createHash("sha256").update(String(input || "")).digest("hex");
}

function toIso(value) {
  if (!value) return "";
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString();
}

async function ensureBuildScorecardTablesTochukwu(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${BUILD_SCORECARDS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      lead_uuid VARCHAR(64) NOT NULL,
      full_name VARCHAR(180) NOT NULL,
      business_name VARCHAR(220) NOT NULL,
      work_email VARCHAR(220) NOT NULL,
      phone VARCHAR(80) NULL,
      role_title VARCHAR(140) NULL,
      company_size VARCHAR(80) NULL,
      score INT NOT NULL DEFAULT 0,
      band_key VARCHAR(40) NOT NULL,
      headline VARCHAR(255) NULL,
      next_step VARCHAR(255) NULL,
      follow_up_required TINYINT(1) NOT NULL DEFAULT 0,
      answers_json LONGTEXT NULL,
      lead_uuid VARCHAR(64) NULL,
      source_path VARCHAR(255) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_build_scorecard_lead_uuid (lead_uuid),
      KEY idx_tochukwu_build_scorecard_email (work_email),
      KEY idx_tochukwu_build_scorecard_score (score),
      KEY idx_tochukwu_build_scorecard_created (created_at),
      KEY idx_tochukwu_build_scorecard_band (band_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${BUILD_DISCOVERY_PAYMENTS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      payment_uuid VARCHAR(64) NOT NULL,
      lead_uuid VARCHAR(64) NOT NULL,
      work_email VARCHAR(220) NOT NULL,
      full_name VARCHAR(180) NOT NULL,
      amount_minor INT NOT NULL DEFAULT 0,
      payment_provider VARCHAR(40) NOT NULL DEFAULT 'paystack',
      payment_reference VARCHAR(120) NOT NULL,
      payment_order_id VARCHAR(120) NULL,
      payment_status VARCHAR(40) NOT NULL DEFAULT 'initiated',
      paid_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_build_discovery_payment_uuid (payment_uuid),
      UNIQUE KEY uniq_build_discovery_reference (payment_reference),
      KEY idx_build_discovery_lead (lead_uuid),
      KEY idx_build_discovery_status (payment_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${BUILD_BOOKING_ACCESS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      access_uuid VARCHAR(64) NOT NULL,
      token_hash VARCHAR(80) NOT NULL,
      score INT NOT NULL,
      answers_json LONGTEXT NULL,
      source_path VARCHAR(255) NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_build_booking_access_uuid (access_uuid),
      UNIQUE KEY uniq_build_booking_access_hash (token_hash),
      KEY idx_build_booking_access_expires (expires_at),
      KEY idx_build_booking_access_used (used_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE ${BUILD_SCORECARDS_TABLE} ADD COLUMN source_path VARCHAR(255) NULL`);
  await safeAlter(pool, `ALTER TABLE ${BUILD_SCORECARDS_TABLE} ADD COLUMN follow_up_required TINYINT(1) NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE ${BUILD_BOOKING_ACCESS_TABLE} ADD COLUMN lead_uuid VARCHAR(64) NULL`);
}

async function saveBuildScorecardLead(pool, input) {
  const leadUuid = clean(input && input.leadUuid, 64) || `bsl_${Date.now()}`;
  const fullName = clean(input && input.fullName, 180);
  const businessName = clean(input && input.businessName, 220);
  const workEmail = normalizeEmail(input && input.workEmail);
  const phone = clean(input && input.phone, 80);
  const roleTitle = clean(input && input.role, 140);
  const companySize = clean(input && input.companySize, 80);
  const score = Number(input && input.score || 0);
  const bandKey = clean(input && input.bandKey, 40) || "manual_review";
  const headline = clean(input && input.headline, 255);
  const nextStep = clean(input && input.nextStep, 255);
  const followUpRequired = input && input.followUpRequired ? 1 : 0;
  const answersJson = safeJson(input && input.answers);
  const sourcePath = clean(input && input.sourcePath, 255);
  const now = nowSql();

  if (!fullName || !businessName || !workEmail) throw new Error("Missing required lead fields");

  await pool.query(
    `INSERT INTO ${BUILD_SCORECARDS_TABLE}
      (lead_uuid, full_name, business_name, work_email, phone, role_title, company_size,
       score, band_key, headline, next_step, follow_up_required, answers_json, source_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       business_name = VALUES(business_name),
       work_email = VALUES(work_email),
       phone = VALUES(phone),
       role_title = VALUES(role_title),
       company_size = VALUES(company_size),
       score = VALUES(score),
       band_key = VALUES(band_key),
       headline = VALUES(headline),
       next_step = VALUES(next_step),
       follow_up_required = VALUES(follow_up_required),
       answers_json = VALUES(answers_json),
       source_path = VALUES(source_path),
       updated_at = VALUES(updated_at)`,
    [
      leadUuid,
      fullName,
      businessName,
      workEmail,
      phone || null,
      roleTitle || null,
      companySize || null,
      Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
      bandKey,
      headline || null,
      nextStep || null,
      followUpRequired,
      answersJson,
      sourcePath || null,
      now,
      now,
    ]
  );
}

async function findBuildScorecardLeadByUuid(pool, leadUuidInput) {
  const leadUuid = clean(leadUuidInput, 64);
  if (!leadUuid) return null;
  const [rows] = await pool.query(
    `SELECT
       id, lead_uuid, full_name, business_name, work_email, phone, role_title, company_size,
       score, band_key, headline, next_step, follow_up_required, answers_json, source_path
     FROM ${BUILD_SCORECARDS_TABLE}
     WHERE lead_uuid = ?
     LIMIT 1`,
    [leadUuid]
  );
  if (!rows || !rows.length) return null;
  const row = rows[0] || {};
  let answers = [];
  try {
    const parsed = row.answers_json ? JSON.parse(String(row.answers_json)) : [];
    if (Array.isArray(parsed)) answers = parsed;
  } catch (_error) {}
  return {
    id: Number(row.id || 0),
    leadUuid: clean(row.lead_uuid, 64),
    fullName: clean(row.full_name, 180),
    businessName: clean(row.business_name, 220),
    workEmail: clean(row.work_email, 220),
    phone: clean(row.phone, 80),
    role: clean(row.role_title, 140),
    companySize: clean(row.company_size, 80),
    score: Number(row.score || 0),
    bandKey: clean(row.band_key, 40),
    headline: clean(row.headline, 255),
    nextStep: clean(row.next_step, 255),
    followUpRequired: Number(row.follow_up_required || 0) === 1,
    answers,
    sourcePath: clean(row.source_path, 255),
  };
}

async function createBuildDiscoveryPayment(pool, input) {
  const paymentUuid = clean(input && input.paymentUuid, 64) || `buildpay_${Date.now()}`;
  const leadUuid = clean(input && input.leadUuid, 64);
  const workEmail = normalizeEmail(input && input.workEmail);
  const fullName = clean(input && input.fullName, 180);
  const amountMinor = Number(input && input.amountMinor || 0);
  const paymentReference = clean(input && input.paymentReference, 120);
  const now = nowSql();
  await pool.query(
    `INSERT INTO ${BUILD_DISCOVERY_PAYMENTS_TABLE}
      (payment_uuid, lead_uuid, work_email, full_name, amount_minor, payment_provider, payment_reference, payment_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'paystack', ?, 'initiated', ?, ?)
     ON DUPLICATE KEY UPDATE
       work_email = VALUES(work_email),
       full_name = VALUES(full_name),
       amount_minor = VALUES(amount_minor),
       updated_at = VALUES(updated_at)`,
    [paymentUuid, leadUuid, workEmail, fullName, Math.max(0, Math.round(amountMinor)), paymentReference, now, now]
  );
}

async function findBuildDiscoveryPaymentByReference(pool, referenceInput) {
  const reference = clean(referenceInput, 120);
  if (!reference) return null;
  const [rows] = await pool.query(
    `SELECT id, payment_uuid, lead_uuid, work_email, full_name, amount_minor, payment_reference, payment_status
       FROM ${BUILD_DISCOVERY_PAYMENTS_TABLE}
      WHERE payment_reference = ?
      LIMIT 1`,
    [reference]
  );
  if (!rows || !rows.length) return null;
  const row = rows[0] || {};
  return {
    id: Number(row.id || 0),
    paymentUuid: clean(row.payment_uuid, 64),
    leadUuid: clean(row.lead_uuid, 64),
    workEmail: clean(row.work_email, 220),
    fullName: clean(row.full_name, 180),
    amountMinor: Number(row.amount_minor || 0),
    paymentReference: clean(row.payment_reference, 120),
    paymentStatus: clean(row.payment_status, 40).toLowerCase(),
  };
}

async function markBuildDiscoveryPaymentPaid(pool, input) {
  const paymentReference = clean(input && input.paymentReference, 120);
  const paymentOrderId = clean(input && input.paymentOrderId, 120);
  await pool.query(
    `UPDATE ${BUILD_DISCOVERY_PAYMENTS_TABLE}
        SET payment_status = 'paid', payment_order_id = ?, paid_at = ?, updated_at = ?
      WHERE payment_reference = ?
      LIMIT 1`,
    [paymentOrderId || null, nowSql(), nowSql(), paymentReference]
  );
}

async function issueBuildBookingAccess(pool, input) {
  const token = `buildq_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
  const tokenHash = sha256(token);
  const accessUuid = `build_access_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  const score = Number(input && input.score || 0);
  const leadUuid = clean(input && input.leadUuid, 64);
  const answersJson = safeJson(input && input.answers);
  const sourcePath = clean(input && input.sourcePath, 255);
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO ${BUILD_BOOKING_ACCESS_TABLE}
      (access_uuid, token_hash, score, answers_json, source_path, expires_at, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      accessUuid,
      tokenHash,
      Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
      answersJson,
      sourcePath || null,
      toIso(expiresAt).slice(0, 19).replace("T", " "),
      nowSql(),
    ]
  );

  if (leadUuid) {
    await pool.query(
      `UPDATE ${BUILD_BOOKING_ACCESS_TABLE}
          SET lead_uuid = ?
        WHERE access_uuid = ?
        LIMIT 1`,
      [leadUuid, accessUuid]
    );
  }

  return { token, expiresAtIso: toIso(expiresAt) };
}

async function verifyBuildBookingAccessToken(pool, token) {
  const raw = clean(token, 260);
  if (!raw) return { ok: false, error: "Missing booking access token" };
  const tokenHash = sha256(raw);
  const [rows] = await pool.query(
    `SELECT id, access_uuid, score, lead_uuid,
            DATE_FORMAT(expires_at, '%Y-%m-%d %H:%i:%s') AS expires_at,
            DATE_FORMAT(used_at, '%Y-%m-%d %H:%i:%s') AS used_at
       FROM ${BUILD_BOOKING_ACCESS_TABLE}
      WHERE token_hash = ?
      LIMIT 1`,
    [tokenHash]
  );
  if (!rows || !rows.length) return { ok: false, error: "Invalid booking access token" };
  const row = rows[0] || {};
  const score = Number(row.score || 0);
  if (score < 70) return { ok: false, error: "Booking access is only available for qualified submissions" };
  if (clean(row.used_at, 40)) return { ok: false, error: "This booking access token has already been used" };
  const expiryRaw = clean(row.expires_at, 40);
  const expiry = new Date((expiryRaw.includes("T") ? expiryRaw : expiryRaw.replace(" ", "T")) + "Z");
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() < Date.now()) return { ok: false, error: "Booking access token has expired" };
  return { ok: true, access: { id: Number(row.id || 0), accessUuid: clean(row.access_uuid, 64), leadUuid: clean(row.lead_uuid, 64), score } };
}

async function markBuildBookingAccessUsed(pool, accessId) {
  await pool.query(`UPDATE ${BUILD_BOOKING_ACCESS_TABLE} SET used_at = ? WHERE id = ? LIMIT 1`, [nowSql(), Number(accessId || 0)]);
}

async function listBuildScorecardLeads(pool, input) {
  const limitRaw = Number(input && input.limit || 100);
  const limit = Number.isFinite(limitRaw) ? Math.max(10, Math.min(300, Math.round(limitRaw))) : 100;

  const [rows] = await pool.query(
    `SELECT
       b.id, b.lead_uuid, b.full_name, b.business_name, b.work_email, b.phone, b.role_title, b.company_size,
       b.score, b.band_key, b.headline, b.next_step, b.follow_up_required, b.answers_json, b.source_path,
       DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
       DATE_FORMAT(b.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
       c.booking_uuid AS call_booking_uuid,
       c.status AS call_status,
       c.call_outcome_status,
       c.assigned_owner,
       c.zoom_join_url,
       DATE_FORMAT(c.slot_start_utc, '%Y-%m-%d %H:%i:%s') AS call_slot_start_utc,
       DATE_FORMAT(c.slot_end_utc, '%Y-%m-%d %H:%i:%s') AS call_slot_end_utc,
       DATE_FORMAT(c.next_follow_up_at, '%Y-%m-%d %H:%i:%s') AS call_next_follow_up_at,
       DATE_FORMAT(c.outcome_updated_at, '%Y-%m-%d %H:%i:%s') AS call_outcome_updated_at
     FROM ${BUILD_SCORECARDS_TABLE} b
     LEFT JOIN ${SCHOOL_CALL_BOOKINGS_TABLE} c
       ON c.id = (
         SELECT c2.id
         FROM ${SCHOOL_CALL_BOOKINGS_TABLE} c2
         WHERE c2.work_email = b.work_email
           AND c2.lead_source_type = 'build'
         ORDER BY COALESCE(c2.slot_start_utc, c2.created_at) DESC, c2.id DESC
         LIMIT 1
       )
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT ${limit}`
  );

  return (rows || []).map(function (row) {
    var answers = [];
    try {
      const parsed = row.answers_json ? JSON.parse(String(row.answers_json)) : [];
      if (Array.isArray(parsed)) answers = parsed;
    } catch (_error) {}
    const toIsoSql = function (v) {
      if (!v) return "";
      const raw = String(v).trim();
      if (!raw) return "";
      const d = new Date((raw.includes("T") ? raw : raw.replace(" ", "T")) + "Z");
      return Number.isFinite(d.getTime()) ? d.toISOString() : "";
    };

    return {
      id: Number(row.id || 0),
      leadUuid: clean(row.lead_uuid, 64),
      fullName: clean(row.full_name, 180),
      schoolName: clean(row.business_name, 220),
      workEmail: clean(row.work_email, 220),
      phone: clean(row.phone, 80),
      role: clean(row.role_title, 140),
      studentPopulation: clean(row.company_size, 80),
      score: Number(row.score || 0),
      bandKey: clean(row.band_key, 40),
      headline: clean(row.headline, 255),
      nextStep: clean(row.next_step, 255),
      followUpRequired: Number(row.follow_up_required || 0) === 1,
      answers: answers,
      sourcePath: clean(row.source_path, 255),
      createdAt: toIsoSql(row.created_at),
      updatedAt: toIsoSql(row.updated_at),
      call: {
        bookingUuid: clean(row.call_booking_uuid, 64),
        status: clean(row.call_status, 40),
        outcomeStatus: clean(row.call_outcome_status, 40),
        assignedOwner: clean(row.assigned_owner, 180),
        zoomJoinUrl: clean(row.zoom_join_url, 1200),
        slotStartIso: toIsoSql(row.call_slot_start_utc),
        slotEndIso: toIsoSql(row.call_slot_end_utc),
        nextFollowUpAt: toIsoSql(row.call_next_follow_up_at),
        outcomeUpdatedAt: toIsoSql(row.call_outcome_updated_at),
      },
    };
  });
}

module.exports = {
  BUILD_SCORECARDS_TABLE,
  ensureBuildScorecardTablesTochukwu,
  saveBuildScorecardLead,
  issueBuildBookingAccess,
  verifyBuildBookingAccessToken,
  markBuildBookingAccessUsed,
  findBuildScorecardLeadByUuid,
  createBuildDiscoveryPayment,
  findBuildDiscoveryPaymentByReference,
  markBuildDiscoveryPaymentPaid,
  BUILD_DISCOVERY_PAYMENTS_TABLE,
  listBuildScorecardLeads,
};
