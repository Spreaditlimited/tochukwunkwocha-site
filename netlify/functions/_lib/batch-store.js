const { nowSql } = require("./db");
const { applyRuntimeSettings } = require("./runtime-settings");
const { ensureLearningTables, ensureCourseSlugForeignKey } = require("./learning");
const {
  DEFAULT_COURSE_SLUG,
  getCourseConfig,
  listCourseConfigs,
  normalizeCourseSlug,
  getCourseDefaultAmountMinor,
  getCourseDefaultPaypalMinor,
} = require("./course-config");

const FALLBACK_CONFIG = getCourseConfig(DEFAULT_COURSE_SLUG);
let courseBatchesEnsured = false;

function slugTokenFromBatchKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  const compact = raw.replace(/[^a-z0-9]/g, "");
  if (!compact) return "";
  if (compact.includes("ptprod")) return "ptprod";
  if (compact.includes("ptp")) return "ptp";
  return "";
}

function normalizeBatchKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function normalizePrefix(value) {
  return String(value || (FALLBACK_CONFIG && FALLBACK_CONFIG.defaultPrefix) || "PTP")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
}

function normalizeBatchStartAt(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) throw new Error("Valid batch start date is required");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || "0");
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    throw new Error("Valid batch start date is required");
  }
  // Persist exactly as entered (WAT wall-clock semantics).
  const pad = function (n) {
    return String(n).padStart(2, "0");
  };
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function batchLooksCrossCourse(courseSlug, batch) {
  if (!batch) return false;
  const slug = normalizeCourseSlug(courseSlug, DEFAULT_COURSE_SLUG);
  const cfg = getCourseConfig(slug) || FALLBACK_CONFIG;
  const expectedPrefix = normalizePrefix((cfg && cfg.defaultPrefix) || FALLBACK_CONFIG.defaultPrefix || "PTP");
  const expectedToken = slugTokenFromBatchKey((cfg && cfg.defaultBatchKey) || "");
  const activePrefix = normalizePrefix(String(batch.paystack_reference_prefix || ""));
  const activeToken = slugTokenFromBatchKey(batch.batch_key);
  const otherCoursePrefixes = (listCourseConfigs() || [])
    .map((item) => normalizePrefix((item && item.defaultPrefix) || ""))
    .filter((prefix) => prefix && prefix !== expectedPrefix);

  if (activeToken && expectedToken && activeToken !== expectedToken) return true;
  if (activePrefix && activePrefix !== expectedPrefix && otherCoursePrefixes.includes(activePrefix)) return true;
  return false;
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

async function ensureCourseBatchesTable(pool) {
  if (courseBatchesEnsured) {
    await applyRuntimeSettings(pool);
    return;
  }
  await applyRuntimeSettings(pool);
  await ensureLearningTables(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS course_batches (
      id BIGINT NOT NULL AUTO_INCREMENT,
      course_slug VARCHAR(120) NOT NULL,
      batch_key VARCHAR(64) NOT NULL,
      batch_label VARCHAR(120) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'closed',
      is_active TINYINT(1) NOT NULL DEFAULT 0,
      paystack_reference_prefix VARCHAR(20) NOT NULL DEFAULT 'PTP',
      paystack_amount_minor INT NOT NULL,
      paypal_amount_minor INT NOT NULL DEFAULT 2400,
      brevo_list_id VARCHAR(64) NULL,
      batch_start_at DATETIME NULL,
      activated_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_course_batch (course_slug, batch_key),
      KEY idx_course_batches_active (course_slug, is_active, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE course_batches ADD COLUMN activated_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE course_batches ADD COLUMN batch_start_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE course_batches ADD COLUMN paypal_amount_minor INT NOT NULL DEFAULT 2400`);
  await safeAlter(pool, `ALTER TABLE course_batches ADD COLUMN brevo_list_id VARCHAR(64) NULL`);

  const now = nowSql();
  const configs = listCourseConfigs();

  for (const cfg of configs) {
    const slug = normalizeCourseSlug(cfg.slug, DEFAULT_COURSE_SLUG);
    const batchKey = normalizeBatchKey(cfg.defaultBatchKey || "batch-1");
    const batchLabel = String(cfg.defaultBatchLabel || "Batch 1").trim().slice(0, 120) || "Batch 1";
    const prefix = normalizePrefix(cfg.defaultPrefix || "PTP");
    const amountMinor = getCourseDefaultAmountMinor(slug);
    const paypalAmountMinor = getCourseDefaultPaypalMinor(slug);

    await pool.query(
      `INSERT INTO course_batches
        (course_slug, batch_key, batch_label, status, is_active, paystack_reference_prefix, paystack_amount_minor, paypal_amount_minor, activated_at, created_at, updated_at)
       SELECT ?, ?, ?, 'closed', 1, ?, ?, ?, ?, ?, ?
       FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM course_batches WHERE course_slug = ? AND batch_key = ?
       )`,
      [slug, batchKey, batchLabel, prefix, amountMinor, paypalAmountMinor, now, now, now, slug, batchKey]
    );

    // Backfill old auto-seeded Prompt to Production defaults created with legacy N10,750 fallback.
    if (slug === "prompt-to-production") {
      await pool.query(
        `UPDATE course_batches
         SET paystack_amount_minor = ?, updated_at = ?
         WHERE course_slug = ?
           AND batch_key = ?
           AND paystack_amount_minor = 1075000`,
        [amountMinor, now, slug, batchKey]
      );
    }

    const [activeRows] = await pool.query(
      `SELECT id
       FROM course_batches
       WHERE course_slug = ?
         AND is_active = 1
       ORDER BY id DESC
       LIMIT 1`,
      [slug]
    );

    if (!activeRows || !activeRows.length) {
      await pool.query(
        `UPDATE course_batches
         SET is_active = 1, activated_at = ?, updated_at = ?
         WHERE course_slug = ?
         ORDER BY id ASC
         LIMIT 1`,
        [now, now, slug]
      );
    }
  }

  await pool.query(
    `UPDATE course_batches
     SET course_slug = 'prompt-to-profit-schools'
     WHERE course_slug = 'prompt-to-profit-for-schools'`
  );

  await ensureCourseSlugForeignKey(pool, {
    tableName: "course_batches",
    columnName: "course_slug",
    constraintName: "fk_course_batches_learning_course_slug",
  });
  courseBatchesEnsured = true;
}

async function listCourseBatches(pool, courseSlug) {
  const slug = normalizeCourseSlug(courseSlug, DEFAULT_COURSE_SLUG);
  await ensureCourseBatchesTable(pool);
  const [rows] = await pool.query(
    `SELECT course_slug,
            batch_key,
            batch_label,
            status,
            is_active,
            paystack_reference_prefix,
            paystack_amount_minor,
            paypal_amount_minor,
            DATE_FORMAT(batch_start_at, '%Y-%m-%d %H:%i:%s') AS batch_start_at,
            brevo_list_id,
            activated_at,
            created_at,
            updated_at
     FROM course_batches
     WHERE course_slug = ?
     ORDER BY is_active DESC, created_at DESC`,
    [slug]
  );
  return rows || [];
}

async function getCourseBatchByKey(pool, courseSlug, batchKey) {
  const slug = normalizeCourseSlug(courseSlug, DEFAULT_COURSE_SLUG);
  const key = normalizeBatchKey(batchKey);
  if (!key) return null;
  await ensureCourseBatchesTable(pool);
  const [rows] = await pool.query(
    `SELECT course_slug,
            batch_key,
            batch_label,
            status,
            is_active,
            paystack_reference_prefix,
            paystack_amount_minor,
            paypal_amount_minor,
            DATE_FORMAT(batch_start_at, '%Y-%m-%d %H:%i:%s') AS batch_start_at,
            brevo_list_id,
            activated_at,
            created_at,
            updated_at
     FROM course_batches
     WHERE course_slug = ?
       AND batch_key = ?
     LIMIT 1`,
    [slug, key]
  );
  return rows && rows.length ? rows[0] : null;
}

async function getActiveCourseBatch(pool, courseSlug) {
  const slug = normalizeCourseSlug(courseSlug, DEFAULT_COURSE_SLUG);
  await ensureCourseBatchesTable(pool);
  const [rows] = await pool.query(
    `SELECT course_slug,
            batch_key,
            batch_label,
            status,
            is_active,
            paystack_reference_prefix,
            paystack_amount_minor,
            paypal_amount_minor,
            DATE_FORMAT(batch_start_at, '%Y-%m-%d %H:%i:%s') AS batch_start_at,
            brevo_list_id,
            activated_at,
            created_at,
            updated_at
     FROM course_batches
     WHERE course_slug = ?
       AND is_active = 1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [slug]
  );
  if (rows && rows.length) return rows[0];
  const [fallback] = await pool.query(
    `SELECT course_slug,
            batch_key,
            batch_label,
            status,
            is_active,
            paystack_reference_prefix,
            paystack_amount_minor,
            paypal_amount_minor,
            DATE_FORMAT(batch_start_at, '%Y-%m-%d %H:%i:%s') AS batch_start_at,
            brevo_list_id,
            activated_at,
            created_at,
            updated_at
     FROM course_batches
     WHERE course_slug = ?
     ORDER BY created_at ASC
     LIMIT 1`,
    [slug]
  );
  return fallback && fallback.length ? fallback[0] : null;
}

async function resolveCourseBatch(pool, { courseSlug, batchKey }) {
  const slug = normalizeCourseSlug(courseSlug, DEFAULT_COURSE_SLUG);
  const key = normalizeBatchKey(batchKey);
  if (key && key !== "all") {
    const found = await getCourseBatchByKey(pool, slug, key);
    if (found && !batchLooksCrossCourse(slug, found)) return found;
  }
  const active = await getActiveCourseBatch(pool, slug);
  if (active && !batchLooksCrossCourse(slug, active)) return active;

  const cfg = getCourseConfig(slug) || FALLBACK_CONFIG;
  const defaultKey = normalizeBatchKey((cfg && cfg.defaultBatchKey) || "");
  if (defaultKey) {
    const fallback = await getCourseBatchByKey(pool, slug, defaultKey);
    if (fallback) return fallback;
  }
  return active;
}

async function createCourseBatch(pool, input) {
  const courseSlug = normalizeCourseSlug(input && input.courseSlug, DEFAULT_COURSE_SLUG);
  const batchLabel = String((input && input.batchLabel) || "").trim().slice(0, 120);
  const batchKeyRaw = String((input && input.batchKey) || "").trim();
  const batchKey = normalizeBatchKey(batchKeyRaw || batchLabel);
  const status = String((input && input.status) || "closed").trim().toLowerCase() === "open" ? "open" : "closed";
  const courseConfig = getCourseConfig(courseSlug) || FALLBACK_CONFIG;
  const paystackReferencePrefix = normalizePrefix((input && input.paystackReferencePrefix) || courseConfig.defaultPrefix);
  const paystackAmountMinor = Number(
    (input && input.paystackAmountMinor) || getCourseDefaultAmountMinor(courseSlug)
  );
  const paypalAmountMinor = Number(
    (input && input.paypalAmountMinor) || getCourseDefaultPaypalMinor(courseSlug)
  );
  const batchStartAt = normalizeBatchStartAt(input && input.batchStartAt);

  if (!batchLabel) throw new Error("Batch label is required");
  if (!batchKey) throw new Error("Batch key is required");
  if (!Number.isFinite(paystackAmountMinor) || paystackAmountMinor <= 0) {
    throw new Error("Valid paystack amount is required");
  }
  if (!Number.isFinite(paypalAmountMinor) || paypalAmountMinor <= 0) {
    throw new Error("Valid paypal amount is required");
  }

  await ensureCourseBatchesTable(pool);
  const now = nowSql();
  const brevoListIdRaw = input && input.brevoListId ? String(input.brevoListId).trim().slice(0, 64) : "";
  await pool.query(
    `INSERT INTO course_batches
      (course_slug, batch_key, batch_label, status, is_active, paystack_reference_prefix, paystack_amount_minor, paypal_amount_minor, brevo_list_id, batch_start_at, activated_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      courseSlug,
      batchKey,
      batchLabel,
      status,
      paystackReferencePrefix,
      Math.round(paystackAmountMinor),
      Math.round(paypalAmountMinor),
      brevoListIdRaw || null,
      batchStartAt,
      now,
      now,
    ]
  );

  return getCourseBatchByKey(pool, courseSlug, batchKey);
}

async function activateCourseBatch(pool, input) {
  const courseSlug = normalizeCourseSlug(input && input.courseSlug, DEFAULT_COURSE_SLUG);
  const batchKey = normalizeBatchKey(input && input.batchKey);
  if (!batchKey) throw new Error("batchKey is required");

  await ensureCourseBatchesTable(pool);
  const target = await getCourseBatchByKey(pool, courseSlug, batchKey);
  if (!target) throw new Error("Batch not found");

  const now = nowSql();
  const batchStartAt = normalizeBatchStartAt(input && input.batchStartAt) || target.batch_start_at || null;
  await pool.query(
    `UPDATE course_batches
     SET is_active = 0,
         updated_at = ?
     WHERE course_slug = ?`,
    [now, courseSlug]
  );
  await pool.query(
    `UPDATE course_batches
     SET is_active = 1,
         status = 'open',
         batch_start_at = ?,
         activated_at = ?,
         updated_at = ?
     WHERE course_slug = ?
       AND batch_key = ?`,
    [batchStartAt, now, now, courseSlug, batchKey]
  );

  return getActiveCourseBatch(pool, courseSlug);
}

async function updateCourseBatch(pool, input) {
  const courseSlug = normalizeCourseSlug(input && input.courseSlug, DEFAULT_COURSE_SLUG);
  const batchKey = normalizeBatchKey(input && input.batchKey);
  if (!batchKey) throw new Error("batchKey is required");

  await ensureCourseBatchesTable(pool);
  const target = await getCourseBatchByKey(pool, courseSlug, batchKey);
  if (!target) throw new Error("Batch not found");

  const batchLabel = String((input && input.batchLabel) || target.batch_label || "")
    .trim()
    .slice(0, 120);
  const paystackReferencePrefix = normalizePrefix(
    (input && input.paystackReferencePrefix) || target.paystack_reference_prefix
  );
  const paystackAmountMinorRaw =
    input && input.paystackAmountMinor !== undefined && input.paystackAmountMinor !== null
      ? Number(input.paystackAmountMinor)
      : Number(target.paystack_amount_minor || 0);
  const paypalAmountMinorRaw =
    input && input.paypalAmountMinor !== undefined && input.paypalAmountMinor !== null
      ? Number(input.paypalAmountMinor)
      : Number(target.paypal_amount_minor || 0);
  const batchStartAtRaw =
    input && Object.prototype.hasOwnProperty.call(input, "batchStartAt")
      ? input.batchStartAt
      : target.batch_start_at;
  const batchStartAt = normalizeBatchStartAt(batchStartAtRaw);
  const brevoListId = input && Object.prototype.hasOwnProperty.call(input, "brevoListId")
    ? String(input.brevoListId || "").trim().slice(0, 64)
    : String(target.brevo_list_id || "").trim().slice(0, 64);

  if (!batchLabel) throw new Error("Batch label is required");
  if (!Number.isFinite(paystackAmountMinorRaw) || paystackAmountMinorRaw <= 0) {
    throw new Error("Valid paystack amount is required");
  }
  if (!Number.isFinite(paypalAmountMinorRaw) || paypalAmountMinorRaw <= 0) {
    throw new Error("Valid paypal amount is required");
  }

  const now = nowSql();
  await pool.query(
    `UPDATE course_batches
     SET batch_label = ?,
         paystack_reference_prefix = ?,
         paystack_amount_minor = ?,
         paypal_amount_minor = ?,
         brevo_list_id = ?,
         batch_start_at = ?,
         updated_at = ?
     WHERE course_slug = ?
       AND batch_key = ?`,
    [
      batchLabel,
      paystackReferencePrefix,
      Math.round(paystackAmountMinorRaw),
      Math.round(paypalAmountMinorRaw),
      brevoListId || null,
      batchStartAt,
      now,
      courseSlug,
      batchKey,
    ]
  );

  return getCourseBatchByKey(pool, courseSlug, batchKey);
}

module.exports = {
  DEFAULT_COURSE_SLUG,
  normalizeBatchKey,
  ensureCourseBatchesTable,
  listCourseBatches,
  getCourseBatchByKey,
  getActiveCourseBatch,
  resolveCourseBatch,
  batchLooksCrossCourse,
  createCourseBatch,
  activateCourseBatch,
  updateCourseBatch,
};
