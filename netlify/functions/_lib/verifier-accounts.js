const crypto = require("crypto");
const { nowSql } = require("./db");
const { applyRuntimeSettings } = require("./runtime-settings");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return ok ? email : "";
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password || ""), String(salt || ""), 64, (error, derivedKey) => {
      if (error) return reject(error);
      return resolve(derivedKey.toString("hex"));
    });
  });
}

async function ensureVerifierAccountsTable(pool) {
  await applyRuntimeSettings(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tochukwu_verifier_accounts (
      id BIGINT NOT NULL AUTO_INCREMENT,
      verifier_uuid VARCHAR(64) NOT NULL,
      full_name VARCHAR(180) NOT NULL,
      email VARCHAR(190) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      password_salt VARCHAR(255) NOT NULL,
      must_reset_password TINYINT(1) NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_by VARCHAR(120) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      last_login_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_verifier_uuid (verifier_uuid),
      UNIQUE KEY uniq_verifier_email (email),
      KEY idx_verifier_active (is_active, email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  try {
    await pool.query(`ALTER TABLE tochukwu_verifier_accounts ADD COLUMN must_reset_password TINYINT(1) NOT NULL DEFAULT 0`);
  } catch (_error) {}
}

async function createVerifierAccount(pool, input) {
  const fullName = clean(input && input.fullName, 180);
  const email = normalizeEmail(input && input.email);
  const password = String((input && input.password) || "");
  const createdBy = clean((input && input.createdBy) || "admin", 120) || "admin";
  if (!fullName || !email || password.length < 8) {
    throw new Error("Full name, valid email, and password (8+ chars) are required");
  }

  const verifierUuid = `vr_${crypto.randomUUID().replace(/-/g, "")}`;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(password, salt);
  const now = nowSql();

  await pool.query(
    `INSERT INTO tochukwu_verifier_accounts
      (verifier_uuid, full_name, email, password_hash, password_salt, must_reset_password, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?)`,
    [verifierUuid, fullName, email, hash, salt, createdBy, now, now]
  );

  const [rows] = await pool.query(
    `SELECT verifier_uuid, full_name, email, is_active, created_by, created_at, updated_at, last_login_at
     FROM tochukwu_verifier_accounts
     WHERE verifier_uuid = ?
     LIMIT 1`,
    [verifierUuid]
  );
  return rows && rows.length ? rows[0] : null;
}

async function listVerifierAccounts(pool) {
  const [rows] = await pool.query(
    `SELECT verifier_uuid, full_name, email, is_active, created_by, created_at, updated_at, last_login_at
     FROM tochukwu_verifier_accounts
     ORDER BY created_at DESC`
  );
  return rows || [];
}

async function findVerifierByEmailForAuth(pool, emailInput) {
  const email = normalizeEmail(emailInput);
  if (!email) return null;
  const [rows] = await pool.query(
    `SELECT id, verifier_uuid, full_name, email, password_hash, password_salt, must_reset_password, is_active
     FROM tochukwu_verifier_accounts
     WHERE email = ?
     LIMIT 1`,
    [email]
  );
  return rows && rows.length ? rows[0] : null;
}

async function verifyVerifierCredentials(pool, input) {
  const email = normalizeEmail(input && input.email);
  const password = String((input && input.password) || "");
  const account = await findVerifierByEmailForAuth(pool, email);
  if (!account || Number(account.is_active || 0) !== 1) return null;

  const hash = await hashPassword(password, account.password_salt);
  const ok = safeEqual(hash, account.password_hash);
  if (!ok) return null;

  await pool.query(
    `UPDATE tochukwu_verifier_accounts
     SET last_login_at = ?, updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [nowSql(), nowSql(), Number(account.id)]
  );

  return {
    id: Number(account.id),
    verifierUuid: account.verifier_uuid,
    fullName: account.full_name,
    email: account.email,
    mustResetPassword: Number(account.must_reset_password || 0) === 1,
  };
}

async function updateVerifierPassword(pool, input) {
  const verifierUuid = clean(input && input.verifierUuid, 64);
  const password = String((input && input.password) || "");
  if (!verifierUuid) throw new Error("verifierUuid is required");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(password, salt);
  await pool.query(
    `UPDATE tochukwu_verifier_accounts
     SET password_hash = ?, password_salt = ?, must_reset_password = 0, updated_at = ?
     WHERE verifier_uuid = ?
     LIMIT 1`,
    [hash, salt, nowSql(), verifierUuid]
  );
}

async function resetVerifierPasswordByEmail(pool, input) {
  const email = normalizeEmail(input && input.email);
  const currentPassword = String((input && input.currentPassword) || "");
  const newPassword = String((input && input.newPassword) || "");
  if (!email || !currentPassword || newPassword.length < 8) {
    throw new Error("Email, current password and new password (8+ chars) are required");
  }

  const account = await findVerifierByEmailForAuth(pool, email);
  if (!account || Number(account.is_active || 0) !== 1) throw new Error("Invalid credentials");
  const currentHash = await hashPassword(currentPassword, account.password_salt);
  if (!safeEqual(currentHash, account.password_hash)) throw new Error("Invalid credentials");

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(newPassword, salt);
  await pool.query(
    `UPDATE tochukwu_verifier_accounts
     SET password_hash = ?, password_salt = ?, must_reset_password = 0, updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [hash, salt, nowSql(), Number(account.id)]
  );
}

module.exports = {
  ensureVerifierAccountsTable,
  createVerifierAccount,
  listVerifierAccounts,
  verifyVerifierCredentials,
  updateVerifierPassword,
  resetVerifierPasswordByEmail,
};
