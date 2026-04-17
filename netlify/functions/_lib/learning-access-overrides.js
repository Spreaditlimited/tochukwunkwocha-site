const crypto = require("crypto");
const { nowSql } = require("./db");
const { runtimeSchemaChangesAllowed } = require("./schema-mode");

const LEARNING_ACCESS_OVERRIDES_TABLE = "tochukwu_learning_access_overrides";
let learningAccessOverridesEnsured = false;
let learningAccessOverridesAvailable = false;

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function normalizeEmail(value) {
  return clean(value, 220).toLowerCase();
}

function normalizeCourseSlug(value) {
  return clean(value, 120).toLowerCase();
}

function normalizeStatus(value) {
  var status = clean(value, 24).toLowerCase();
  if (status === "active" || status === "revoked") return status;
  return "active";
}

function normalizeDateTime(value) {
  var raw = clean(value, 64);
  if (!raw) return null;
  var d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function toFlag(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback ? 1 : 0;
  if (value === true) return 1;
  if (value === false) return 0;
  var raw = clean(value, 12).toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes") return 1;
  if (raw === "0" || raw === "false" || raw === "no") return 0;
  return fallback ? 1 : 0;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id || 0),
    override_uuid: clean(row.override_uuid, 64),
    email: normalizeEmail(row.email),
    course_slug: normalizeCourseSlug(row.course_slug),
    allow_before_release: Number(row.allow_before_release || 0) === 1,
    allow_before_batch_start: Number(row.allow_before_batch_start || 0) === 1,
    expires_at: row.expires_at || null,
    status: normalizeStatus(row.status || "active"),
    note: clean(row.note, 500),
    created_by: clean(row.created_by, 160),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

function isMissingTableError(error) {
  var code = String((error && error.code) || "").trim().toUpperCase();
  var msg = String((error && error.message) || "").toLowerCase();
  return code === "ER_NO_SUCH_TABLE" || msg.indexOf("doesn't exist") !== -1 || msg.indexOf("does not exist") !== -1;
}

async function hasOverridesTable(pool) {
  var [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?
     LIMIT 1`,
    [LEARNING_ACCESS_OVERRIDES_TABLE]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureLearningAccessOverridesTable(pool, options) {
  var opts = options && typeof options === "object" ? options : {};
  var bootstrap = !!opts.bootstrap;
  if (learningAccessOverridesEnsured) return learningAccessOverridesAvailable;
  if (!runtimeSchemaChangesAllowed() && !bootstrap) {
    learningAccessOverridesAvailable = await hasOverridesTable(pool).catch(function () {
      return false;
    });
    learningAccessOverridesEnsured = true;
    return learningAccessOverridesAvailable;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${LEARNING_ACCESS_OVERRIDES_TABLE} (
        id BIGINT NOT NULL AUTO_INCREMENT,
        override_uuid VARCHAR(64) NOT NULL,
        email VARCHAR(220) NOT NULL,
        course_slug VARCHAR(120) NOT NULL,
        allow_before_release TINYINT(1) NOT NULL DEFAULT 1,
        allow_before_batch_start TINYINT(1) NOT NULL DEFAULT 1,
        expires_at DATETIME NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'active',
        note VARCHAR(500) NULL,
        created_by VARCHAR(160) NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_learning_override_uuid (override_uuid),
        KEY idx_learning_override_lookup (email, course_slug, status, expires_at),
        KEY idx_learning_override_status (status, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await safeAlter(pool, `ALTER TABLE ${LEARNING_ACCESS_OVERRIDES_TABLE} ADD COLUMN allow_before_release TINYINT(1) NOT NULL DEFAULT 1`);
    await safeAlter(pool, `ALTER TABLE ${LEARNING_ACCESS_OVERRIDES_TABLE} ADD COLUMN allow_before_batch_start TINYINT(1) NOT NULL DEFAULT 1`);
    await safeAlter(pool, `ALTER TABLE ${LEARNING_ACCESS_OVERRIDES_TABLE} ADD COLUMN expires_at DATETIME NULL`);
    await safeAlter(pool, `ALTER TABLE ${LEARNING_ACCESS_OVERRIDES_TABLE} ADD COLUMN status VARCHAR(24) NOT NULL DEFAULT 'active'`);
    await safeAlter(pool, `ALTER TABLE ${LEARNING_ACCESS_OVERRIDES_TABLE} ADD COLUMN note VARCHAR(500) NULL`);
    await safeAlter(pool, `ALTER TABLE ${LEARNING_ACCESS_OVERRIDES_TABLE} ADD COLUMN created_by VARCHAR(160) NULL`);
    await safeAlter(pool, `ALTER TABLE ${LEARNING_ACCESS_OVERRIDES_TABLE} ADD KEY idx_learning_override_lookup (email, course_slug, status, expires_at)`);
    await safeAlter(pool, `ALTER TABLE ${LEARNING_ACCESS_OVERRIDES_TABLE} ADD KEY idx_learning_override_status (status, updated_at)`);
    learningAccessOverridesAvailable = true;
  } catch (_error) {
    learningAccessOverridesAvailable = await hasOverridesTable(pool).catch(function () {
      return false;
    });
  }

  learningAccessOverridesEnsured = true;
  return learningAccessOverridesAvailable;
}

async function getActiveLearningAccessOverride(pool, input) {
  var available = await ensureLearningAccessOverridesTable(pool);
  if (!available) return null;
  var email = normalizeEmail(input && input.email);
  var courseSlug = normalizeCourseSlug(input && input.course_slug);
  if (!email || !courseSlug) return null;
  var rows;
  try {
    var result = await pool.query(
      `SELECT id, override_uuid, email, course_slug, allow_before_release, allow_before_batch_start,
              DATE_FORMAT(expires_at, '%Y-%m-%d %H:%i:%s') AS expires_at,
              status, note, created_by,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM ${LEARNING_ACCESS_OVERRIDES_TABLE}
       WHERE LOWER(email) COLLATE utf8mb4_general_ci = ?
         AND course_slug = ?
         AND status = 'active'
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [email, courseSlug]
    );
    rows = result && result[0];
  } catch (error) {
    if (isMissingTableError(error)) {
      learningAccessOverridesAvailable = false;
      return null;
    }
    throw error;
  }
  if (!Array.isArray(rows) || !rows.length) return null;
  return mapRow(rows[0]);
}

