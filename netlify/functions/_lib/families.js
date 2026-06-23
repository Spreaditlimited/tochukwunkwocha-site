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
const FAMILY_SEAT_BALANCES_TABLE = "family_seat_balances";
const FAMILY_SEAT_LEDGER_TABLE = "family_seat_ledger";
const FAMILY_CODE_LENGTH = 10;
const FAMILY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_MAX_CHILDREN = 500;
const HOLIDAY_COURSE_SLUG = "prompt-to-profit-holiday";
const HOLIDAY_GROUP_DISCOUNT_MIN_SEATS = 10;
const HOLIDAY_GROUP_DISCOUNT_UNIT_MINOR = 900000;

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
  return Math.max(1, Math.min(500, Math.round(parsed)));
}

function groupEnrollmentUnitPriceMinor(courseSlug, standardUnitMinor, seatCount) {
  const slug = clean(courseSlug, 120).toLowerCase();
  const seats = Math.max(1, Math.round(Number(seatCount || 1)));
  if (slug === HOLIDAY_COURSE_SLUG && seats >= HOLIDAY_GROUP_DISCOUNT_MIN_SEATS) {
    return HOLIDAY_GROUP_DISCOUNT_UNIT_MINOR;
  }
  return Math.max(0, Math.round(Number(standardUnitMinor || 0)));
}

