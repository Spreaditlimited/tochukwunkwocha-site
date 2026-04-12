const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { updateZoomMeeting, createZoomMeeting } = require("./_lib/zoom");
const {
  SCHOOL_CALL_BOOKINGS_TABLE,
  ensureSchoolCallTablesTochukwu,
  clean,
  nowSql,
  sqlFromIso,
  buildCandidateSlots,
} = require("./_lib/school-calls-tochukwu");

function looksLikeCandidateSlot(slotStartIso) {
  const candidates = buildCandidateSlots({ days: 30, durationMinutes: 30 });
  return candidates.some((slot) => slot.startIso === slotStartIso);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const token = clean(body.manageToken, 128);
  const slotStartIso = clean(body.slotStartIso, 64);
  const note = clean(body.note, 255);

  if (!token || !slotStartIso) {
    return json(400, { ok: false, error: "manageToken and slotStartIso are required" });
  }

  const startDate = new Date(slotStartIso);
  if (!Number.isFinite(startDate.getTime())) {
    return json(400, { ok: false, error: "Invalid slot" });
  }
  if (startDate.getTime() <= Date.now() + 60 * 60 * 1000) {
    return json(400, { ok: false, error: "Selected slot is no longer available." });
  }
  if (!looksLikeCandidateSlot(startDate.toISOString())) {
    return json(400, { ok: false, error: "Selected slot is not in schedule." });
  }

  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}

    await ensureSchoolCallTablesTochukwu(pool);

    const [rows] = await pool.query(
      `SELECT * FROM ${SCHOOL_CALL_BOOKINGS_TABLE} WHERE manage_token = ? LIMIT 1`,
      [token]
    );

    if (!rows || !rows.length) return json(404, { ok: false, error: "Booking not found" });
    const booking = rows[0];

    const status = clean(booking.status, 40).toLowerCase();
    if (status === "cancelled") return json(400, { ok: false, error: "Booking is already cancelled" });

    const zoomMeetingId = clean(booking.zoom_meeting_id, 120);
    let zoomResult;
    if (zoomMeetingId) {
      zoomResult = await updateZoomMeeting(zoomMeetingId, {
        topic: `School Onboarding Call - ${clean(booking.school_name, 220)}`,
        startTimeIso: startDate.toISOString(),
        durationMinutes: 30,
        timezone: "UTC",
        agenda: `School onboarding call with ${clean(booking.full_name, 180)} (${clean(booking.role_title, 120)})`,
      });
    } else {
      zoomResult = await createZoomMeeting({
        topic: `School Onboarding Call - ${clean(booking.school_name, 220)}`,
        startTimeIso: startDate.toISOString(),
        durationMinutes: 30,
        timezone: "UTC",
        agenda: `School onboarding call with ${clean(booking.full_name, 180)} (${clean(booking.role_title, 120)})`,
      });
    }

    if (!zoomResult || !zoomResult.ok) {
      return json(502, { ok: false, error: (zoomResult && zoomResult.error) || "Could not update Zoom meeting" });
    }

    const zoomData = zoomResult.data || {};
    const nextMeetingId = clean(zoomData.id || zoomMeetingId, 120);
    const nextJoinUrl = clean(zoomData.join_url || booking.zoom_join_url, 1200);
    const nextStartUrl = clean(zoomData.start_url || booking.zoom_start_url, 1200);

    try {
      await pool.query(
        `UPDATE ${SCHOOL_CALL_BOOKINGS_TABLE}
         SET slot_start_utc = ?,
             slot_end_utc = ?,
             status = 'rescheduled',
             reschedule_note = ?,
             zoom_meeting_id = ?,
             zoom_join_url = ?,
             zoom_start_url = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          sqlFromIso(startDate.toISOString()),
          sqlFromIso(endDate.toISOString()),
          note || null,
          nextMeetingId || null,
          nextJoinUrl || null,
          nextStartUrl || null,
          nowSql(),
          Number(booking.id),
        ]
      );
    } catch (error) {
      if (String(error && error.code || "") === "ER_DUP_ENTRY") {
        return json(409, { ok: false, error: "That slot has just been taken. Please choose another." });
      }
      throw error;
    }

    const slotLabel = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Europe/London",
    }).format(startDate);

    return json(200, {
      ok: true,
      status: "rescheduled",
      slotStartIso: startDate.toISOString(),
      slotEndIso: endDate.toISOString(),
      slotLabel,
      zoomJoinUrl: nextJoinUrl,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not reschedule booking" });
  }
};