async function setLearningAccessOverride(pool, input) {
  var available = await ensureLearningAccessOverridesTable(pool);
  if (!available) {
    throw new Error("Learning access override storage is not provisioned yet. Create table tochukwu_learning_access_overrides first.");
  }
  var email = normalizeEmail(input && input.email);
  var courseSlug = normalizeCourseSlug(input && input.course_slug);
  if (!email || !courseSlug) throw new Error("email and course_slug are required");
  var status = normalizeStatus(input && input.status);
  var now = nowSql();

  if (status === "revoked") {
    await pool.query(
      `UPDATE ${LEARNING_ACCESS_OVERRIDES_TABLE}
       SET status = 'revoked',
           updated_at = ?
       WHERE LOWER(email) COLLATE utf8mb4_general_ci = ?
         AND course_slug = ?
         AND status = 'active'`,
      [now, email, courseSlug]
    );
    return getActiveLearningAccessOverride(pool, { email: email, course_slug: courseSlug });
  }

  var allowBeforeRelease = toFlag(input && input.allow_before_release, true);
  var allowBeforeBatchStart = toFlag(input && input.allow_before_batch_start, true);
  var expiresAt = normalizeDateTime(input && input.expires_at);
  var note = clean(input && input.note, 500) || null;
  var createdBy = clean(input && input.created_by, 160) || null;

  await pool.query(
    `UPDATE ${LEARNING_ACCESS_OVERRIDES_TABLE}
     SET status = 'revoked',
         updated_at = ?
     WHERE LOWER(email) COLLATE utf8mb4_general_ci = ?
       AND course_slug = ?
       AND status = 'active'`,
    [now, email, courseSlug]
  );

  await pool.query(
    `INSERT INTO ${LEARNING_ACCESS_OVERRIDES_TABLE}
      (override_uuid, email, course_slug, allow_before_release, allow_before_batch_start, expires_at, status, note, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    [
      "lgo_" + crypto.randomUUID().replace(/-/g, ""),
      email,
      courseSlug,
      allowBeforeRelease,
      allowBeforeBatchStart,
      expiresAt,
      note,
      createdBy,
      now,
      now,
    ]
  );
  return getActiveLearningAccessOverride(pool, { email: email, course_slug: courseSlug });
}

module.exports = {
  LEARNING_ACCESS_OVERRIDES_TABLE,
  ensureLearningAccessOverridesTable,
  getActiveLearningAccessOverride,
  setLearningAccessOverride,
};
