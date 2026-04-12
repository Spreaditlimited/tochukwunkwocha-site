const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { cancelZoomMeeting } = require("./_lib/zoom");
const {
  SCHOOL_CALL_BOOKINGS_TABLE,
  ensureSchoolCallTablesTochukwu,
  clean,
  nowSql,
} = require("./_lib/school-calls-tochukwu");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const token = clean(body.manageToken, 128);
  const reason = clean(body.reason, 255);
  if (!token) return json(400, { ok: false, error: "manageToken is required" });

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}

    await ensureSchoolCallTablesTochukwu(pool);

    const [rows] = await pool.query(
      `SELECT id, booking_uuid, status, zoom_meeting_id FROM ${SCHOOL_CALL_BOOKINGS_TABLE} WHERE manage_token = ? LIMIT 1`,
      [token]
    );

    if (!rows || !rows.length) return json(404, { ok: false, error: "Booking not found" });
    const booking = rows[0];

    const status = clean(booking.status, 40).toLowerCase();
    if (status === "cancelled") {
      return json(200, { ok: true, status: "cancelled", alreadyCancelled: true });
    }

    const zoomMeetingId = clean(booking.zoom_meeting_id, 120);
    let zoomResult = { ok: true };
    if (zoomMeetingId) {
      zoomResult = await cancelZoomMeeting(zoomMeetingId);
    }

    await pool.query(
      `UPDATE ${SCHOOL_CALL_BOOKINGS_TABLE}
       SET status = 'cancelled',
           cancel_reason = ?,
           cancelled_at = ?,
           slot_start_utc = NULL,
           slot_end_utc = NULL,
           updated_at = ?
       WHERE id = ?`,
      [reason || null, nowSql(), nowSql(), Number(booking.id)]
    );

    return json(200, {
      ok: true,
      status: "cancelled",
      zoom: {
        cancelled: Boolean(zoomResult && zoomResult.ok),
        error: zoomResult && !zoomResult.ok ? clean(zoomResult.error, 220) : null,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not cancel booking" });
  }
};
