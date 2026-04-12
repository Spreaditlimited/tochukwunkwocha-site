const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { verifyZoomWebhook } = require("./_lib/zoom");
const {
  SCHOOL_CALL_BOOKINGS_TABLE,
  ensureSchoolCallTablesTochukwu,
  clean,
  nowSql,
  sqlFromIso,
} = require("./_lib/school-calls-tochukwu");

function validationResponse(secret, plainToken) {
  const encryptedToken = crypto.createHmac("sha256", secret).update(String(plainToken || "")).digest("hex");
  return { plainToken, encryptedToken };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const secret = clean(process.env.ZOOM_WEBHOOK_SECRET_TOKEN, 400);
  if (!secret) return json(500, { ok: false, error: "Missing ZOOM_WEBHOOK_SECRET_TOKEN" });

  if (clean(body.event, 120) === "endpoint.url_validation") {
    const plainToken = clean(body.payload && body.payload.plainToken, 255);
    if (!plainToken) return json(400, { ok: false, error: "Missing plainToken" });
    return json(200, validationResponse(secret, plainToken));
  }

  const verified = verifyZoomWebhook(event);
  if (!verified.ok) return json(401, { ok: false, error: verified.error || "Invalid signature" });

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}

    await ensureSchoolCallTablesTochukwu(pool);

    const eventType = clean(body.event, 120);
    const payload = body.payload || {};
    const object = payload.object || {};
    const meetingId = clean(object.id, 120);

    if (!meetingId) return json(200, { ok: true, ignored: true, reason: "missing_meeting_id" });

    if (eventType === "meeting.deleted") {
      await pool.query(
        `UPDATE ${SCHOOL_CALL_BOOKINGS_TABLE}
         SET status = 'cancelled',
             cancel_reason = COALESCE(cancel_reason, 'Cancelled from Zoom'),
             cancelled_at = COALESCE(cancelled_at, ?),
             slot_start_utc = NULL,
             slot_end_utc = NULL,
             updated_at = ?
         WHERE zoom_meeting_id = ?
           AND status <> 'cancelled'`,
        [nowSql(), nowSql(), meetingId]
      );
      return json(200, { ok: true, synced: true, event: eventType });
    }

    if (eventType === "meeting.updated") {
      const startTime = clean(object.start_time, 80);
      const duration = Math.max(15, Math.min(180, Number(object.duration || 30) || 30));
      const startDate = new Date(startTime);
      if (Number.isFinite(startDate.getTime())) {
        const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
        await pool.query(
          `UPDATE ${SCHOOL_CALL_BOOKINGS_TABLE}
           SET slot_start_utc = ?,
               slot_end_utc = ?,
               duration_minutes = ?,
               status = CASE WHEN status = 'booked' THEN 'rescheduled' ELSE status END,
               updated_at = ?
           WHERE zoom_meeting_id = ?`,
          [
            sqlFromIso(startDate.toISOString()),
            sqlFromIso(endDate.toISOString()),
            duration,
            nowSql(),
            meetingId,
          ]
        );
      }
      return json(200, { ok: true, synced: true, event: eventType });
    }

    return json(200, { ok: true, ignored: true, event: eventType });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Webhook handling failed" });
  }
};
