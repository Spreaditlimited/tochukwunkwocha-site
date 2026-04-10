const crypto = require("crypto");
const { nowSql } = require("./db");
const { applyRuntimeSettings } = require("./runtime-settings");
const { runtimeSchemaChangesAllowed } = require("./schema-mode");

const COOKIE_NAME = "tws_student_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return ok ? email : "";
}

function isSecureRequest(event) {
  const headers = event && event.headers ? event.headers : {};
  const proto = String(headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "").toLowerCase();
  if (proto) return proto === "https";

  const forwardedSsl = String(headers["x-forwarded-ssl"] || headers["X-Forwarded-Ssl"] || "").toLowerCase();
  if (forwardedSsl) return forwardedSsl === "on";

  const rawUrl = String(event && event.rawUrl || "").toLowerCase();
  if (rawUrl.startsWith("https://")) return true;
  if (rawUrl.startsWith("http://")) return false;

  const host = String(headers.host || headers.Host || "").toLowerCase();
  const isLocalHost = host.includes("localhost") || host.includes("127.0.0.1") || host.includes("::1");
  if (isLocalHost) return false;

  if (process.env.CONTEXT === "production" || process.env.NODE_ENV === "production") return true;
  return false;
}

function readCookieHeader(event) {
  const headers = event && event.headers ? event.headers : {};
  const direct = headers.cookie || headers.Cookie;
  if (direct) return String(direct);

  const multi = event && event.multiValueHeaders ? event.multiValueHeaders : {};
  const mvCookie = multi.cookie || multi.Cookie;
  if (Array.isArray(mvCookie) && mvCookie.length) return mvCookie.join("; ");

  const cookieList = Array.isArray(event && event.cookies) ? event.cookies : [];
  if (cookieList.length) return cookieList.join("; ");
  return "";
}

function parseCookieValue(cookieHeader, name) {
  const entries = String(cookieHeader || "").split(";");
  for (const entry of entries) {
    const [k, ...rest] = entry.trim().split("=");
    if (!k || k !== name) continue;
    return decodeURIComponent(rest.join("=") || "");
  }
  return "";
}

function buildSetCookie(event, value, maxAge) {
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Number(maxAge) || 0)}`,
  ];
  if (isSecureRequest(event)) attrs.push("Secure");
  return attrs.join("; ");
}

async function ensureStudentAuthTables(pool) {
  await applyRuntimeSettings(pool);
  if (!runtimeSchemaChangesAllowed()) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_accounts (
      id BIGINT NOT NULL AUTO_INCREMENT,
      account_uuid VARCHAR(64) NOT NULL,
      full_name VARCHAR(180) NOT NULL,
      email VARCHAR(190) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      password_salt VARCHAR(255) NOT NULL,
      must_reset_password TINYINT(1) NOT NULL DEFAULT 0,
      domains_auto_renew_enabled TINYINT(1) NOT NULL DEFAULT 1,
      reset_token_hash VARCHAR(128) NULL,
      reset_token_expires_at DATETIME NULL,
      reset_requested_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      last_login_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_student_account_uuid (account_uuid),
      UNIQUE KEY uniq_student_account_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE student_accounts ADD COLUMN must_reset_password TINYINT(1) NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE student_accounts ADD COLUMN domains_auto_renew_enabled TINYINT(1) NOT NULL DEFAULT 1`);
  await safeAlter(pool, `ALTER TABLE student_accounts ADD COLUMN reset_token_hash VARCHAR(128) NULL`);
  await safeAlter(pool, `ALTER TABLE student_accounts ADD COLUMN reset_token_expires_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE student_accounts ADD COLUMN reset_requested_at DATETIME NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_sessions (
      id BIGINT NOT NULL AUTO_INCREMENT,
      session_uuid VARCHAR(64) NOT NULL,
      account_id BIGINT NOT NULL,
      token_hash VARCHAR(128) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      last_seen_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_student_session_uuid (session_uuid),
      UNIQUE KEY uniq_student_session_token (token_hash),
      KEY idx_student_session_account (account_id),
      KEY idx_student_session_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password || ""), String(salt || ""), 64, (error, derivedKey) => {
      if (error) return reject(error);
      return resolve(derivedKey.toString("hex"));
    });
  });
}

async function createStudentAccount(pool, input) {
  const fullName = String(input.fullName || "").trim().slice(0, 180);
  const email = normalizeEmail(input.email);
  const password = String(input.password || "");
  if (!fullName || !email || password.length < 8) throw new Error("Full Name, valid email, and password (8+ chars) are required");

  const accountUuid = `sa_${crypto.randomUUID().replace(/-/g, "")}`;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(password, salt);
  const now = nowSql();
  const mustReset = input && input.mustResetPassword ? 1 : 0;

  await pool.query(
    `INSERT INTO student_accounts
      (account_uuid, full_name, email, password_hash, password_salt, must_reset_password, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [accountUuid, fullName, email, hash, salt, mustReset, now, now]
  );

  const [rows] = await pool.query(
    `SELECT id, account_uuid, full_name, email
     FROM student_accounts
     WHERE account_uuid = ?
     LIMIT 1`,
    [accountUuid]
  );
  return rows && rows.length ? rows[0] : null;
}

