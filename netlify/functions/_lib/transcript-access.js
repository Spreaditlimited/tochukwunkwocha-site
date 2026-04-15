const crypto = require("crypto");
const { nowSql } = require("./db");
const { canonicalizeCourseSlug } = require("./course-config");

const TRANSCRIPT_ACCESS_TABLE = "tochukwu_transcript_access";
const TRANSCRIPT_AUDIT_TABLE = "tochukwu_transcript_access_audit";
let transcriptTablesEnsured = false;
let transcriptTablesEnsurePromise = null;

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function normalizeCourseSlug(value) {
  const raw = clean(value, 160).toLowerCase();
  if (!raw) return "";
  return clean(canonicalizeCourseSlug(raw), 160).toLowerCase();
}

function normalizeStatus(value) {
  const raw = clean(value, 32).toLowerCase();
  if (raw === "approved" || raw === "revoked") return raw;
  return "pending";
}

function jsonStringifySafe(value) {
  try {
    return JSON.stringify(value == null ? null : value);
  } catch (_error) {
    return null;
  }
}

function hashValue(raw) {
  const input = clean(raw, 400);
  if (!input) return "";
  return crypto.createHash("sha256").update(input).digest("hex");
}

function readHeader(event, name) {
  const headers = event && event.headers ? event.headers : {};
  return clean(headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || "", 255);
}

function getClientIp(event) {
  const xff = clean(readHeader(event, "x-forwarded-for"), 255);
  if (xff) return clean(xff.split(",")[0], 120);
  return clean(readHeader(event, "cf-connecting-ip") || readHeader(event, "x-real-ip"), 120);
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (error) {
    const msg = String((error && error.message) || "").toLowerCase();
    if (
      msg.indexOf("duplicate column") !== -1 ||
      msg.indexOf("duplicate key name") !== -1 ||
      msg.indexOf("already exists") !== -1 ||
      msg.indexOf("can't drop") !== -1 ||
      msg.indexOf("check that column/key exists") !== -1 ||
      msg.indexOf("duplicate entry") !== -1
    ) {
      return;
    }
    throw error;
  }
}

async function ensureTranscriptAccessTables(pool) {
  if (transcriptTablesEnsured) return;
  if (transcriptTablesEnsurePromise) {
    await transcriptTablesEnsurePromise;
    return;
  }

  transcriptTablesEnsurePromise = (async function () {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${TRANSCRIPT_ACCESS_TABLE} (
        id BIGINT NOT NULL AUTO_INCREMENT,
        account_id BIGINT NOT NULL,
        course_slug VARCHAR(120) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        request_reason TEXT NULL,
        requested_at DATETIME NULL,
        approved_at DATETIME NULL,
        approved_by VARCHAR(64) NULL,
        expires_at DATETIME NULL,
        notes TEXT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_tochukwu_transcript_access_account_course (account_id, course_slug),
        KEY idx_tochukwu_transcript_access_status (status, updated_at),
        KEY idx_tochukwu_transcript_access_course (course_slug, status, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_ACCESS_TABLE} ADD COLUMN request_reason TEXT NULL`);
    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_ACCESS_TABLE} ADD COLUMN requested_at DATETIME NULL`);
    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_ACCESS_TABLE} ADD COLUMN approved_at DATETIME NULL`);
    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_ACCESS_TABLE} ADD COLUMN approved_by VARCHAR(64) NULL`);
    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_ACCESS_TABLE} ADD COLUMN expires_at DATETIME NULL`);
    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_ACCESS_TABLE} ADD COLUMN notes TEXT NULL`);
    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_ACCESS_TABLE} ADD UNIQUE KEY uniq_tochukwu_transcript_access_account_course (account_id, course_slug)`);
    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_ACCESS_TABLE} ADD KEY idx_tochukwu_transcript_access_status (status, updated_at)`);
    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_ACCESS_TABLE} ADD KEY idx_tochukwu_transcript_access_course (course_slug, status, updated_at)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${TRANSCRIPT_AUDIT_TABLE} (
        id BIGINT NOT NULL AUTO_INCREMENT,
        account_id BIGINT NOT NULL,
        course_slug VARCHAR(120) NOT NULL,
        lesson_id BIGINT NULL,
        event_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        detail_json LONGTEXT NULL,
        ip_hash VARCHAR(128) NULL,
        user_agent VARCHAR(255) NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        KEY idx_tochukwu_transcript_audit_account (account_id, created_at),
        KEY idx_tochukwu_transcript_audit_course (course_slug, created_at),
        KEY idx_tochukwu_transcript_audit_event (event_type, status, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_AUDIT_TABLE} ADD COLUMN lesson_id BIGINT NULL`);
    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_AUDIT_TABLE} ADD COLUMN detail_json LONGTEXT NULL`);
    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_AUDIT_TABLE} ADD COLUMN ip_hash VARCHAR(128) NULL`);
    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_AUDIT_TABLE} ADD COLUMN user_agent VARCHAR(255) NULL`);
    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_AUDIT_TABLE} ADD KEY idx_tochukwu_transcript_audit_account (account_id, created_at)`);
    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_AUDIT_TABLE} ADD KEY idx_tochukwu_transcript_audit_course (course_slug, created_at)`);
    await safeAlter(pool, `ALTER TABLE ${TRANSCRIPT_AUDIT_TABLE} ADD KEY idx_tochukwu_transcript_audit_event (event_type, status, created_at)`);

    transcriptTablesEnsured = true;
  })();

  try {
    await transcriptTablesEnsurePromise;
  } finally {
    transcriptTablesEnsurePromise = null;
  }
}

