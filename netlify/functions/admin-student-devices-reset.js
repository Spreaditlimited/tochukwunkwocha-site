const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { ensureStudentAuthTables, findStudentByEmail, normalizeEmail } = require("./_lib/student-auth");

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

async function resolveTargetStudent(pool, input) {
  const accountId = Number(input && input.accountId || 0);
  const email = normalizeEmail(input && input.studentEmail);

  if (Number.isFinite(accountId) && accountId > 0) {
    const [rows] = await pool.query(
      `SELECT id, email, full_name
       FROM student_accounts
       WHERE id = ?
       LIMIT 1`,
      [accountId]
    );
    if (Array.isArray(rows) && rows.length) return rows[0];
  }

  if (email) {
    const account = await findStudentByEmail(pool, email);
    if (account && Number(account.id) > 0) return account;
  }
  return null;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const pool = getPool();
  let connection;
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}
    await ensureStudentAuthTables(pool);

    const student = await resolveTargetStudent(pool, body);
    if (!student) {
      return json(404, { ok: false, error: "Student account not found." });
    }

    const accountId = Number(student.id || 0);
    const now = nowSql();
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [devicesResult] = await connection.query(
      `DELETE FROM student_account_devices
       WHERE account_id = ?`,
      [accountId]
    );
    const [sessionsResult] = await connection.query(
      `DELETE FROM student_sessions
       WHERE account_id = ?`,
      [accountId]
    );
    const [alertsResult] = await connection.query(
      `UPDATE student_security_alerts
       SET status = 'resolved', updated_at = ?
       WHERE account_id = ?
         AND status = 'open'
         AND alert_type IN ('device_limit_blocked', 'new_device_login', 'high_ip_spread')`,
      [now, accountId]
    );

    const details = JSON.stringify({
      action: "admin_device_reset",
      byRole: clean(auth && auth.payload && auth.payload.role, 30) || "admin",
      devicesRemoved: Number(devicesResult && devicesResult.affectedRows || 0),
      sessionsRemoved: Number(sessionsResult && sessionsResult.affectedRows || 0),
      resolvedAlerts: Number(alertsResult && alertsResult.affectedRows || 0),
      requestedAt: now,
    });

    await connection.query(
      `INSERT INTO student_security_alerts
        (alert_uuid, account_id, school_id, alert_type, severity, alert_key, title, details_json, status, occurrences, created_at, last_seen_at, updated_at)
       VALUES (?, ?, NULL, 'admin_device_reset', 'low', ?, 'Admin reset trusted devices', ?, 'resolved', 1, ?, ?, ?)`,
      [
        `ssa_${crypto.randomUUID().replace(/-/g, "")}`,
        accountId,
        clean(`admin_reset:${accountId}:${now}`, 128),
        details,
        now,
        now,
        now,
      ]
    );

    await connection.commit();
    return json(200, {
      ok: true,
      accountId,
      studentEmail: clean(student.email, 220),
      studentName: clean(student.full_name, 180),
      devicesRemoved: Number(devicesResult && devicesResult.affectedRows || 0),
      sessionsRemoved: Number(sessionsResult && sessionsResult.affectedRows || 0),
      resolvedAlerts: Number(alertsResult && alertsResult.affectedRows || 0),
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (_error) {}
    }
    return json(500, { ok: false, error: error.message || "Could not reset student devices." });
  } finally {
    if (connection) connection.release();
  }
};