async function findStudentByEmail(pool, emailInput) {
  const email = normalizeEmail(emailInput);
  if (!email) return null;
  const [rows] = await pool.query(
    `SELECT id, account_uuid, full_name, email, password_hash, password_salt, must_reset_password
            , domains_auto_renew_enabled
     FROM student_accounts
     WHERE email = ?
     LIMIT 1`,
    [email]
  );
  return rows && rows.length ? rows[0] : null;
}

async function verifyStudentCredentials(pool, input) {
  const email = normalizeEmail(input.email);
  const password = String(input.password || "");
  const account = await findStudentByEmail(pool, email);
  if (!account) return null;
  const hash = await hashPassword(password, account.password_salt);
  const ok = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(String(account.password_hash || "")));
  if (!ok) return null;
  return account;
}

function sqlDateFromNow(ms) {
  return new Date(Date.now() + Math.max(0, Number(ms) || 0)).toISOString().slice(0, 19).replace("T", " ");
}

function randomToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function shaToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

async function createStudentSession(pool, accountId) {
  const token = randomToken();
  const tokenHash = shaToken(token);
  const sessionUuid = `ss_${crypto.randomUUID().replace(/-/g, "")}`;
  const now = nowSql();
  const expires = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString().slice(0, 19).replace("T", " ");

  await pool.query(
    `INSERT INTO student_sessions
      (session_uuid, account_id, token_hash, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionUuid, Number(accountId), tokenHash, expires, now, now]
  );
  await pool.query(
    `UPDATE student_accounts
     SET last_login_at = ?, updated_at = ?
     WHERE id = ?`,
    [now, now, Number(accountId)]
  );
  return token;
}

async function clearStudentSession(pool, token) {
  const tokenHash = shaToken(token);
  await pool.query(`DELETE FROM student_sessions WHERE token_hash = ?`, [tokenHash]);
}

async function requireStudentSession(pool, event) {
  const token = parseCookieValue(readCookieHeader(event), COOKIE_NAME);
  if (!token) return { ok: false, statusCode: 401, error: "Not signed in" };

  const tokenHash = shaToken(token);
  const [rows] = await pool.query(
    `SELECT s.id AS session_id,
            s.account_id,
            s.expires_at,
            a.account_uuid,
            a.full_name,
            a.email,
            a.must_reset_password,
            a.domains_auto_renew_enabled
     FROM student_sessions s
     JOIN student_accounts a ON a.id = s.account_id
     WHERE s.token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );
  if (!rows || !rows.length) return { ok: false, statusCode: 401, error: "Session invalid" };
  const row = rows[0];
  const exp = new Date(row.expires_at).getTime();
  if (!Number.isFinite(exp) || exp < Date.now()) {
    await clearStudentSession(pool, token);
    return { ok: false, statusCode: 401, error: "Session expired" };
  }
  await pool.query(`UPDATE student_sessions SET last_seen_at = ? WHERE id = ?`, [nowSql(), row.session_id]);
  return {
    ok: true,
    account: {
      id: Number(row.account_id),
      accountUuid: row.account_uuid,
      fullName: row.full_name,
      email: row.email,
      mustResetPassword: Number(row.must_reset_password || 0) === 1,
      domainsAutoRenewEnabled: Number(row.domains_auto_renew_enabled || 0) === 1,
    },
    token,
  };
}

