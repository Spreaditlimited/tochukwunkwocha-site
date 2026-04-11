const crypto = require("crypto");
const { nowSql } = require("./db");
const { applyRuntimeSettings } = require("./runtime-settings");
const { runtimeSchemaChangesAllowed } = require("./schema-mode");

const COOKIE_NAME = "tws_student_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const DEFAULT_MAX_DEVICES_PER_ACCOUNT = 2;
const DEVICE_ALERT_IP_SPREAD_THRESHOLD = 3;
const STUDENT_SESSIONS_TABLE = "student_sessions";
const STUDENT_DEVICES_TABLE = "student_account_devices";
const STUDENT_SECURITY_ALERTS_TABLE = "student_security_alerts";
const SCHOOL_STUDENTS_TABLE = "school_students";
const SCHOOL_ACCOUNTS_TABLE = "school_accounts";

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

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number.isFinite(fallback) ? Math.trunc(fallback) : 0;
  return Math.trunc(n);
}

function maxDevicesPerAccount() {
  const raw = Number(
    process.env.STUDENT_MAX_DEVICES_PER_ACCOUNT ||
      process.env.SCHOOL_STUDENT_MAX_DEVICES_PER_ACCOUNT ||
      DEFAULT_MAX_DEVICES_PER_ACCOUNT
  );
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_MAX_DEVICES_PER_ACCOUNT;
  return Math.max(1, Math.trunc(raw));
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

function headerValue(event, name) {
  const headers = event && event.headers ? event.headers : {};
  return String(headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || "").trim();
}

function clientIp(event) {
  const xff = headerValue(event, "x-forwarded-for");
  if (xff) return clean(xff.split(",")[0], 90);
  const cf = headerValue(event, "cf-connecting-ip");
  if (cf) return clean(cf, 90);
  const rip = headerValue(event, "x-real-ip");
  if (rip) return clean(rip, 90);
  return "";
}

function ipPrefix(ip) {
  const value = clean(ip, 90);
  if (!value) return "";
  if (value.indexOf(":") !== -1) {
    const parts = value.split(":").filter(Boolean);
    return parts.slice(0, 4).join(":");
  }
  const parts = value.split(".");
  if (parts.length >= 3) return `${parts[0]}.${parts[1]}.${parts[2]}`;
  return value;
}

function shaValue(raw) {
  return crypto.createHash("sha256").update(String(raw || "")).digest("hex");
}

function resolveStudentDeviceIdentity(event, options) {
  const cfg = options && typeof options === "object" ? options : {};
  const explicit = clean(cfg.deviceId || headerValue(event, "x-student-device-id"), 180).replace(/[^\w.\-:]/g, "");
  const ua = clean(headerValue(event, "user-agent"), 255);
  const ip = clientIp(event);
  const fallbackSeed = `${ua}|${ipPrefix(ip)}`;
  const base = explicit || fallbackSeed || `anon_${Date.now()}`;
  return {
    deviceIdHint: explicit || "",
    deviceHash: shaValue(`dev:${base}`),
    ipHash: ip ? shaValue(`ip:${ip}`) : "",
    userAgent: ua,
  };
}

function makeCodedError(message, code, statusCode) {
  const error = new Error(String(message || "Request failed"));
  error.code = clean(code, 64) || "request_failed";
  if (statusCode) error.statusCode = Number(statusCode);
  return error;
}

function isMissingTableError(error) {
  const code = String(error && error.code || "").trim().toUpperCase();
  const msg = String(error && error.message || "").toLowerCase();
  return code === "ER_NO_SUCH_TABLE" || msg.indexOf("doesn't exist") !== -1 || msg.indexOf("does not exist") !== -1;
}

function isUnknownColumnError(error) {
  const code = String(error && error.code || "").trim().toUpperCase();
  const msg = String(error && error.message || "").toLowerCase();
  return code === "ER_BAD_FIELD_ERROR" || msg.indexOf("unknown column") !== -1;
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
    CREATE TABLE IF NOT EXISTS ${STUDENT_SESSIONS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      session_uuid VARCHAR(64) NOT NULL,
      account_id BIGINT NOT NULL,
      token_hash VARCHAR(128) NOT NULL,
      device_hash VARCHAR(128) NULL,
      device_id_hint VARCHAR(190) NULL,
      ip_hash VARCHAR(128) NULL,
      user_agent VARCHAR(255) NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      last_seen_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_student_session_uuid (session_uuid),
      UNIQUE KEY uniq_student_session_token (token_hash),
      KEY idx_student_session_account (account_id),
      KEY idx_student_session_expiry (expires_at),
      KEY idx_student_session_device (device_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE ${STUDENT_SESSIONS_TABLE} ADD COLUMN device_hash VARCHAR(128) NULL`);
  await safeAlter(pool, `ALTER TABLE ${STUDENT_SESSIONS_TABLE} ADD COLUMN device_id_hint VARCHAR(190) NULL`);
  await safeAlter(pool, `ALTER TABLE ${STUDENT_SESSIONS_TABLE} ADD COLUMN ip_hash VARCHAR(128) NULL`);
  await safeAlter(pool, `ALTER TABLE ${STUDENT_SESSIONS_TABLE} ADD COLUMN user_agent VARCHAR(255) NULL`);
  await safeAlter(pool, `ALTER TABLE ${STUDENT_SESSIONS_TABLE} ADD KEY idx_student_session_device (device_hash)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${STUDENT_DEVICES_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      account_id BIGINT NOT NULL,
      device_hash VARCHAR(128) NOT NULL,
      device_id_hint VARCHAR(190) NULL,
      last_ip_hash VARCHAR(128) NULL,
      last_user_agent VARCHAR(255) NULL,
      first_seen_at DATETIME NOT NULL,
      last_seen_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_student_device_per_account (account_id, device_hash),
      KEY idx_student_devices_account (account_id),
      KEY idx_student_devices_seen (last_seen_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${STUDENT_SECURITY_ALERTS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      alert_uuid VARCHAR(64) NOT NULL,
      account_id BIGINT NOT NULL,
      school_id BIGINT NULL,
      alert_type VARCHAR(80) NOT NULL,
      severity VARCHAR(30) NOT NULL DEFAULT 'medium',
      alert_key VARCHAR(128) NULL,
      title VARCHAR(255) NOT NULL,
      details_json LONGTEXT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'open',
      occurrences INT NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      last_seen_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_student_alert_uuid (alert_uuid),
      KEY idx_student_alert_account (account_id, status, created_at),
      KEY idx_student_alert_school (school_id, status, created_at),
      KEY idx_student_alert_type (alert_type, status),
      KEY idx_student_alert_seen (last_seen_at)
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

async function resolveSchoolContextForAccount(pool, accountId) {
  const id = Number(accountId);
  if (!Number.isFinite(id) || id <= 0) return { schoolId: null, schoolName: "" };
  try {
    const [rows] = await pool.query(
      `SELECT sc.id AS school_id, sc.school_name
       FROM ${SCHOOL_STUDENTS_TABLE} ss
       JOIN ${SCHOOL_ACCOUNTS_TABLE} sc ON sc.id = ss.school_id
       WHERE ss.account_id = ?
       ORDER BY ss.updated_at DESC, ss.id DESC
       LIMIT 1`,
      [id]
    );
    if (!Array.isArray(rows) || !rows.length) return { schoolId: null, schoolName: "" };
    return {
      schoolId: Number(rows[0].school_id || 0) || null,
      schoolName: clean(rows[0].school_name, 220),
    };
  } catch (_error) {
    return { schoolId: null, schoolName: "" };
  }
}

async function createStudentSecurityAlert(pool, input) {
  const accountId = Number(input && input.accountId);
  if (!Number.isFinite(accountId) || accountId <= 0) return;

  const now = nowSql();
  const alertType = clean(input && input.alertType, 80) || "suspicious_activity";
  const severity = clean(input && input.severity, 30) || "medium";
  const alertKey = clean(input && input.alertKey, 128) || "";
  const title = clean(input && input.title, 255) || "Suspicious activity detected";
  const schoolId = Number(input && input.schoolId || 0) || null;
  const detailsJson = JSON.stringify(input && input.details ? input.details : {});

  try {
    if (alertKey) {
      const [existing] = await pool.query(
        `SELECT id, occurrences
         FROM ${STUDENT_SECURITY_ALERTS_TABLE}
         WHERE account_id = ?
           AND alert_type = ?
           AND status = 'open'
           AND alert_key = ?
           AND created_at >= DATE_SUB(?, INTERVAL 24 HOUR)
         ORDER BY id DESC
         LIMIT 1`,
        [accountId, alertType, alertKey, now]
      );
      if (Array.isArray(existing) && existing.length) {
        await pool.query(
          `UPDATE ${STUDENT_SECURITY_ALERTS_TABLE}
           SET occurrences = ?, last_seen_at = ?, updated_at = ?, details_json = ?, title = ?, severity = ?, school_id = COALESCE(?, school_id)
           WHERE id = ?
           LIMIT 1`,
          [toInt(existing[0].occurrences, 1) + 1, now, now, detailsJson, title, severity, schoolId, Number(existing[0].id)]
        );
        return;
      }
    }

    await pool.query(
      `INSERT INTO ${STUDENT_SECURITY_ALERTS_TABLE}
        (alert_uuid, account_id, school_id, alert_type, severity, alert_key, title, details_json, status, occurrences, created_at, last_seen_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 1, ?, ?, ?)`,
      [
        `ssa_${crypto.randomUUID().replace(/-/g, "")}`,
        accountId,
        schoolId,
        alertType,
        severity,
        alertKey || null,
        title,
        detailsJson,
        now,
        now,
        now,
      ]
    );
  } catch (error) {
    if (isMissingTableError(error) || isUnknownColumnError(error)) return;
    throw error;
  }
}

async function registerStudentDevice(pool, input) {
  const accountId = Number(input && input.accountId);
  const identity = input && input.identity ? input.identity : {};
  const schoolId = Number(input && input.schoolId || 0) || null;
  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error("Invalid account id");

  const deviceHash = clean(identity.deviceHash, 128);
  if (!deviceHash) throw new Error("Could not resolve device identity");
  const now = nowSql();
  let rows = [];
  try {
    const [foundRows] = await pool.query(
      `SELECT id
       FROM ${STUDENT_DEVICES_TABLE}
       WHERE account_id = ?
         AND device_hash = ?
       LIMIT 1`,
      [accountId, deviceHash]
    );
    rows = Array.isArray(foundRows) ? foundRows : [];
  } catch (error) {
    if (isMissingTableError(error) || isUnknownColumnError(error)) return;
    throw error;
  }
  if (Array.isArray(rows) && rows.length) {
    await pool.query(
      `UPDATE ${STUDENT_DEVICES_TABLE}
       SET device_id_hint = ?, last_ip_hash = ?, last_user_agent = ?, last_seen_at = ?, updated_at = ?
       WHERE id = ?
       LIMIT 1`,
      [
        clean(identity.deviceIdHint, 190) || null,
        clean(identity.ipHash, 128) || null,
        clean(identity.userAgent, 255) || null,
        now,
        now,
        Number(rows[0].id),
      ]
    );
  } else {
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM ${STUDENT_DEVICES_TABLE}
       WHERE account_id = ?`,
      [accountId]
    );
    const currentCount = Number(countRows && countRows[0] && countRows[0].total || 0);
    const limit = maxDevicesPerAccount();
    if (currentCount >= limit) {
      await createStudentSecurityAlert(pool, {
        accountId,
        schoolId,
        alertType: "device_limit_blocked",
        severity: "high",
        alertKey: shaValue(`device_limit:${accountId}:${deviceHash}`),
        title: "Login blocked: device limit reached",
        details: {
          limit,
          currentCount,
          attemptedDeviceHash: deviceHash,
          userAgent: clean(identity.userAgent, 255),
        },
      });
      throw makeCodedError(
        `This account has reached the maximum allowed devices (${limit}). Contact support to reset trusted devices.`,
        "DEVICE_LIMIT_EXCEEDED",
        429
      );
    }

    await pool.query(
      `INSERT INTO ${STUDENT_DEVICES_TABLE}
        (account_id, device_hash, device_id_hint, last_ip_hash, last_user_agent, first_seen_at, last_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        accountId,
        deviceHash,
        clean(identity.deviceIdHint, 190) || null,
        clean(identity.ipHash, 128) || null,
        clean(identity.userAgent, 255) || null,
        now,
        now,
        now,
        now,
      ]
    );

    if (currentCount > 0) {
      await createStudentSecurityAlert(pool, {
        accountId,
        schoolId,
        alertType: "new_device_login",
        severity: "medium",
        alertKey: shaValue(`new_device:${accountId}:${deviceHash}`),
        title: "New device added to student account",
        details: {
          knownDevicesBefore: currentCount,
          knownDevicesAfter: currentCount + 1,
          userAgent: clean(identity.userAgent, 255),
        },
      });
    }
  }

  const [spreadRows] = await pool.query(
    `SELECT COUNT(DISTINCT last_ip_hash) AS ip_count
     FROM ${STUDENT_DEVICES_TABLE}
     WHERE account_id = ?
       AND last_ip_hash IS NOT NULL
       AND last_ip_hash <> ''`,
    [accountId]
  );
  const ipCount = Number(spreadRows && spreadRows[0] && spreadRows[0].ip_count || 0);
  if (ipCount >= DEVICE_ALERT_IP_SPREAD_THRESHOLD) {
    await createStudentSecurityAlert(pool, {
      accountId,
      schoolId,
      alertType: "high_ip_spread",
      severity: "high",
      alertKey: shaValue(`ip_spread:${accountId}:${ipCount}`),
      title: "High IP/device spread detected",
      details: {
        uniqueIps: ipCount,
        threshold: DEVICE_ALERT_IP_SPREAD_THRESHOLD,
      },
    });
  }
}

async function createStudentSession(pool, accountId, options) {
  const cfg = options && typeof options === "object" ? options : {};
  const accountIdNum = Number(accountId);
  const enforceDeviceLimit = cfg.enforceDeviceLimit !== false;
  const identity = resolveStudentDeviceIdentity(cfg.event, cfg);
  const schoolContext = await resolveSchoolContextForAccount(pool, accountIdNum);
  if (enforceDeviceLimit) {
    try {
      await registerStudentDevice(pool, {
        accountId: accountIdNum,
        schoolId: schoolContext.schoolId,
        identity,
      });
    } catch (error) {
      if (!isMissingTableError(error) && !isUnknownColumnError(error)) throw error;
    }
  }

  const token = randomToken();
  const tokenHash = shaToken(token);
  const sessionUuid = `ss_${crypto.randomUUID().replace(/-/g, "")}`;
  const now = nowSql();
  const expires = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString().slice(0, 19).replace("T", " ");

  let existingSessions = [];
  try {
    const [rowsWithDevice] = await pool.query(
      `SELECT id, device_hash
       FROM ${STUDENT_SESSIONS_TABLE}
       WHERE account_id = ?`,
      [accountIdNum]
    );
    existingSessions = Array.isArray(rowsWithDevice) ? rowsWithDevice : [];
  } catch (error) {
    if (!isUnknownColumnError(error)) throw error;
    const [rowsBasic] = await pool.query(
      `SELECT id
       FROM ${STUDENT_SESSIONS_TABLE}
       WHERE account_id = ?`,
      [accountIdNum]
    );
    existingSessions = Array.isArray(rowsBasic) ? rowsBasic : [];
  }
  if (Array.isArray(existingSessions) && existingSessions.length) {
    await pool.query(`DELETE FROM ${STUDENT_SESSIONS_TABLE} WHERE account_id = ?`, [accountIdNum]);
    const replacedDifferentDevice = existingSessions.some(function (row) {
      return clean(row && row.device_hash, 128) && clean(row && row.device_hash, 128) !== clean(identity.deviceHash, 128);
    });
    if (replacedDifferentDevice) {
      await createStudentSecurityAlert(pool, {
        accountId: accountIdNum,
        schoolId: schoolContext.schoolId,
        alertType: "session_replaced_other_device",
        severity: "medium",
        alertKey: shaValue(`session_replace:${accountIdNum}:${identity.deviceHash}`),
        title: "Active session replaced from another device",
        details: {
          previousSessions: existingSessions.length,
          newDeviceHash: clean(identity.deviceHash, 128),
        },
      });
    }
  }

  try {
    await pool.query(
      `INSERT INTO ${STUDENT_SESSIONS_TABLE}
        (session_uuid, account_id, token_hash, device_hash, device_id_hint, ip_hash, user_agent, expires_at, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionUuid,
        accountIdNum,
        tokenHash,
        clean(identity.deviceHash, 128) || null,
        clean(identity.deviceIdHint, 190) || null,
        clean(identity.ipHash, 128) || null,
        clean(identity.userAgent, 255) || null,
        expires,
        now,
        now,
      ]
    );
  } catch (error) {
    if (!isUnknownColumnError(error)) throw error;
    await pool.query(
      `INSERT INTO ${STUDENT_SESSIONS_TABLE}
        (session_uuid, account_id, token_hash, expires_at, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionUuid, accountIdNum, tokenHash, expires, now, now]
    );
  }
  await pool.query(
    `UPDATE student_accounts
     SET last_login_at = ?, updated_at = ?
     WHERE id = ?`,
    [now, now, accountIdNum]
  );
  return token;
}

async function clearStudentSession(pool, token) {
  const tokenHash = shaToken(token);
  await pool.query(`DELETE FROM ${STUDENT_SESSIONS_TABLE} WHERE token_hash = ?`, [tokenHash]);
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
     FROM ${STUDENT_SESSIONS_TABLE} s
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
  await pool.query(`UPDATE ${STUDENT_SESSIONS_TABLE} SET last_seen_at = ? WHERE id = ?`, [nowSql(), row.session_id]);
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
  createStudentSecurityAlert,
  setStudentCookieHeader,
  clearStudentCookieHeader,
};
