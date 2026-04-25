const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { sendEmail } = require("./_lib/email");
const { createZoomMeeting } = require("./_lib/zoom");
const {
  SCHOOL_CALL_BOOKINGS_TABLE,
  ensureSchoolCallTablesTochukwu,
  nowSql,
  sqlFromIso,
  buildCandidateSlots,
  fetchActiveBookedSlotMap,
  SCHOOL_CALL_TIMEZONE,
  clean,
} = require("./_lib/school-calls-tochukwu");
const {
  SCHOOL_SCORECARDS_TABLE,
  ensureSchoolScorecardTablesTochukwu,
} = require("./_lib/school-scorecards-tochukwu");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.length ? parts[0] : "there";
}

function normalizeEmail(value) {
  const email = clean(value, 220).toLowerCase();
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function looksLikeCandidateSlot(slotStartIso) {
  const candidates = buildCandidateSlots({ days: 30, durationMinutes: 30 });
  return candidates.some((slot) => slot.startIso === slotStartIso);
}

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

  const leadUuid = clean(body.leadUuid, 64);
  const slotStartIso = clean(body.slotStartIso, 64);
  const timezone = SCHOOL_CALL_TIMEZONE;

  if (!leadUuid || !slotStartIso) {
    return json(400, { ok: false, error: "leadUuid and slotStartIso are required" });
  }

  const slotStartDate = new Date(slotStartIso);
  if (!Number.isFinite(slotStartDate.getTime())) {
    return json(400, { ok: false, error: "Invalid slot time" });
  }
  if (slotStartDate.getTime() <= Date.now() + 60 * 60 * 1000) {
    return json(400, { ok: false, error: "This slot is no longer available" });
  }
  if (!looksLikeCandidateSlot(slotStartDate.toISOString())) {
    return json(400, { ok: false, error: "Selected slot is not part of available schedule" });
  }

  const slotEndDate = new Date(slotStartDate.getTime() + 30 * 60 * 1000);

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}

    await ensureSchoolScorecardTablesTochukwu(pool);
    await ensureSchoolCallTablesTochukwu(pool);

    const [leadRows] = await pool.query(
      `SELECT full_name, school_name, work_email, phone, role_title, student_population
       FROM ${SCHOOL_SCORECARDS_TABLE}
       WHERE lead_uuid = ?
       LIMIT 1`,
      [leadUuid]
    );

    if (!leadRows || !leadRows.length) {
      return json(404, { ok: false, error: "Scorecard lead not found" });
    }

    const lead = leadRows[0] || {};
    const fullName = clean(lead.full_name, 180);
    const schoolName = clean(lead.school_name, 220);
    const workEmail = normalizeEmail(lead.work_email);
    const phone = clean(lead.phone, 80);
    const role = clean(lead.role_title, 140);
    const studentPopulation = clean(lead.student_population, 60);

    if (!fullName || !schoolName || !workEmail || !phone || !role || !studentPopulation) {
      return json(400, { ok: false, error: "Lead contact details are incomplete" });
    }

    const bookedSlots = await fetchActiveBookedSlotMap(pool);
    if (bookedSlots.has(slotStartDate.toISOString())) {
      return json(409, { ok: false, error: "That slot has been taken. Choose another." });
    }

    const [existingRows] = await pool.query(
      `SELECT booking_uuid
       FROM ${SCHOOL_CALL_BOOKINGS_TABLE}
       WHERE work_email = ?
         AND status IN ('booked', 'rescheduled')
       ORDER BY COALESCE(slot_start_utc, created_at) DESC, id DESC
       LIMIT 1`,
      [workEmail]
    );
    if (existingRows && existingRows.length) {
      return json(409, {
        ok: false,
        error: "This lead already has an active call booking",
        existingBookingUuid: clean(existingRows[0].booking_uuid, 72),
      });
    }

    const bookingUuid = `school_call_${crypto.randomUUID()}`;
    const manageToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const createdAt = nowSql();

    try {
      await pool.query(
        `INSERT INTO ${SCHOOL_CALL_BOOKINGS_TABLE}
         (booking_uuid, manage_token, full_name, school_name, work_email, phone, role_title, student_population, timezone_label,
          slot_start_utc, slot_end_utc, duration_minutes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 30, 'booked', ?, ?)`,
        [
          bookingUuid,
          manageToken,
          fullName,
          schoolName,
          workEmail,
          phone,
          role,
          studentPopulation,
          timezone,
          sqlFromIso(slotStartDate.toISOString()),
          sqlFromIso(slotEndDate.toISOString()),
          createdAt,
          createdAt,
        ]
      );
    } catch (error) {
      if (String(error && error.code || "") === "ER_DUP_ENTRY") {
        return json(409, { ok: false, error: "That slot has just been taken. Choose another." });
      }
      throw error;
    }

    const zoomMeeting = await createZoomMeeting({
      topic: `School Onboarding Call - ${schoolName}`,
      startTimeIso: slotStartDate.toISOString(),
      durationMinutes: 30,
      timezone: SCHOOL_CALL_TIMEZONE,
      agenda: `School onboarding call with ${fullName} (${role}) from ${schoolName}`,
    });

    if (!zoomMeeting.ok || !zoomMeeting.data) {
      await pool.query(
        `UPDATE ${SCHOOL_CALL_BOOKINGS_TABLE}
         SET status = 'zoom_failed', slot_start_utc = NULL, slot_end_utc = NULL, updated_at = ?
         WHERE booking_uuid = ?`,
        [nowSql(), bookingUuid]
      );
      return json(502, { ok: false, error: zoomMeeting.error || "Could not create Zoom meeting" });
    }

    const meeting = zoomMeeting.data || {};
    const zoomJoinUrl = clean(meeting.join_url, 1200);

    await pool.query(
      `UPDATE ${SCHOOL_CALL_BOOKINGS_TABLE}
       SET zoom_meeting_id = ?, zoom_join_url = ?, zoom_start_url = ?, updated_at = ?
       WHERE booking_uuid = ?`,
      [
        clean(meeting.id, 120) || null,
        zoomJoinUrl || null,
        clean(meeting.start_url, 1200) || null,
        nowSql(),
        bookingUuid,
      ]
    );

    const slotHuman = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: SCHOOL_CALL_TIMEZONE,
    }).format(slotStartDate);

    const userSubject = "Your School Call is Booked";
    const userHtml = [
      `<p>Hello ${escapeHtml(firstName(fullName))},</p>`,
      `<p>Your call has been booked successfully.</p>`,
      `<p><strong>School:</strong> ${escapeHtml(schoolName)}<br/><strong>Time:</strong> ${escapeHtml(slotHuman)} (WAT)</p>`,
      zoomJoinUrl ? `<p><strong>Zoom link:</strong> <a href="${zoomJoinUrl}">Join Meeting</a></p>` : "",
      "<p>Regards,<br/>Tochukwu Tech and AI Academy</p>",
    ].join("");

    try {
      await sendEmail({
        to: workEmail,
        subject: userSubject,
        html: userHtml,
        text: userHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      });
    } catch (_error) {}

    return json(200, {
      ok: true,
      bookingUuid,
      slotStartIso: slotStartDate.toISOString(),
      slotEndIso: slotEndDate.toISOString(),
      zoomJoinUrl,
      status: "booked",
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not create booking" });
  }
};
