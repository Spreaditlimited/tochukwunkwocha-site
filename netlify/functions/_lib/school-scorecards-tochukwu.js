const { nowSql } = require("./db");

const SCHOOL_SCORECARDS_TABLE = "tochukwu_school_scorecard_leads";
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
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return null;
  }
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

function toDateTimeSql(value) {
  if (!value) return "";
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function isoFromSql(value) {
  if (!value) return "";
  if (value instanceof Date) {
    const d = new Date(value.getTime());
    return Number.isFinite(d.getTime()) ? d.toISOString() : "";
  }
  const raw = String(value).trim();
  if (!raw) return "";
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const withZone = /(?:Z|[+\-]\d{2}:\d{2})$/i.test(normalized) ? normalized : normalized + "Z";
  const d = new Date(withZone);
  return Number.isFinite(d.getTime()) ? d.toISOString() : "";
}

async function ensureSchoolScorecardTablesTochukwu(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHOOL_SCORECARDS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      lead_uuid VARCHAR(64) NOT NULL,
      full_name VARCHAR(180) NOT NULL,
      school_name VARCHAR(220) NOT NULL,
      work_email VARCHAR(220) NOT NULL,
      phone VARCHAR(80) NULL,
      role_title VARCHAR(140) NULL,
      student_population VARCHAR(60) NULL,
      score INT NOT NULL DEFAULT 0,
      band_key VARCHAR(40) NOT NULL,
      headline VARCHAR(255) NULL,
      next_step VARCHAR(255) NULL,
      answers_json LONGTEXT NULL,
      source_path VARCHAR(255) NULL,
      event_source_url VARCHAR(1200) NULL,
      meta_event_id VARCHAR(120) NULL,
      meta_lead_sent TINYINT(1) NOT NULL DEFAULT 0,
      brevo_synced TINYINT(1) NOT NULL DEFAULT 0,
      brevo_error VARCHAR(255) NULL,
      client_ip VARCHAR(64) NULL,
      user_agent VARCHAR(400) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_school_scorecard_lead_uuid (lead_uuid),
      KEY idx_tochukwu_school_scorecard_email (work_email),
      KEY idx_tochukwu_school_scorecard_score (score),
      KEY idx_tochukwu_school_scorecard_created (created_at),
      KEY idx_tochukwu_school_scorecard_band (band_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE ${SCHOOL_SCORECARDS_TABLE} ADD COLUMN source_path VARCHAR(255) NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_SCORECARDS_TABLE} ADD COLUMN event_source_url VARCHAR(1200) NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_SCORECARDS_TABLE} ADD COLUMN meta_event_id VARCHAR(120) NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_SCORECARDS_TABLE} ADD COLUMN meta_lead_sent TINYINT(1) NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_SCORECARDS_TABLE} ADD COLUMN brevo_synced TINYINT(1) NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_SCORECARDS_TABLE} ADD COLUMN brevo_error VARCHAR(255) NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_SCORECARDS_TABLE} ADD COLUMN client_ip VARCHAR(64) NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_SCORECARDS_TABLE} ADD COLUMN user_agent VARCHAR(400) NULL`);
}

async function saveSchoolScorecardLead(pool, input) {
  const leadUuid = clean(input && input.leadUuid, 64) || `ssl_${Date.now()}`;
  const fullName = clean(input && input.fullName, 180);
  const schoolName = clean(input && input.schoolName, 220);
  const workEmail = normalizeEmail(input && input.workEmail);
  const phone = clean(input && input.phone, 80);
  const roleTitle = clean(input && input.role, 140);
  const studentPopulation = clean(input && input.studentPopulation, 60);
  const score = Number(input && input.score || 0);
  const bandKey = clean(input && input.bandKey, 40) || "notReady";
  const headline = clean(input && input.headline, 255);
  const nextStep = clean(input && input.nextStep, 255);
  const answersJson = safeJson(input && input.answers);
  const sourcePath = clean(input && input.sourcePath, 255);
  const eventSourceUrl = clean(input && input.eventSourceUrl, 1200);
  const metaEventId = clean(input && input.metaEventId, 120);
  const metaLeadSent = input && input.metaLeadSent ? 1 : 0;
  const brevoSynced = input && input.brevoSynced ? 1 : 0;
  const brevoError = clean(input && input.brevoError, 255);
  const clientIp = clean(input && input.clientIpAddress, 64);
  const userAgent = clean(input && input.clientUserAgent, 400);
  const now = nowSql();

  if (!fullName || !schoolName || !workEmail) {
    throw new Error("Missing required lead fields");
  }

  await pool.query(
    `INSERT INTO ${SCHOOL_SCORECARDS_TABLE}
      (lead_uuid, full_name, school_name, work_email, phone, role_title, student_population,
       score, band_key, headline, next_step, answers_json, source_path, event_source_url,
       meta_event_id, meta_lead_sent, brevo_synced, brevo_error, client_ip, user_agent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       school_name = VALUES(school_name),
       work_email = VALUES(work_email),
       phone = VALUES(phone),
       role_title = VALUES(role_title),
       student_population = VALUES(student_population),
       score = VALUES(score),
       band_key = VALUES(band_key),
       headline = VALUES(headline),
       next_step = VALUES(next_step),
       answers_json = VALUES(answers_json),
       source_path = VALUES(source_path),
       event_source_url = VALUES(event_source_url),
       meta_event_id = VALUES(meta_event_id),
       meta_lead_sent = VALUES(meta_lead_sent),
       brevo_synced = VALUES(brevo_synced),
       brevo_error = VALUES(brevo_error),
       client_ip = VALUES(client_ip),
       user_agent = VALUES(user_agent),
       updated_at = VALUES(updated_at)`,
    [
      leadUuid,
      fullName,
      schoolName,
      workEmail,
      phone || null,
      roleTitle || null,
      studentPopulation || null,
      Number.isFinite(score) ? Math.max(0, Math.min(90, Math.round(score))) : 0,
      bandKey,
      headline || null,
      nextStep || null,
      answersJson,
      sourcePath || null,
      eventSourceUrl || null,
      metaEventId || null,
      metaLeadSent,
      brevoSynced,
      brevoError || null,
      clientIp || null,
      userAgent || null,
      now,
      now,
    ]
  );
}

async function listSchoolScorecardLeads(pool, input) {
  const limitRaw = Number(input && input.limit || 100);
  const limit = Number.isFinite(limitRaw) ? Math.max(10, Math.min(300, Math.round(limitRaw))) : 100;

  const [rows] = await pool.query(
    `SELECT
       s.id,
       s.lead_uuid,
       s.full_name,
       s.school_name,
       s.work_email,
       s.phone,
       s.role_title,
       s.student_population,
       s.score,
       s.band_key,
       s.headline,
       s.next_step,
       s.answers_json,
       s.meta_event_id,
       s.meta_lead_sent,
       s.brevo_synced,
       s.brevo_error,
       s.source_path,
       s.event_source_url,
       DATE_FORMAT(s.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
       DATE_FORMAT(s.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
       c.booking_uuid AS call_booking_uuid,
       c.status AS call_status,
       c.call_outcome_status,
       c.assigned_owner,
       c.zoom_join_url,
       DATE_FORMAT(c.slot_start_utc, '%Y-%m-%d %H:%i:%s') AS call_slot_start_utc,
       DATE_FORMAT(c.slot_end_utc, '%Y-%m-%d %H:%i:%s') AS call_slot_end_utc,
       DATE_FORMAT(c.next_follow_up_at, '%Y-%m-%d %H:%i:%s') AS call_next_follow_up_at,
       DATE_FORMAT(c.outcome_updated_at, '%Y-%m-%d %H:%i:%s') AS call_outcome_updated_at
     FROM ${SCHOOL_SCORECARDS_TABLE} s
     LEFT JOIN ${SCHOOL_CALL_BOOKINGS_TABLE} c
       ON c.id = (
         SELECT c2.id
         FROM ${SCHOOL_CALL_BOOKINGS_TABLE} c2
         WHERE c2.work_email = s.work_email
         ORDER BY COALESCE(c2.slot_start_utc, c2.created_at) DESC, c2.id DESC
         LIMIT 1
       )
     ORDER BY s.created_at DESC, s.id DESC
     LIMIT ${limit}`
  );

  return (rows || []).map(function (row) {
    var answers = [];
    try {
      const parsed = row.answers_json ? JSON.parse(String(row.answers_json)) : [];
      if (Array.isArray(parsed)) answers = parsed;
    } catch (_error) {
      answers = [];
    }

    return {
      id: Number(row.id || 0),
      leadUuid: clean(row.lead_uuid, 64),
      fullName: clean(row.full_name, 180),
      schoolName: clean(row.school_name, 220),
      workEmail: clean(row.work_email, 220),
      phone: clean(row.phone, 80),
      role: clean(row.role_title, 140),
      studentPopulation: clean(row.student_population, 60),
      score: Number(row.score || 0),
      bandKey: clean(row.band_key, 40),
      headline: clean(row.headline, 255),
      nextStep: clean(row.next_step, 255),
      answers: answers,
      metaEventId: clean(row.meta_event_id, 120),
      metaLeadSent: Number(row.meta_lead_sent || 0) === 1,
      brevoSynced: Number(row.brevo_synced || 0) === 1,
      brevoError: clean(row.brevo_error, 255),
      sourcePath: clean(row.source_path, 255),
      eventSourceUrl: clean(row.event_source_url, 1200),
      createdAt: isoFromSql(row.created_at),
      updatedAt: isoFromSql(row.updated_at),
      call: {
        bookingUuid: clean(row.call_booking_uuid, 64),
        status: clean(row.call_status, 40),
        outcomeStatus: clean(row.call_outcome_status, 40),
        assignedOwner: clean(row.assigned_owner, 180),
        zoomJoinUrl: clean(row.zoom_join_url, 1200),
        slotStartIso: isoFromSql(row.call_slot_start_utc),
        slotEndIso: isoFromSql(row.call_slot_end_utc),
        nextFollowUpAt: isoFromSql(row.call_next_follow_up_at),
        outcomeUpdatedAt: isoFromSql(row.call_outcome_updated_at),
      },
    };
  });
}

module.exports = {
  SCHOOL_SCORECARDS_TABLE,
  ensureSchoolScorecardTablesTochukwu,
  saveSchoolScorecardLead,
  listSchoolScorecardLeads,
  toDateTimeSql,
};
