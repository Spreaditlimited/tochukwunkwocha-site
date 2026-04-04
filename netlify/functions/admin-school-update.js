const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureSchoolTables } = require("./_lib/schools");

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 300);
}

function toSqlDate(value) {
  const raw = clean(value, 50);
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });
  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const schoolId = Number(body.schoolId || 0);
  const seatsPurchased = Number(body.seatsPurchased || 0);
  const status = clean(body.status, 40).toLowerCase();
  const expiresAt = toSqlDate(body.accessExpiresAt);
  if (!Number.isFinite(schoolId) || schoolId <= 0) return json(400, { ok: false, error: "schoolId is required" });
  if (!Number.isFinite(seatsPurchased) || seatsPurchased < 1) return json(400, { ok: false, error: "seatsPurchased must be at least 1" });
  if (!status || ["active", "disabled", "expired"].indexOf(status) === -1) {
    return json(400, { ok: false, error: "status must be one of: active, disabled, expired" });
  }

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    await pool.query(
      `UPDATE school_accounts
       SET seats_purchased = ?,
           status = ?,
           access_expires_at = ?,
           updated_at = NOW()
       WHERE id = ?
       LIMIT 1`,
      [Math.trunc(seatsPurchased), status, expiresAt, schoolId]
    );
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not update school." });
  }
};