async function updateStudentDomainAutoRenew(pool, input) {
  const accountId = Number(input && input.accountId);
  const enabled = input && input.enabled ? 1 : 0;
  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error("Invalid account id");
  await pool.query(
    `UPDATE student_accounts
     SET domains_auto_renew_enabled = ?, updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [enabled, nowSql(), accountId]
  );
}

async function setStudentPassword(pool, input) {
  const accountId = Number(input && input.accountId);
  const password = String((input && input.password) || "");
  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error("Invalid account id");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(password, salt);
  await pool.query(
    `UPDATE student_accounts
     SET password_hash = ?, password_salt = ?, must_reset_password = 0,
         reset_token_hash = NULL, reset_token_expires_at = NULL, reset_requested_at = NULL,
         updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [hash, salt, nowSql(), accountId]
  );
}

async function createPasswordResetToken(pool, emailInput, options) {
  const account = await findStudentByEmail(pool, emailInput);
  if (!account || !account.id) return null;
  const cfg = options && typeof options === "object" ? options : {};
  const neverExpires = cfg.neverExpires ? 1 : 0;

  const rawToken = randomToken();
  const tokenHash = shaToken(rawToken);
  await pool.query(
    `UPDATE student_accounts
     SET reset_token_hash = ?, reset_token_expires_at = ?, reset_requested_at = ?, updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [tokenHash, neverExpires ? null : sqlDateFromNow(1000 * 60 * 60), nowSql(), nowSql(), Number(account.id)]
  );

  return {
    token: rawToken,
    accountId: Number(account.id),
    email: String(account.email || ""),
    fullName: String(account.full_name || ""),
  };
}

async function consumePasswordResetToken(pool, input) {
  const token = String((input && input.token) || "").trim();
  const password = String((input && input.password) || "");
  if (!token) throw new Error("Reset token is required");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const tokenHash = shaToken(token);
  const [rows] = await pool.query(
    `SELECT id, email, full_name, reset_token_expires_at
     FROM student_accounts
     WHERE reset_token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );
  if (!rows || !rows.length) throw new Error("Invalid or expired reset token");
  const account = rows[0];
  if (account.reset_token_expires_at) {
    const exp = new Date(account.reset_token_expires_at).getTime();
    if (!Number.isFinite(exp) || exp < Date.now()) {
      throw new Error("Invalid or expired reset token");
    }
  }

  await setStudentPassword(pool, { accountId: Number(account.id), password });
  return {
    id: Number(account.id),
    email: String(account.email || ""),
    fullName: String(account.full_name || ""),
  };
}

function setStudentCookieHeader(event, token) {
  return buildSetCookie(event, token, SESSION_MAX_AGE);
}

function clearStudentCookieHeader(event) {
  return buildSetCookie(event, "", 0);
}

module.exports = {
  COOKIE_NAME,
  normalizeEmail,
  findStudentByEmail,
  ensureStudentAuthTables,
  createStudentAccount,
  verifyStudentCredentials,
  createStudentSession,
  requireStudentSession,
  updateStudentDomainAutoRenew,
  clearStudentSession,
  setStudentPassword,
  createPasswordResetToken,
  consumePasswordResetToken,
  setStudentCookieHeader,
  clearStudentCookieHeader,
};
