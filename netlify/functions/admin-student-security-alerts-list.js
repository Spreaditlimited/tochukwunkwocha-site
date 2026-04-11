const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureStudentAuthTables } = require("./_lib/student-auth");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function isMissingTableError(error) {
  const code = String(error && error.code || "").trim().toUpperCase();
  const msg = String(error && error.message || "").toLowerCase();
  return code === "ER_NO_SUCH_TABLE" || msg.indexOf("doesn't exist") !== -1 || msg.indexOf("does not exist") !== -1;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}
    await ensureStudentAuthTables(pool);

    let rows = [];
    try {
      const [withSchool] = await pool.query(
        `SELECT
           a.id,
           a.alert_type,
           a.severity,
           a.title,
           a.details_json,
           a.status,
           a.occurrences,
           a.created_at,
           a.last_seen_at,
           sa.full_name AS student_name,
           sa.email AS student_email,
           sc.school_name
         FROM student_security_alerts a
         JOIN student_accounts sa ON sa.id = a.account_id
         LEFT JOIN school_accounts sc ON sc.id = a.school_id
         WHERE a.status = 'open'
         ORDER BY a.last_seen_at DESC, a.id DESC
         LIMIT 100`
      );
      rows = Array.isArray(withSchool) ? withSchool : [];
    } catch (error) {
      if (isMissingTableError(error)) {
        return json(200, { ok: true, alerts: [], warning: "student_security_alerts table not provisioned yet." });
      }
      const [withoutSchool] = await pool.query(
        `SELECT
           a.id,
           a.alert_type,
           a.severity,
           a.title,
           a.details_json,
           a.status,
           a.occurrences,
           a.created_at,
           a.last_seen_at,
           sa.full_name AS student_name,
           sa.email AS student_email,
           '' AS school_name
         FROM student_security_alerts a
         JOIN student_accounts sa ON sa.id = a.account_id
         WHERE a.status = 'open'
         ORDER BY a.last_seen_at DESC, a.id DESC
         LIMIT 100`
      );
      rows = Array.isArray(withoutSchool) ? withoutSchool : [];
    }

    return json(200, {
      ok: true,
      alerts: rows.map(function (row) {
        return {
          id: Number(row.id),
          alertType: clean(row.alert_type, 80),
          severity: clean(row.severity, 30),
          title: clean(row.title, 255),
          detailsJson: clean(row.details_json, 5000),
          status: clean(row.status, 30),
          occurrences: Number(row.occurrences || 0),
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
          lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
          studentName: clean(row.student_name, 180),
          studentEmail: clean(row.student_email, 220),
          schoolName: clean(row.school_name, 220),
        };
      }),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load security alerts." });
  }
};
