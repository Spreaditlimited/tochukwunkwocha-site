const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { cancelZoomMeeting, updateZoomMeeting, createZoomMeeting } = require("./_lib/zoom");
const {
  SCHOOL_CALL_BOOKINGS_TABLE,
  ensureSchoolCallTablesTochukwu,
  clean,
  nowSql,
  sqlFromIso,
} = require("./_lib/school-calls-tochukwu");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const bookingUuid = clean(body.bookingUuid, 72);
  const action = clean(body.action, 40).toLowerCase();
  const slotStartIso = clean(body.slotStartIso, 64);
  const note = clean(body.note, 255);
  const outcomeStatus = clean(body.outcomeStatus, 40).toLowerCase();
  const outcomeFeedback = clean(body.outcomeFeedback, 4000);
  const assignedOwner = clean(body.assignedOwner, 180);
  const nextFollowUpAtIso = clean(body.nextFollowUpAtIso, 64);
  const outcomeUpdatedBy = clean(body.outcomeUpdatedBy, 120) || "admin";

  if (!bookingUuid || !action) return json(400, { ok: false, error: "bookingUuid and action are required" });
  if (action !== "cancel" && action !== "reschedule" && action !== "outcome") {
    return json(400, { ok: false, error: "Action must be cancel, reschedule, or outcome" });
  }

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}
    await ensureSchoolCallTablesTochukwu(pool);

    const [rows] = await pool.query(`SELECT * FROM ${SCHOOL_CALL_BOOKINGS_TABLE} WHERE booking_uuid = ? LIMIT 1`, [bookingUuid]);
    if (!rows || !rows.length) return json(404, { ok: false, error: "Booking not found" });
    const booking = rows[0];

    if (action === "outcome") {
      const allowedOutcomes = new Set(["pending", "completed", "no_show", "won", "lost", "follow_up"]);
      if (outcomeStatus && !allowedOutcomes.has(outcomeStatus)) {
        return json(400, { ok: false, error: "Invalid outcomeStatus" });
      }

      let nextFollowUpAtSql = null;
      if (nextFollowUpAtIso) {
        const date = new Date(nextFollowUpAtIso);
        if (!Number.isFinite(date.getTime())) return json(400, { ok: false, error: "Invalid nextFollowUpAtIso" });
        nextFollowUpAtSql = sqlFromIso(date.toISOString());
      }

      await pool.query(
        `UPDATE ${SCHOOL_CALL_BOOKINGS_TABLE}
         SET assigned_owner = ?,
             call_outcome_status = ?,
             outcome_feedback = ?,
             next_follow_up_at = ?,
             outcome_updated_by = ?,
             outcome_updated_at = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          assignedOwner || null,
          outcomeStatus || null,
          outcomeFeedback || null,
          nextFollowUpAtSql,
          outcomeUpdatedBy,
          nowSql(),
          nowSql(),
          Number(booking.id),
        ]
      );

      return json(200, {
        ok: true,
        status: clean(booking.status, 40).toLowerCase(),
        outcome: outcomeStatus || null,
      });
    }

    if (action === "cancel") {
      const meetingId = clean(booking.zoom_meeting_id, 120);
      let zoom = { ok: true };
      if (meetingId) zoom = await cancelZoomMeeting(meetingId);

      await pool.query(
        `UPDATE ${SCHOOL_CALL_BOOKINGS_TABLE}
         SET status = 'cancelled', cancel_reason = ?, cancelled_at = ?, slot_start_utc = NULL, slot_end_utc = NULL, updated_at = ?
         WHERE id = ?`,
        [note || "Cancelled by admin", nowSql(), nowSql(), Number(booking.id)]
      );

      return json(200, {
        ok: true,
        status: "cancelled",
        zoom: { cancelled: Boolean(zoom && zoom.ok), error: zoom && !zoom.ok ? clean(zoom.error, 200) : null },
      });
    }

    const startDate = new Date(slotStartIso);
    if (!Number.isFinite(startDate.getTime())) return json(400, { ok: false, error: "Invalid slotStartIso" });
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

    let zoomResult;
    const meetingId = clean(booking.zoom_meeting_id, 120);
    if (meetingId) {
      zoomResult = await updateZoomMeeting(meetingId, {
        topic: `School Onboarding Call - ${clean(booking.school_name, 220)}`,
        startTimeIso: startDate.toISOString(),
        durationMinutes: 30,
        timezone: "UTC",
      });
    } else {
      zoomResult = await createZoomMeeting({
        topic: `School Onboarding Call - ${clean(booking.school_name, 220)}`,
        startTimeIso: startDate.toISOString(),
        durationMinutes: 30,
        timezone: "UTC",
      });
    }

    if (!zoomResult || !zoomResult.ok) {
      return json(502, { ok: false, error: (zoomResult && zoomResult.error) || "Could not update Zoom meeting" });
    }

    const zoomData = zoomResult.data || {};
    try {
      await pool.query(
        `UPDATE ${SCHOOL_CALL_BOOKINGS_TABLE}
         SET status = 'rescheduled',
             reschedule_note = ?,
             slot_start_utc = ?,
             slot_end_utc = ?,
             zoom_meeting_id = ?,
             zoom_join_url = ?,
             zoom_start_url = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          note || "Rescheduled by admin",
          sqlFromIso(startDate.toISOString()),
          sqlFromIso(endDate.toISOString()),
          clean(zoomData.id || meetingId, 120) || null,
          clean(zoomData.join_url || booking.zoom_join_url, 1200) || null,
          clean(zoomData.start_url || booking.zoom_start_url, 1200) || null,
          nowSql(),
          Number(booking.id),
        ]
      );
    } catch (error) {
      if (String(error && error.code || "") === "ER_DUP_ENTRY") {
        return json(409, { ok: false, error: "That slot is already taken" });
      }
      throw error;
    }

    return json(200, {
      ok: true,
      status: "rescheduled",
      slotStartIso: startDate.toISOString(),
      slotEndIso: endDate.toISOString(),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not update booking" });
  }
};
