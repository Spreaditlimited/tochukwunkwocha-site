const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { createStudentSession, setStudentCookieHeader, ensureStudentAuthTables } = require("./_lib/user-auth");

const ATTEMPTS_TABLE = "school_student_code_auth_attempts";
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

function normalizeCode(value) {
  return clean(value, 20).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sha(input) {
  return crypto.createHash("sha256").update(String(input || "")).digest("hex");
}

function ipFromEvent(event) {
  const headers = event && event.headers ? event.headers : {};
  const xff = String(headers["x-forwarded-for"] || headers["X-Forwarded-For"] || "").trim();
  if (xff) return clean(xff.split(",")[0], 90);
  return clean(headers["cf-connecting-ip"] || headers["x-real-ip"], 90);
}

function maskName(name) {
  const parts = clean(name, 180).split(/\s+/).filter(Boolean);
  if (!parts.length) return "Student";
  return parts.map(function (part) {
    return part.length <= 1 ? "*" : (part.charAt(0) + "***");
  }).join(" ");
}

function normalizeName(name) {
  return clean(name, 180)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function signingSecret() {
  const raw = String(process.env.SCHOOL_STUDENT_LOGIN_SECRET || process.env.JWT_SECRET || "school_student_login_secret");
  return raw || "school_student_login_secret";
}

function signChallenge(payload) {
  const body = JSON.stringify(payload || {});
  const bodyBase64 = Buffer.from(body, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", signingSecret()).update(bodyBase64).digest("base64url");
  return bodyBase64 + "." + sig;
}

function verifyChallenge(token) {
  const raw = String(token || "");
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const bodyBase64 = parts[0];
  const sig = parts[1];
  const expected = crypto.createHmac("sha256", signingSecret()).update(bodyBase64).digest("base64url");
  if (sig !== expected) return null;
  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(bodyBase64, "base64url").toString("utf8"));
  } catch (_error) {
    return null;
  }
  if (!payload || Number(payload.exp || 0) < Date.now()) return null;
  return payload;
}

async function ensureAttemptsTable(pool) {
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${ATTEMPTS_TABLE} (
         id BIGINT NOT NULL AUTO_INCREMENT,
         code_hash VARCHAR(128) NOT NULL,
         ip_hash VARCHAR(128) NOT NULL,
         attempts INT NOT NULL DEFAULT 0,
         locked_until DATETIME NULL,
         updated_at DATETIME NOT NULL,
         PRIMARY KEY (id),
         UNIQUE KEY uniq_code_ip (code_hash, ip_hash)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  } catch (_error) {
    return;
  }
}

async function getAttempt(pool, codeHash, ipHash) {
  try {
    const [rows] = await pool.query(
      `SELECT id, attempts, locked_until
       FROM ${ATTEMPTS_TABLE}
       WHERE code_hash = ? AND ip_hash = ?
       LIMIT 1`,
      [codeHash, ipHash]
    );
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (_error) {
    return null;
  }
}

async function recordFailure(pool, codeHash, ipHash) {
  const now = nowSql();
  const current = await getAttempt(pool, codeHash, ipHash);
  const nextAttempts = Number(current && current.attempts || 0) + 1;
  const lockUntil = nextAttempts >= MAX_ATTEMPTS
    ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString().slice(0, 19).replace("T", " ")
    : null;
  try {
    if (current && Number(current.id) > 0) {
      await pool.query(
        `UPDATE ${ATTEMPTS_TABLE}
         SET attempts = ?, locked_until = ?, updated_at = ?
         WHERE id = ?
         LIMIT 1`,
        [nextAttempts, lockUntil, now, Number(current.id)]
      );
      return;
    }
    await pool.query(
      `INSERT INTO ${ATTEMPTS_TABLE}
        (code_hash, ip_hash, attempts, locked_until, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [codeHash, ipHash, nextAttempts, lockUntil, now]
    );
  } catch (_error) {
    return;
  }
}

async function clearAttempts(pool, codeHash, ipHash) {
  try {
    await pool.query(`DELETE FROM ${ATTEMPTS_TABLE} WHERE code_hash = ? AND ip_hash = ?`, [codeHash, ipHash]);
  } catch (_error) {
    return;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON body" });

  const code = normalizeCode(body.code);
  if (code.length < 8) return json(400, { ok: false, error: "Enter a valid student code." });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureAttemptsTable(pool);

    const codeHash = sha(code);
    const ipHash = sha(ipFromEvent(event) || "na");

    const attempt = await getAttempt(pool, codeHash, ipHash);
    if (attempt && attempt.locked_until && new Date(attempt.locked_until).getTime() > Date.now()) {
      return json(429, { ok: false, error: "Too many attempts. Try again in a few minutes." });
    }

    const [rows] = await pool.query(
      `SELECT ss.id, ss.account_id, ss.full_name, ss.school_id, sc.school_name
       FROM school_students ss
       JOIN school_accounts sc ON sc.id = ss.school_id
       WHERE ss.student_code = ?
         AND ss.status = 'active'
         AND sc.status = 'active'
         AND (sc.access_starts_at IS NULL OR sc.access_starts_at <= NOW())
         AND (sc.access_expires_at IS NULL OR sc.access_expires_at >= NOW())
       ORDER BY ss.id DESC
       LIMIT 1`,
      [code]
    );

    const student = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!student || !Number(student.account_id || 0)) {
      await recordFailure(pool, codeHash, ipHash);
      return json(401, { ok: false, error: "Invalid student code." });
    }

    if (!body.confirm) {
      const challenge = signChallenge({
        studentId: Number(student.id),
        accountId: Number(student.account_id),
        codeHash,
        exp: Date.now() + 5 * 60 * 1000,
      });
      return json(200, {
        ok: true,
        needsConfirm: true,
        student: {
          schoolName: clean(student.school_name, 220),
          maskedName: maskName(student.full_name),
        },
        challenge,
      });
    }

    const payload = verifyChallenge(body.challenge);
    if (!payload) {
      await recordFailure(pool, codeHash, ipHash);
      return json(401, { ok: false, error: "Confirmation expired. Enter the code again." });
    }

    if (Number(payload.studentId || 0) !== Number(student.id) || clean(payload.codeHash, 128) !== codeHash) {
      await recordFailure(pool, codeHash, ipHash);
      return json(401, { ok: false, error: "Confirmation mismatch. Enter the code again." });
    }

    const typedName = normalizeName(body.confirmName);
    const actualName = normalizeName(student.full_name);
    if (!typedName || typedName !== actualName) {
      await recordFailure(pool, codeHash, ipHash);
      return json(401, { ok: false, error: "Name does not match this student code." });
    }

    await clearAttempts(pool, codeHash, ipHash);
    const token = await createStudentSession(pool, Number(student.account_id), {
      event,
      enforceDeviceLimit: true,
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": setStudentCookieHeader(event, token),
      },
      body: JSON.stringify({
        ok: true,
        account: {
          fullName: clean(student.full_name, 180),
          schoolName: clean(student.school_name, 220),
        },
      }),
    };
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not sign in" });
  }
};
