const crypto = require("crypto");
const { nowSql } = require("./db");
const { applyRuntimeSettings } = require("./runtime-settings");
const {
  ALL_INTERNAL_PAGE_PATHS,
  normalizeAllowedPages,
  serializeAllowedPages,
  parseAllowedPages,
} = require("./admin-permissions");

const ADMIN_ACCOUNTS_TABLE = "tochukwu_admin_accounts";

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 220);
}

function normalizeEmail(value) {
  const email = clean(value, 220).toLowerCase();
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password || ""), String(salt || ""), 64, (error, key) => {
      if (error) return reject(error);
      return resolve(key.toString("hex"));
    });
  });
}

function toPublicRow(row) {
  return {
    adminUuid: clean(row.admin_uuid, 64),
    fullName: clean(row.full_name, 180),
    email: clean(row.email, 220).toLowerCase(),
    isOwner: Number(row.is_owner || 0) === 1,
    isActive: Number(row.is_active || 0) === 1,
    allowedPages: parseAllowedPages(row.allowed_pages),
    createdBy: clean(row.created_by, 120),
    createdAt: clean(row.created_at, 40),
    updatedAt: clean(row.updated_at, 40),
    lastLoginAt: clean(row.last_login_at, 40),
  };
}

async function ensureAdminAccountsTable(pool) {
  await applyRuntimeSettings(pool);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${ADMIN_ACCOUNTS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      admin_uuid VARCHAR(64) NOT NULL,
      full_name VARCHAR(180) NOT NULL,
      email VARCHAR(220) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      password_salt VARCHAR(255) NOT NULL,
      is_owner TINYINT(1) NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      allowed_pages TEXT NULL,
      created_by VARCHAR(120) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      last_login_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_admin_uuid (admin_uuid),
      UNIQUE KEY uniq_tochukwu_admin_email (email),
      KEY idx_tochukwu_admin_active (is_active, email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  // Older deployments may have allowed_pages as VARCHAR(255), which truncates
  // longer permission sets when new internal pages are added.
  try {
    const [columns] = await pool.query(
      `SHOW COLUMNS FROM ${ADMIN_ACCOUNTS_TABLE} LIKE 'allowed_pages'`
    );
    const type = String(columns && columns[0] && columns[0].Type || "").toLowerCase();
    if (type && type.indexOf("text") === -1) {
      await pool.query(
        `ALTER TABLE ${ADMIN_ACCOUNTS_TABLE} MODIFY allowed_pages TEXT NULL`
      );
    }
  } catch (_error) {}
}

async function listAdminAccounts(pool) {
  const [rows] = await pool.query(
    `SELECT admin_uuid, full_name, email, is_owner, is_active, allowed_pages, created_by,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
            DATE_FORMAT(last_login_at, '%Y-%m-%d %H:%i:%s') AS last_login_at
     FROM ${ADMIN_ACCOUNTS_TABLE}
     ORDER BY created_at DESC`
  );
  return (rows || []).map(toPublicRow);
}

async function getAdminAccountByUuid(pool, adminUuidInput) {
  const adminUuid = clean(adminUuidInput, 64);
  if (!adminUuid) return null;
  const [rows] = await pool.query(
    `SELECT admin_uuid, full_name, email, is_owner, is_active, allowed_pages, created_by,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
            DATE_FORMAT(last_login_at, '%Y-%m-%d %H:%i:%s') AS last_login_at
     FROM ${ADMIN_ACCOUNTS_TABLE}
     WHERE admin_uuid = ?
     LIMIT 1`,
    [adminUuid]
  );
  return rows && rows.length ? toPublicRow(rows[0]) : null;
}

async function createAdminAccount(pool, input) {
  const fullName = clean(input && input.fullName, 180);
  const email = normalizeEmail(input && input.email);
  const password = String((input && input.password) || "").trim();
  const allowedPages = normalizeAllowedPages(input && input.allowedPages);
  const createdBy = clean((input && input.createdBy) || "owner", 120) || "owner";

  if (!fullName || !email || password.length < 8) {
    throw new Error("Full name, valid email, and password (8+ chars) are required");
  }
  if (!allowedPages.length) {
    throw new Error("At least one page permission is required");
  }

  const adminUuid = `adm_${crypto.randomUUID().replace(/-/g, "")}`;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(password, salt);
  const now = nowSql();

  await pool.query(
    `INSERT INTO ${ADMIN_ACCOUNTS_TABLE}
      (admin_uuid, full_name, email, password_hash, password_salt, is_owner, is_active, allowed_pages, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)`,
    [adminUuid, fullName, email, hash, salt, serializeAllowedPages(allowedPages), createdBy, now, now]
  );

  const [rows] = await pool.query(
    `SELECT admin_uuid, full_name, email, is_owner, is_active, allowed_pages, created_by,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
            DATE_FORMAT(last_login_at, '%Y-%m-%d %H:%i:%s') AS last_login_at
     FROM ${ADMIN_ACCOUNTS_TABLE}
     WHERE admin_uuid = ?
     LIMIT 1`,
    [adminUuid]
  );

  return rows && rows.length ? toPublicRow(rows[0]) : null;
}

async function findAdminByEmailForAuth(pool, emailInput) {
  const email = normalizeEmail(emailInput);
  if (!email) return null;
  const [rows] = await pool.query(
    `SELECT id, admin_uuid, full_name, email, password_hash, password_salt, is_owner, is_active, allowed_pages
     FROM ${ADMIN_ACCOUNTS_TABLE}
     WHERE email = ?
     LIMIT 1`,
    [email]
  );
  return rows && rows.length ? rows[0] : null;
}

async function verifyAdminCredentials(pool, input) {
  const email = normalizeEmail(input && input.email);
  const password = String((input && input.password) || "").trim();
  const row = await findAdminByEmailForAuth(pool, email);
  if (!row || Number(row.is_active || 0) !== 1) return null;

  const hash = await hashPassword(password, row.password_salt);
  if (!safeEqual(hash, row.password_hash)) return null;

  await pool.query(
    `UPDATE ${ADMIN_ACCOUNTS_TABLE}
     SET last_login_at = ?, updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [nowSql(), nowSql(), Number(row.id)]
  );

  return {
    adminUuid: clean(row.admin_uuid, 64),
    fullName: clean(row.full_name, 180),
    email: clean(row.email, 220).toLowerCase(),
    isOwner: Number(row.is_owner || 0) === 1,
    allowedPages: parseAllowedPages(row.allowed_pages),
  };
}

async function updateAdminAccount(pool, input) {
  const adminUuid = clean(input && input.adminUuid, 64);
  if (!adminUuid) throw new Error("adminUuid is required");

  const [rows] = await pool.query(
    `SELECT id, is_owner FROM ${ADMIN_ACCOUNTS_TABLE} WHERE admin_uuid = ? LIMIT 1`,
    [adminUuid]
  );
  if (!rows || !rows.length) throw new Error("Admin account not found");
  const row = rows[0];
  if (Number(row.is_owner || 0) === 1) throw new Error("Owner account cannot be edited here");

  const updates = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(input || {}, "isActive")) {
    updates.push("is_active = ?");
    values.push(input && input.isActive ? 1 : 0);
  }

  if (Object.prototype.hasOwnProperty.call(input || {}, "allowedPages")) {
    const allowedPages = normalizeAllowedPages(input && input.allowedPages);
    if (!allowedPages.length) throw new Error("At least one page permission is required");
    updates.push("allowed_pages = ?");
    values.push(serializeAllowedPages(allowedPages));
  }

  if (Object.prototype.hasOwnProperty.call(input || {}, "password")) {
    const password = String((input && input.password) || "").trim();
    if (password.length < 8) throw new Error("Password must be at least 8 characters");
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await hashPassword(password, salt);
    updates.push("password_hash = ?");
    values.push(hash);
    updates.push("password_salt = ?");
    values.push(salt);
  }

  if (!updates.length) throw new Error("No update values supplied");

  updates.push("updated_at = ?");
  values.push(nowSql());
  values.push(adminUuid);

  await pool.query(
    `UPDATE ${ADMIN_ACCOUNTS_TABLE}
     SET ${updates.join(", ")}
     WHERE admin_uuid = ?
     LIMIT 1`,
    values
  );
}

module.exports = {
  ADMIN_ACCOUNTS_TABLE,
  ALL_INTERNAL_PAGE_PATHS,
  ensureAdminAccountsTable,
  listAdminAccounts,
  getAdminAccountByUuid,
  createAdminAccount,
  verifyAdminCredentials,
  updateAdminAccount,
};