async function getTranscriptAccess(pool, input) {
  await ensureTranscriptAccessTables(pool);
  const accountId = Number(input && input.account_id);
  const courseSlug = normalizeCourseSlug(input && input.course_slug);
  if (!Number.isFinite(accountId) || accountId <= 0 || !courseSlug) return null;

  const [rows] = await pool.query(
    `SELECT id, account_id, course_slug, status, request_reason, requested_at, approved_at, approved_by, expires_at, notes, created_at, updated_at
     FROM ${TRANSCRIPT_ACCESS_TABLE}
     WHERE account_id = ?
       AND course_slug = ?
     LIMIT 1`,
    [accountId, courseSlug]
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function canViewTranscript(pool, input) {
  const access = await getTranscriptAccess(pool, input);
  if (!access) {
    return { allowed: false, status: "none", reason: "not_approved" };
  }
  const status = normalizeStatus(access.status);
  if (status !== "approved") {
    return { allowed: false, status, reason: status === "revoked" ? "revoked" : "pending_review" };
  }

  const expiresRaw = clean(access.expires_at, 40);
  if (expiresRaw) {
    const expMs = new Date(expiresRaw).getTime();
    if (Number.isFinite(expMs) && expMs < Date.now()) {
      return { allowed: false, status: "expired", reason: "expired" };
    }
  }

  return { allowed: true, status: "approved", reason: "approved", access };
}

async function upsertTranscriptAccessRequest(pool, input) {
  await ensureTranscriptAccessTables(pool);
  const accountId = Number(input && input.account_id);
  const courseSlug = normalizeCourseSlug(input && input.course_slug);
  const reason = clean(input && input.request_reason, 4000) || null;
  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error("Invalid account_id");
  if (!courseSlug) throw new Error("course_slug is required");

  const now = nowSql();
  await pool.query(
    `INSERT INTO ${TRANSCRIPT_ACCESS_TABLE}
      (account_id, course_slug, status, request_reason, requested_at, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      status = CASE WHEN status = 'approved' THEN status ELSE 'pending' END,
      request_reason = CASE WHEN status = 'approved' THEN request_reason ELSE VALUES(request_reason) END,
      requested_at = CASE WHEN status = 'approved' THEN requested_at ELSE VALUES(requested_at) END,
      updated_at = VALUES(updated_at)`,
    [accountId, courseSlug, reason, now, now, now]
  );
  return getTranscriptAccess(pool, { account_id: accountId, course_slug: courseSlug });
}

async function setTranscriptAccessStatus(pool, input) {
  await ensureTranscriptAccessTables(pool);
  const accountId = Number(input && input.account_id);
  const courseSlug = normalizeCourseSlug(input && input.course_slug);
  const status = normalizeStatus(input && input.status);
  const notes = clean(input && input.notes, 4000) || null;
  const approvedBy = clean(input && input.approved_by, 64) || "admin";
  const expiresAt = clean(input && input.expires_at, 64) || null;
  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error("Invalid account_id");
  if (!courseSlug) throw new Error("course_slug is required");

  const now = nowSql();
  await pool.query(
    `INSERT INTO ${TRANSCRIPT_ACCESS_TABLE}
      (account_id, course_slug, status, approved_at, approved_by, expires_at, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      approved_at = VALUES(approved_at),
      approved_by = VALUES(approved_by),
      expires_at = VALUES(expires_at),
      notes = VALUES(notes),
      updated_at = VALUES(updated_at)`,
    [
      accountId,
      courseSlug,
      status,
      status === "approved" ? now : null,
      status === "approved" ? approvedBy : null,
      expiresAt || null,
      notes,
      now,
      now,
    ]
  );

  return getTranscriptAccess(pool, { account_id: accountId, course_slug: courseSlug });
}

async function logTranscriptAudit(pool, input) {
  await ensureTranscriptAccessTables(pool);
  const accountId = Number(input && input.account_id);
  const courseSlug = normalizeCourseSlug(input && input.course_slug);
  const lessonId = Number(input && input.lesson_id);
  const eventType = clean(input && input.event_type, 50).toLowerCase() || "unknown";
  const status = clean(input && input.status, 20).toLowerCase() || "unknown";
  const detailJson = jsonStringifySafe(input && input.detail);
  const userAgent = clean(input && input.user_agent, 255) || null;
  const ipHash = clean(input && input.ip_hash, 128) || null;
  if (!Number.isFinite(accountId) || accountId <= 0 || !courseSlug) return;

  await pool.query(
    `INSERT INTO ${TRANSCRIPT_AUDIT_TABLE}
      (account_id, course_slug, lesson_id, event_type, status, detail_json, ip_hash, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      accountId,
      courseSlug,
      Number.isFinite(lessonId) && lessonId > 0 ? lessonId : null,
      eventType,
      status,
      detailJson,
      ipHash,
      userAgent,
      nowSql(),
    ]
  );
}

async function getTranscriptAccessByEmail(pool, input) {
  await ensureTranscriptAccessTables(pool);
  const email = clean(input && input.email, 220).toLowerCase();
  const courseSlug = normalizeCourseSlug(input && input.course_slug);
  if (!email) throw new Error("email is required");
  if (!courseSlug) throw new Error("course_slug is required");

  const [accountRows] = await pool.query(
    `SELECT id, account_uuid, full_name, email
     FROM student_accounts
     WHERE email = ?
     LIMIT 1`,
    [email]
  );
  if (!Array.isArray(accountRows) || !accountRows.length) {
    return { account: null, access: null };
  }
  const account = accountRows[0];
  const access = await getTranscriptAccess(pool, {
    account_id: Number(account.id),
    course_slug: courseSlug,
  });
  return { account, access };
}

function buildTranscriptWatermark(input) {
  const email = clean(input && input.email, 220).toLowerCase();
  const lessonId = Number(input && input.lesson_id);
  const stamp = nowSql();
  const marker = hashValue(String(input && input.account_id || "") + "|" + email + "|" + String(lessonId || 0) + "|" + stamp).slice(0, 12);
  return [
    "",
    "",
    "[Confidential transcript access]",
    "Account: " + (email || "unknown"),
    "Lesson ID: " + (lessonId > 0 ? String(lessonId) : "n/a"),
    "Marker: " + marker,
    "Generated: " + stamp,
  ].join("\n");
}

module.exports = {
  TRANSCRIPT_ACCESS_TABLE,
  TRANSCRIPT_AUDIT_TABLE,
  ensureTranscriptAccessTables,
  getTranscriptAccess,
  getTranscriptAccessByEmail,
  canViewTranscript,
  upsertTranscriptAccessRequest,
  setTranscriptAccessStatus,
  logTranscriptAudit,
  buildTranscriptWatermark,
  hashValue,
  getClientIp,
  readHeader,
};
