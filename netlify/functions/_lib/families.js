const crypto = require("crypto");
const { nowSql } = require("./db");
const { applyRuntimeSettings } = require("./runtime-settings");
const { runtimeSchemaChangesAllowed } = require("./schema-mode");
const {
  ensureStudentAuthTables,
  findStudentByEmail,
  createStudentAccount,
} = require("./student-auth");

const FAMILY_ACCOUNTS_TABLE = "family_accounts";
const FAMILY_CHILDREN_TABLE = "family_children";
const FAMILY_CHILD_ENROLLMENTS_TABLE = "family_child_enrollments";
const FAMILY_CODE_LENGTH = 10;
const FAMILY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_MAX_CHILDREN = 8;

let familyTablesEnsured = false;

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function normalizeEmail(value) {
  const email = clean(value, 220).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function familyEnrollmentEnabledForCourse(courseSlug) {
  const slug = clean(courseSlug, 120).toLowerCase();
  const defaultDisabled = ["ai-for-everyday-business-owners"];
  if (defaultDisabled.indexOf(slug) !== -1) return false;
  const disabled = String(process.env.FAMILY_ENROLLMENT_DISABLED_COURSES || "")
    .split(",")
    .map(function (item) { return clean(item, 120).toLowerCase(); })
    .filter(Boolean);
  return disabled.indexOf(slug) === -1;
}

function maxFamilyChildren() {
  const parsed = Number(process.env.FAMILY_ENROLLMENT_MAX_CHILDREN || DEFAULT_MAX_CHILDREN);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_CHILDREN;
  return Math.max(1, Math.min(20, Math.round(parsed)));
}

function normalizeFamilyChildren(input) {
  const rows = Array.isArray(input) ? input : [];
  const max = maxFamilyChildren();
  return rows
    .map(function (row) {
      const child = row && typeof row === "object" ? row : {};
      return {
        fullName: clean(child.fullName || child.full_name || child.name, 180),
        age: clean(child.age, 40),
        classLevel: clean(child.classLevel || child.class_level || child.className, 80),
        email: normalizeEmail(child.email),
      };
    })
    .filter(function (row) { return !!row.fullName; })
    .slice(0, max);
}

function normalizeFamilyPayload(body, fallbackName) {
  const familyMode = body && (
    body.familyEnrollment === true ||
    body.family_enrollment === true ||
    String(body.enrollmentMode || body.enrollment_mode || "").toLowerCase() === "family"
  );
  const children = normalizeFamilyChildren(body && body.children);
  if (!familyMode && children.length <= 1) {
    return {
      isFamily: false,
      seatCount: 1,
      children: [],
    };
  }
  if (!children.length && fallbackName) {
    children.push({ fullName: clean(fallbackName, 180), age: "", classLevel: "", email: "" });
  }
  return {
    isFamily: children.length > 0,
    seatCount: Math.max(1, children.length || 1),
    children,
  };
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

async function ensureFamilyTables(pool) {
  await applyRuntimeSettings(pool);
  await ensureStudentAuthTables(pool);
  if (familyTablesEnsured || !runtimeSchemaChangesAllowed()) {
    familyTablesEnsured = true;
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${FAMILY_ACCOUNTS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      family_uuid VARCHAR(64) NOT NULL,
      parent_account_id BIGINT NOT NULL,
      parent_name VARCHAR(180) NOT NULL,
      parent_email VARCHAR(220) NOT NULL,
      parent_phone VARCHAR(80) NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_family_uuid (family_uuid),
      UNIQUE KEY uniq_family_parent_account (parent_account_id),
      KEY idx_family_parent_email (parent_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${FAMILY_CHILDREN_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      child_uuid VARCHAR(64) NOT NULL,
      family_id BIGINT NULL,
      parent_account_id BIGINT NULL,
      account_id BIGINT NULL,
      full_name VARCHAR(180) NOT NULL,
      age VARCHAR(40) NULL,
      class_level VARCHAR(80) NULL,
      email VARCHAR(220) NULL,
      access_code VARCHAR(20) NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending_payment',
      source_type VARCHAR(40) NULL,
      source_uuid VARCHAR(64) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_family_child_uuid (child_uuid),
      UNIQUE KEY uniq_family_child_code (access_code),
      KEY idx_family_child_parent (parent_account_id, status),
      KEY idx_family_child_source (source_type, source_uuid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${FAMILY_CHILD_ENROLLMENTS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      child_id BIGINT NOT NULL,
      family_id BIGINT NULL,
      account_id BIGINT NULL,
      course_slug VARCHAR(120) NOT NULL,
      batch_key VARCHAR(64) NULL,
      batch_label VARCHAR(120) NULL,
      source_type VARCHAR(40) NOT NULL,
      source_uuid VARCHAR(64) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending_payment',
      paid_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_family_child_enrollment_source (child_id, course_slug, source_type, source_uuid),
      KEY idx_family_enrollment_family (family_id, course_slug, status),
      KEY idx_family_enrollment_account (account_id, course_slug, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN buyer_type VARCHAR(40) NOT NULL DEFAULT 'student'`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN seat_count INT NOT NULL DEFAULT 1`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN family_account_id BIGINT NULL`);
  await safeAlter(pool, `ALTER TABLE course_manual_payments ADD COLUMN buyer_type VARCHAR(40) NOT NULL DEFAULT 'student'`);
  await safeAlter(pool, `ALTER TABLE course_manual_payments ADD COLUMN seat_count INT NOT NULL DEFAULT 1`);
  await safeAlter(pool, `ALTER TABLE course_manual_payments ADD COLUMN family_account_id BIGINT NULL`);
  familyTablesEnsured = true;
}

function makeFamilyCode() {
  const bytes = crypto.randomBytes(FAMILY_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < FAMILY_CODE_LENGTH; i += 1) {
    out += FAMILY_CODE_ALPHABET[bytes[i] % FAMILY_CODE_ALPHABET.length];
  }
  return out;
}

async function assignFamilyChildCode(pool, childId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = makeFamilyCode();
    try {
      const [res] = await pool.query(
        `UPDATE ${FAMILY_CHILDREN_TABLE}
         SET access_code = ?, updated_at = ?
         WHERE id = ?
           AND (access_code IS NULL OR access_code = '')
         LIMIT 1`,
        [code, nowSql(), Number(childId)]
      );
      if (Number(res && res.affectedRows || 0) > 0) return code;
      break;
    } catch (error) {
      const codeErr = String(error && error.code || "").toUpperCase();
      const msg = String(error && error.message || "").toLowerCase();
      if (codeErr === "ER_DUP_ENTRY" || msg.indexOf("duplicate") !== -1) continue;
      throw error;
    }
  }
  const [rows] = await pool.query(
    `SELECT access_code FROM ${FAMILY_CHILDREN_TABLE} WHERE id = ? LIMIT 1`,
    [Number(childId)]
  );
  return clean(rows && rows[0] && rows[0].access_code, 20).toUpperCase();
}

async function savePendingFamilyChildren(pool, input) {
  const sourceType = clean(input && input.sourceType, 40);
  const sourceUuid = clean(input && input.sourceUuid, 64);
  const courseSlug = clean(input && input.courseSlug, 120).toLowerCase();
  const children = normalizeFamilyChildren(input && input.children);
  if (!sourceType || !sourceUuid || !courseSlug || !children.length) return [];
  await ensureFamilyTables(pool);
  const now = nowSql();
  const created = [];
  for (const child of children) {
    const [res] = await pool.query(
      `INSERT INTO ${FAMILY_CHILDREN_TABLE}
        (child_uuid, full_name, age, class_level, email, status, source_type, source_uuid, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?)`,
      [
        `fch_${crypto.randomUUID().replace(/-/g, "")}`,
        child.fullName,
        child.age || null,
        child.classLevel || null,
        child.email || null,
        sourceType,
        sourceUuid,
        now,
        now,
      ]
    );
    const childId = Number(res && res.insertId || 0);
    if (childId > 0) {
      await pool.query(
        `INSERT INTO ${FAMILY_CHILD_ENROLLMENTS_TABLE}
          (child_id, course_slug, batch_key, batch_label, source_type, source_uuid, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?)`,
        [
          childId,
          courseSlug,
          input.batchKey || null,
          input.batchLabel || null,
          sourceType,
          sourceUuid,
          now,
          now,
        ]
      );
      created.push(Object.assign({ childId }, child));
    }
  }
  return created;
}

function syntheticChildEmail() {
  return `family-child-${crypto.randomUUID().replace(/-/g, "")}@student-code.local`;
}

async function upsertFamilyAccount(pool, input) {
  const parentAccountId = Number(input && input.parentAccountId);
  const parentName = clean(input && input.parentName, 180);
  const parentEmail = normalizeEmail(input && input.parentEmail);
  const parentPhone = clean(input && input.parentPhone, 80);
  if (!(parentAccountId > 0) || !parentName || !parentEmail) throw new Error("Family parent account is required.");
  await ensureFamilyTables(pool);
  const now = nowSql();
  await pool.query(
    `INSERT INTO ${FAMILY_ACCOUNTS_TABLE}
      (family_uuid, parent_account_id, parent_name, parent_email, parent_phone, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
     ON DUPLICATE KEY UPDATE
       parent_name = VALUES(parent_name),
       parent_email = VALUES(parent_email),
       parent_phone = COALESCE(VALUES(parent_phone), parent_phone),
       status = 'active',
       updated_at = VALUES(updated_at)`,
    [`fam_${crypto.randomUUID().replace(/-/g, "")}`, parentAccountId, parentName, parentEmail, parentPhone || null, now, now]
  );
  const [rows] = await pool.query(
    `SELECT id, family_uuid, parent_account_id, parent_name, parent_email, parent_phone
     FROM ${FAMILY_ACCOUNTS_TABLE}
     WHERE parent_account_id = ?
     LIMIT 1`,
    [parentAccountId]
  );
  return rows && rows.length ? rows[0] : null;
}

async function provisionFamilyOrder(pool, input) {
  const sourceType = clean(input && input.sourceType, 40);
  const sourceUuid = clean(input && input.sourceUuid, 64);
  const parentAccountId = Number(input && input.parentAccountId);
  if (!sourceType || !sourceUuid || !(parentAccountId > 0)) return { ok: true, provisioned: 0 };
  await ensureFamilyTables(pool);
  const parentName = clean(input && input.parentName, 180);
  const parentEmail = normalizeEmail(input && input.parentEmail);
  const parentPhone = clean(input && input.parentPhone, 80);
  const family = await upsertFamilyAccount(pool, { parentAccountId, parentName, parentEmail, parentPhone });
  if (!family || !family.id) return { ok: false, error: "Could not create family account." };

  const [children] = await pool.query(
    `SELECT c.id, c.full_name, c.email, c.account_id, e.id AS enrollment_id, e.course_slug
     FROM ${FAMILY_CHILDREN_TABLE} c
     JOIN ${FAMILY_CHILD_ENROLLMENTS_TABLE} e ON e.child_id = c.id
     WHERE c.source_type = ?
       AND c.source_uuid = ?
       AND e.source_type = ?
       AND e.source_uuid = ?
     ORDER BY c.id ASC`,
    [sourceType, sourceUuid, sourceType, sourceUuid]
  );
  let provisioned = 0;
  for (const row of children || []) {
    let accountId = Number(row.account_id || 0);
    if (!(accountId > 0)) {
      const childEmail = normalizeEmail(row.email) || syntheticChildEmail();
      let account = normalizeEmail(row.email) ? await findStudentByEmail(pool, childEmail) : null;
      if (!account) {
        account = await createStudentAccount(pool, {
          fullName: row.full_name,
          email: childEmail,
          password: crypto.randomBytes(8).toString("base64url") + "A9!",
          mustResetPassword: true,
        });
      }
      accountId = Number(account && account.id || 0);
    }
    const code = await assignFamilyChildCode(pool, Number(row.id));
    await pool.query(
      `UPDATE ${FAMILY_CHILDREN_TABLE}
       SET family_id = ?, parent_account_id = ?, account_id = ?, status = 'active', updated_at = ?
       WHERE id = ?`,
      [Number(family.id), parentAccountId, accountId || null, nowSql(), Number(row.id)]
    );
    await pool.query(
      `UPDATE ${FAMILY_CHILD_ENROLLMENTS_TABLE}
       SET family_id = ?, account_id = ?, status = 'active', paid_at = COALESCE(paid_at, ?), updated_at = ?
       WHERE id = ?`,
      [Number(family.id), accountId || null, nowSql(), nowSql(), Number(row.enrollment_id)]
    );
    if (code) provisioned += 1;
  }
  return { ok: true, familyId: Number(family.id), provisioned };
}

async function listFamilyDashboard(pool, parentAccountId) {
  await ensureFamilyTables(pool);
  const [families] = await pool.query(
    `SELECT id, family_uuid, parent_name, parent_email, parent_phone, status
     FROM ${FAMILY_ACCOUNTS_TABLE}
     WHERE parent_account_id = ?
     LIMIT 1`,
    [Number(parentAccountId)]
  );
  const family = families && families.length ? families[0] : null;
  if (!family) return { family: null, children: [] };
  const [rows] = await pool.query(
    `SELECT
       c.id AS child_id,
       c.child_uuid,
       c.full_name,
       c.age,
       c.class_level,
       c.email,
       c.access_code,
       c.status AS child_status,
       e.course_slug,
       e.batch_key,
       e.batch_label,
       e.status AS enrollment_status,
       DATE_FORMAT(e.paid_at, '%Y-%m-%d %H:%i:%s') AS paid_at
     FROM ${FAMILY_CHILDREN_TABLE} c
     LEFT JOIN ${FAMILY_CHILD_ENROLLMENTS_TABLE} e ON e.child_id = c.id
     WHERE c.family_id = ?
       AND c.parent_account_id = ?
     ORDER BY c.id ASC, e.id ASC`,
    [Number(family.id), Number(parentAccountId)]
  );
  return {
    family: {
      familyUuid: clean(family.family_uuid, 64),
      parentName: clean(family.parent_name, 180),
      parentEmail: clean(family.parent_email, 220),
      parentPhone: clean(family.parent_phone, 80),
      status: clean(family.status, 40),
    },
    children: (rows || []).map(function (row) {
      return {
        childId: Number(row.child_id || 0),
        childUuid: clean(row.child_uuid, 64),
        fullName: clean(row.full_name, 180),
        age: clean(row.age, 40),
        classLevel: clean(row.class_level, 80),
        email: normalizeEmail(row.email),
        accessCode: clean(row.access_code, 20).toUpperCase(),
        status: clean(row.child_status, 40),
        courseSlug: clean(row.course_slug, 120),
        batchKey: clean(row.batch_key, 64),
        batchLabel: clean(row.batch_label, 120),
        enrollmentStatus: clean(row.enrollment_status, 40),
        paidAt: row.paid_at || null,
      };
    }),
  };
}

module.exports = {
  ensureFamilyTables,
  familyEnrollmentEnabledForCourse,
  maxFamilyChildren,
  normalizeFamilyPayload,
  savePendingFamilyChildren,
  provisionFamilyOrder,
  listFamilyDashboard,
};
