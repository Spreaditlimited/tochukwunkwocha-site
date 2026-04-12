const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  SCHOOL_CALL_BOOKINGS_TABLE,
  ensureSchoolCallTablesTochukwu,
  toPublicBookingRow,
} = require("./_lib/school-calls-tochukwu");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}

    await ensureSchoolCallTablesTochukwu(pool);

    const [rows] = await pool.query(
      `SELECT *
       FROM ${SCHOOL_CALL_BOOKINGS_TABLE}
       ORDER BY COALESCE(slot_start_utc, created_at) DESC, id DESC
       LIMIT 300`
    );

    return json(200, {
      ok: true,
      bookings: (rows || []).map(toPublicBookingRow),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load school calls" });
  }
};
