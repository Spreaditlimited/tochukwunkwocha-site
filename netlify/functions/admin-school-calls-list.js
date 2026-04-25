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
      `SELECT
         id,
         booking_uuid,
         manage_token,
         full_name,
         school_name,
         work_email,
         phone,
         role_title,
         student_population,
         timezone_label,
         DATE_FORMAT(slot_start_utc, '%Y-%m-%d %H:%i:%s') AS slot_start_utc,
         DATE_FORMAT(slot_end_utc, '%Y-%m-%d %H:%i:%s') AS slot_end_utc,
         duration_minutes,
         status,
         zoom_meeting_id,
         zoom_join_url,
         zoom_start_url,
         cancel_reason,
         reschedule_note,
         assigned_owner,
         call_outcome_status,
         outcome_feedback,
         DATE_FORMAT(next_follow_up_at, '%Y-%m-%d %H:%i:%s') AS next_follow_up_at,
         outcome_updated_by,
         DATE_FORMAT(outcome_updated_at, '%Y-%m-%d %H:%i:%s') AS outcome_updated_at,
         DATE_FORMAT(cancelled_at, '%Y-%m-%d %H:%i:%s') AS cancelled_at,
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
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