function groupEnrollmentBaseAmountMinor(courseSlug, standardUnitMinor, seatCount) {
  const seats = Math.max(1, Math.round(Number(seatCount || 1)));
  return groupEnrollmentUnitPriceMinor(courseSlug, standardUnitMinor, seats) * seats;
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
  const requestedSeats = Math.max(0, Math.round(Number(body && (body.seatCount || body.seat_count) || 0)));
  if (!familyMode && children.length <= 1) {
    return {
      isFamily: false,
      seatCount: 1,
      children: [],
    };
  }
  if (!children.length && !requestedSeats && fallbackName) {
    children.push({ fullName: clean(fallbackName, 180), age: "", classLevel: "", email: "" });
  }
  const seatCount = Math.max(1, requestedSeats || children.length || 1);
  return {
    isFamily: familyMode || children.length > 0 || requestedSeats > 1,
    seatCount,
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${FAMILY_SEAT_BALANCES_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      family_id BIGINT NOT NULL,
      course_slug VARCHAR(120) NOT NULL,
      batch_key VARCHAR(64) NOT NULL DEFAULT '',
      batch_label VARCHAR(120) NULL,
      seats_purchased INT NOT NULL DEFAULT 0,
      seats_consumed INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_family_seat_balance (family_id, course_slug, batch_key),
      KEY idx_family_seat_balance_family (family_id, course_slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${FAMILY_SEAT_LEDGER_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      family_id BIGINT NOT NULL,
      course_slug VARCHAR(120) NOT NULL,
      batch_key VARCHAR(64) NOT NULL DEFAULT '',
      entry_type VARCHAR(40) NOT NULL,
      quantity INT NOT NULL,
      source_type VARCHAR(40) NOT NULL,
      source_uuid VARCHAR(64) NOT NULL,
      idempotency_key VARCHAR(160) NOT NULL,
      metadata_json TEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_family_seat_ledger_idempotency (idempotency_key),
      KEY idx_family_seat_ledger_family (family_id, course_slug, batch_key)
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
  if (!(parentAccountId > 0) || !parentName || !parentEmail) throw new Error("Enrollment account details are required.");
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
  if (!family || !family.id) return { ok: false, error: "Could not create enrollment account." };

  const [children] = await pool.query(
    `SELECT c.id,
            c.full_name,
            c.email,
            c.account_id,
            c.status AS child_status,
            e.id AS enrollment_id,
            e.course_slug,
            e.batch_key,
            e.batch_label,
            e.status AS enrollment_status
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
    const wasActive = clean(row.enrollment_status, 40).toLowerCase() === "active";
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
    if (!wasActive && code) provisioned += 1;
  }
  if (provisioned > 0 && children && children.length) {
    const first = children[0] || {};
    const courseSlug = clean(first.course_slug, 120).toLowerCase();
    const batchKey = clean(first.batch_key, 64);
    const batchLabel = clean(first.batch_label, 120);
    if (courseSlug) {
      const normalizedBatchKey = batchKey || "";
      const now = nowSql();
      await pool.query(
        `UPDATE ${FAMILY_SEAT_BALANCES_TABLE}
         SET seats_consumed = LEAST(seats_purchased, seats_consumed + ?),
             batch_label = COALESCE(?, batch_label),
             updated_at = ?
         WHERE family_id = ?
           AND course_slug = ?
           AND batch_key = ?
         LIMIT 1`,
        [provisioned, batchLabel || null, now, Number(family.id), courseSlug, normalizedBatchKey]
      );
      await pool.query(
        `INSERT INTO ${FAMILY_SEAT_LEDGER_TABLE}
          (family_id, course_slug, batch_key, entry_type, quantity, source_type, source_uuid, idempotency_key, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, 'consume', ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = id`,
        [
          Number(family.id),
          courseSlug,
          normalizedBatchKey,
          provisioned,
          sourceType,
          sourceUuid,
          `${sourceType}:${sourceUuid}:consume`,
          JSON.stringify({ provisioned_from_pending_children: true }),
          now,
          now,
        ]
      );
    }
  }
  return { ok: true, familyId: Number(family.id), provisioned };
}

async function creditFamilySeats(pool, input) {
  const sourceType = clean(input && input.sourceType, 40);
  const sourceUuid = clean(input && input.sourceUuid, 64);
  const parentAccountId = Number(input && input.parentAccountId);
  const courseSlug = clean(input && input.courseSlug, 120).toLowerCase();
  const batchKey = clean(input && input.batchKey, 64);
  const batchLabel = clean(input && input.batchLabel, 120);
  const quantity = Math.max(0, Math.round(Number(input && input.quantity || 0)));
  if (!sourceType || !sourceUuid || !(parentAccountId > 0) || !courseSlug || quantity <= 0) {
    return { ok: false, error: "Seat credit details are incomplete." };
  }
  await ensureFamilyTables(pool);
  const parentName = clean(input && input.parentName, 180);
  const parentEmail = normalizeEmail(input && input.parentEmail);
  const parentPhone = clean(input && input.parentPhone, 80);
  const family = await upsertFamilyAccount(pool, { parentAccountId, parentName, parentEmail, parentPhone });
  if (!family || !family.id) return { ok: false, error: "Could not create enrollment account." };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const now = nowSql();
    const idempotencyKey = `${sourceType}:${sourceUuid}:purchase`;
    const [ledgerRows] = await conn.query(
      `SELECT id
       FROM ${FAMILY_SEAT_LEDGER_TABLE}
       WHERE idempotency_key = ?
       LIMIT 1
       FOR UPDATE`,
      [idempotencyKey]
    );
    if (ledgerRows && ledgerRows.length) {
      await conn.commit();
      return { ok: true, familyId: Number(family.id), credited: 0, duplicate: true };
    }

    const normalizedBatchKey = batchKey || "";
    const [balanceRows] = await conn.query(
      `SELECT id, seats_purchased
       FROM ${FAMILY_SEAT_BALANCES_TABLE}
       WHERE family_id = ?
         AND course_slug = ?
         AND batch_key = ?
       LIMIT 1
       FOR UPDATE`,
      [Number(family.id), courseSlug, normalizedBatchKey]
    );
    if (balanceRows && balanceRows.length) {
      await conn.query(
        `UPDATE ${FAMILY_SEAT_BALANCES_TABLE}
         SET seats_purchased = ?, batch_label = COALESCE(?, batch_label), updated_at = ?
         WHERE id = ?
         LIMIT 1`,
        [
          Number(balanceRows[0].seats_purchased || 0) + quantity,
          batchLabel || null,
          now,
          Number(balanceRows[0].id),
        ]
      );
    } else {
      await conn.query(
        `INSERT INTO ${FAMILY_SEAT_BALANCES_TABLE}
          (family_id, course_slug, batch_key, batch_label, seats_purchased, seats_consumed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        [Number(family.id), courseSlug, normalizedBatchKey, batchLabel || null, quantity, now, now]
      );
    }
    await conn.query(
      `INSERT INTO ${FAMILY_SEAT_LEDGER_TABLE}
        (family_id, course_slug, batch_key, entry_type, quantity, source_type, source_uuid, idempotency_key, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, 'purchase', ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(family.id),
        courseSlug,
        normalizedBatchKey,
        quantity,
        sourceType,
        sourceUuid,
        idempotencyKey,
        JSON.stringify({ batch_label: batchLabel || null }),
        now,
        now,
      ]
    );
    await conn.commit();
    return { ok: true, familyId: Number(family.id), credited: quantity };
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    return { ok: false, error: error.message || "Could not credit purchased seats." };
  } finally {
    conn.release();
  }
}

async function consumeFamilySeatsForChildren(pool, input) {
  const parentAccountId = Number(input && input.parentAccountId);
  const courseSlug = clean(input && input.courseSlug, 120).toLowerCase();
  const batchKey = clean(input && input.batchKey, 64);
  const batchLabel = clean(input && input.batchLabel, 120);
  const children = normalizeFamilyChildren(input && input.children);
  if (!(parentAccountId > 0) || !courseSlug || !children.length) throw new Error("Learner enrollment details are required.");
  await ensureFamilyTables(pool);
  const family = await upsertFamilyAccount(pool, {
    parentAccountId,
    parentName: input && input.parentName,
    parentEmail: input && input.parentEmail,
    parentPhone: input && input.parentPhone,
  });
  if (!family || !family.id) throw new Error("Enrollment account is required.");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const normalizedBatchKey = batchKey || "";
    const [balanceRows] = await conn.query(
      `SELECT id, seats_purchased, seats_consumed
       FROM ${FAMILY_SEAT_BALANCES_TABLE}
       WHERE family_id = ?
         AND course_slug = ?
         AND batch_key = ?
       LIMIT 1
       FOR UPDATE`,
      [Number(family.id), courseSlug, normalizedBatchKey]
    );
    const balance = balanceRows && balanceRows[0] ? balanceRows[0] : null;
    const available = balance
      ? Math.max(0, Number(balance.seats_purchased || 0) - Number(balance.seats_consumed || 0))
      : 0;
    if (children.length > available) {
      throw new Error(`Only ${available} purchased seat${available === 1 ? "" : "s"} available for this program.`);
    }

    const now = nowSql();
    const created = [];
    for (const child of children) {
      const childEmail = normalizeEmail(child.email) || syntheticChildEmail();
      let account = normalizeEmail(child.email) ? await findStudentByEmail(conn, childEmail) : null;
      if (!account) {
        account = await createStudentAccount(conn, {
          fullName: child.fullName,
          email: childEmail,
          password: crypto.randomBytes(8).toString("base64url") + "A9!",
          mustResetPassword: true,
        });
      }
      const accountId = Number(account && account.id || 0) || null;
      const [res] = await conn.query(
        `INSERT INTO ${FAMILY_CHILDREN_TABLE}
          (child_uuid, family_id, parent_account_id, account_id, full_name, age, class_level, email, status, source_type, source_uuid, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 'family_seat', ?, ?, ?)`,
        [
          `fch_${crypto.randomUUID().replace(/-/g, "")}`,
          Number(family.id),
          parentAccountId,
          accountId,
          child.fullName,
          child.age || null,
          child.classLevel || null,
          normalizeEmail(child.email) || null,
          `seat_${crypto.randomUUID().replace(/-/g, "")}`,
          now,
          now,
        ]
      );
      const childId = Number(res && res.insertId || 0);
      const sourceUuid = `family_seat_${childId || crypto.randomUUID().replace(/-/g, "")}`;
      if (childId > 0) {
        await conn.query(
          `UPDATE ${FAMILY_CHILDREN_TABLE}
           SET source_uuid = ?
           WHERE id = ?
           LIMIT 1`,
          [sourceUuid, childId]
        );
        await assignFamilyChildCode(conn, childId);
        await conn.query(
          `INSERT INTO ${FAMILY_CHILD_ENROLLMENTS_TABLE}
            (child_id, family_id, account_id, course_slug, batch_key, batch_label, source_type, source_uuid, status, paid_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'family_seat', ?, 'active', ?, ?, ?)`,
          [
            childId,
            Number(family.id),
            accountId,
            courseSlug,
            normalizedBatchKey || null,
            batchLabel || null,
            sourceUuid,
            now,
            now,
            now,
          ]
        );
        created.push({ childId, fullName: child.fullName });
      }
    }

    await conn.query(
      `UPDATE ${FAMILY_SEAT_BALANCES_TABLE}
       SET seats_consumed = ?, updated_at = ?
       WHERE id = ?
       LIMIT 1`,
      [Number(balance.seats_consumed || 0) + created.length, now, Number(balance.id)]
    );
    await conn.query(
      `INSERT INTO ${FAMILY_SEAT_LEDGER_TABLE}
        (family_id, course_slug, batch_key, entry_type, quantity, source_type, source_uuid, idempotency_key, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, 'consume', ?, 'family_dashboard', ?, ?, ?, ?, ?)`,
      [
        Number(family.id),
        courseSlug,
        normalizedBatchKey,
        created.length,
        `consume_${crypto.randomUUID().replace(/-/g, "")}`,
        `consume_${crypto.randomUUID().replace(/-/g, "")}`,
        JSON.stringify({ children: created.map(function (row) { return row.childId; }) }),
        now,
        now,
      ]
    );
    await conn.commit();
    return {
      ok: true,
      familyId: Number(family.id),
      created: created.length,
      seatsPurchased: Number(balance.seats_purchased || 0),
      seatsUsed: Number(balance.seats_consumed || 0) + created.length,
    };
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    conn.release();
  }
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
  if (!family) return { family: null, children: [], seats: [] };
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
  const [seatRows] = await pool.query(
    `SELECT course_slug, batch_key, batch_label, seats_purchased, seats_consumed
     FROM ${FAMILY_SEAT_BALANCES_TABLE}
     WHERE family_id = ?
     ORDER BY course_slug ASC, batch_label ASC, batch_key ASC`,
    [Number(family.id)]
  );
  const [seatProviderRows] = await pool.query(
    `SELECT
       l.course_slug,
       l.batch_key,
       l.source_type,
       l.source_uuid,
       co.provider AS order_provider,
       co.currency AS order_currency,
       mp.currency AS manual_currency
     FROM ${FAMILY_SEAT_LEDGER_TABLE} l
     LEFT JOIN course_orders co
       ON l.source_type = 'course_order'
      AND co.order_uuid COLLATE utf8mb4_general_ci = l.source_uuid COLLATE utf8mb4_general_ci
     LEFT JOIN course_manual_payments mp
       ON l.source_type = 'manual_payment'
      AND mp.payment_uuid COLLATE utf8mb4_general_ci = l.source_uuid COLLATE utf8mb4_general_ci
     INNER JOIN (
       SELECT course_slug, batch_key, MAX(id) AS latest_id
       FROM ${FAMILY_SEAT_LEDGER_TABLE}
       WHERE family_id = ?
         AND entry_type = 'purchase'
       GROUP BY course_slug, batch_key
     ) latest ON latest.latest_id = l.id
     WHERE l.family_id = ?
       AND l.entry_type = 'purchase'`,
    [Number(family.id), Number(family.id)]
  );
  const providerBySeat = new Map();
  (seatProviderRows || []).forEach(function (row) {
    const key = `${clean(row.course_slug, 120)}::${clean(row.batch_key, 64)}`;
    const sourceType = clean(row.source_type, 40);
    const provider = sourceType === "manual_payment"
      ? "manual_transfer"
      : clean(row.order_provider, 40).toLowerCase();
    providerBySeat.set(key, {
      provider: provider || "paystack",
      currency: clean(row.order_currency || row.manual_currency, 10).toUpperCase(),
    });
  });
  return {
    family: {
      familyUuid: clean(family.family_uuid, 64),
      parentName: clean(family.parent_name, 180),
      parentEmail: clean(family.parent_email, 220),
      parentPhone: clean(family.parent_phone, 80),
      status: clean(family.status, 40),
    },
    seats: (seatRows || []).map(function (row) {
      const purchased = Number(row.seats_purchased || 0);
      const consumed = Number(row.seats_consumed || 0);
      const key = `${clean(row.course_slug, 120)}::${clean(row.batch_key, 64)}`;
      const payment = providerBySeat.get(key) || { provider: "paystack", currency: "" };
      return {
        courseSlug: clean(row.course_slug, 120),
        batchKey: clean(row.batch_key, 64),
        batchLabel: clean(row.batch_label, 120),
        seatsPurchased: purchased,
        seatsUsed: consumed,
        seatsAvailable: Math.max(0, purchased - consumed),
        paymentProvider: payment.provider,
        paymentCurrency: payment.currency,
      };
    }),
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
  groupEnrollmentUnitPriceMinor,
  groupEnrollmentBaseAmountMinor,
  normalizeFamilyPayload,
  savePendingFamilyChildren,
  provisionFamilyOrder,
  creditFamilySeats,
  consumeFamilySeatsForChildren,
  listFamilyDashboard,
};
