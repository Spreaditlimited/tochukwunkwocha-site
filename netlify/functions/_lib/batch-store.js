const { nowSql } = require("./db");

const DEFAULT_COURSE_SLUG = "prompt-to-profit";
const DEFAULT_BATCH_KEY = "ptp-batch-1";
const DEFAULT_BATCH_LABEL = "Batch 1";
const DEFAULT_PREFIX = "PTP";
const DEFAULT_AMOUNT_MINOR = Number(process.env.PROMPT_TO_PROFIT_PRICE_NGN_MINOR || 1075000);

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
  return String(value || DEFAULT_PREFIX)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

async function ensureCourseBatchesTable(pool) {
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
      activated_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_course_batch (course_slug, batch_key),
      KEY idx_course_batches_active (course_slug, is_active, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE course_batches ADD COLUMN activated_at DATETIME NULL`);

  const now = nowSql();
  await pool.query(
    `INSERT INTO course_batches
      (course_slug, batch_key, batch_label, status, is_active, paystack_reference_prefix, paystack_amount_minor, activated_at, created_at, updated_at)
     SELECT ?, ?, ?, 'closed', 1, ?, ?, ?, ?, ?
     FROM DUAL
     WHERE NOT EXISTS (
       SELECT 1 FROM course_batches WHERE course_slug = ? AND batch_key = ?
     )`,
    [
      DEFAULT_COURSE_SLUG,
      DEFAULT_BATCH_KEY,
      DEFAULT_BATCH_LABEL,
      DEFAULT_PREFIX,
      DEFAULT_AMOUNT_MINOR,
      now,
      now,
      now,
      DEFAULT_COURSE_SLUG,
      DEFAULT_BATCH_KEY,
    ]
  );

  const [activeRows] = await pool.query(
    `SELECT id
     FROM course_batches
     WHERE course_slug = ?
       AND is_active = 1
     ORDER BY id DESC
     LIMIT 1`,
    [DEFAULT_COURSE_SLUG]
  );

  if (!activeRows || !activeRows.length) {
    await pool.query(
      `UPDATE course_batches
       SET is_active = 1, activated_at = ?, updated_at = ?
       WHERE course_slug = ?
       ORDER BY id ASC
       LIMIT 1`,
      [now, now, DEFAULT_COURSE_SLUG]
    );
  }
}

async function listCourseBatches(pool, courseSlug) {
  const slug = String(courseSlug || DEFAULT_COURSE_SLUG).trim().slice(0, 120) || DEFAULT_COURSE_SLUG;
  await ensureCourseBatchesTable(pool);
  const [rows] = await pool.query(
    `SELECT course_slug,
            batch_key,
            batch_label,
            status,
            is_active,
            paystack_reference_prefix,
            paystack_amount_minor,
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
  const slug = String(courseSlug || DEFAULT_COURSE_SLUG).trim().slice(0, 120) || DEFAULT_COURSE_SLUG;
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
  const slug = String(courseSlug || DEFAULT_COURSE_SLUG).trim().slice(0, 120) || DEFAULT_COURSE_SLUG;
  await ensureCourseBatchesTable(pool);
  const [rows] = await pool.query(
    `SELECT course_slug,
            batch_key,
            batch_label,
            status,
            is_active,
            paystack_reference_prefix,
            paystack_amount_minor,
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
  const slug = String(courseSlug || DEFAULT_COURSE_SLUG).trim().slice(0, 120) || DEFAULT_COURSE_SLUG;
  const key = normalizeBatchKey(batchKey);
  if (key && key !== "all") {
    const found = await getCourseBatchByKey(pool, slug, key);
    if (found) return found;
  }
  return getActiveCourseBatch(pool, slug);
}

async function createCourseBatch(pool, input) {
  const courseSlug = String((input && input.courseSlug) || DEFAULT_COURSE_SLUG).trim().slice(0, 120) || DEFAULT_COURSE_SLUG;
  const batchLabel = String((input && input.batchLabel) || "").trim().slice(0, 120);
  const batchKeyRaw = String((input && input.batchKey) || "").trim();
  const batchKey = normalizeBatchKey(batchKeyRaw || batchLabel);
  const status = String((input && input.status) || "closed").trim().toLowerCase() === "open" ? "open" : "closed";
  const paystackReferencePrefix = normalizePrefix(input && input.paystackReferencePrefix);
  const paystackAmountMinor = Number((input && input.paystackAmountMinor) || DEFAULT_AMOUNT_MINOR);

  if (!batchLabel) throw new Error("Batch label is required");
  if (!batchKey) throw new Error("Batch key is required");
  if (!Number.isFinite(paystackAmountMinor) || paystackAmountMinor <= 0) {
    throw new Error("Valid paystack amount is required");
  }

  await ensureCourseBatchesTable(pool);
  const now = nowSql();
  await pool.query(
    `INSERT INTO course_batches
      (course_slug, batch_key, batch_label, status, is_active, paystack_reference_prefix, paystack_amount_minor, activated_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, NULL, ?, ?)`,
    [courseSlug, batchKey, batchLabel, status, paystackReferencePrefix, Math.round(paystackAmountMinor), now, now]
  );

  return getCourseBatchByKey(pool, courseSlug, batchKey);
}

async function activateCourseBatch(pool, input) {
  const courseSlug = String((input && input.courseSlug) || DEFAULT_COURSE_SLUG).trim().slice(0, 120) || DEFAULT_COURSE_SLUG;
  const batchKey = normalizeBatchKey(input && input.batchKey);
  if (!batchKey) throw new Error("batchKey is required");

  await ensureCourseBatchesTable(pool);
  const target = await getCourseBatchByKey(pool, courseSlug, batchKey);
  if (!target) throw new Error("Batch not found");

  const now = nowSql();
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
         activated_at = ?,
         updated_at = ?
     WHERE course_slug = ?
       AND batch_key = ?`,
    [now, now, courseSlug, batchKey]
  );

  return getActiveCourseBatch(pool, courseSlug);
}

module.exports = {
  DEFAULT_COURSE_SLUG,
  normalizeBatchKey,
  ensureCourseBatchesTable,
  listCourseBatches,
  getCourseBatchByKey,
  getActiveCourseBatch,
  resolveCourseBatch,
  createCourseBatch,
  activateCourseBatch,
};
