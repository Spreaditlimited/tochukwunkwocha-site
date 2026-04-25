const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { siteBaseUrl } = require("./_lib/payments");
const { sendEmail } = require("./_lib/email");
const { createZoomMeeting } = require("./_lib/zoom");
const { sendMetaLead, requestContextToMetaData } = require("./_lib/meta");
const {
  SCHOOL_CALL_BOOKINGS_TABLE,
  ensureSchoolCallTablesTochukwu,
  normalizeEmail,
  clean,
  nowSql,
  sqlFromIso,
  buildCandidateSlots,
  SCHOOL_CALL_TIMEZONE,
} = require("./_lib/school-calls-tochukwu");

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

function firstHeader(headers, names) {
  const src = headers && typeof headers === "object" ? headers : {};
  for (const name of names || []) {
    if (!name) continue;
    const direct = src[name];
    if (direct) return String(direct);
    const lower = src[String(name).toLowerCase()];
    if (lower) return String(lower);
  }
  return "";
}

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

  if (clean(body.website, 120)) return json(200, { ok: true });

  const fullName = clean(body.fullName, 180);
  const schoolName = clean(body.schoolName, 220);
  const workEmail = normalizeEmail(body.workEmail);
  const phone = clean(body.phone, 80);
  const role = clean(body.role, 140);
  const studentPopulation = clean(body.studentPopulation, 60);
  const timezone = SCHOOL_CALL_TIMEZONE;
  const slotStartIso = clean(body.slotStartIso, 64);

  const slotStartDate = new Date(slotStartIso);
  if (!fullName || !schoolName || !workEmail || !phone || !role || !studentPopulation || !slotStartIso) {
    return json(400, { ok: false, error: "Please complete all required fields." });
  }
  if (!Number.isFinite(slotStartDate.getTime())) {
    return json(400, { ok: false, error: "Invalid slot time." });
  }
  if (slotStartDate.getTime() <= Date.now() + 60 * 60 * 1000) {
    return json(400, { ok: false, error: "This slot is no longer available." });
  }
  if (!looksLikeCandidateSlot(slotStartDate.toISOString())) {
    return json(400, { ok: false, error: "Selected slot is not part of available schedule." });
  }

  const slotEndDate = new Date(slotStartDate.getTime() + 30 * 60 * 1000);
  const bookingUuid = `school_call_${crypto.randomUUID()}`;
  const manageToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}

    await ensureSchoolCallTablesTochukwu(pool);

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
        return json(409, { ok: false, error: "That slot has just been taken. Please choose another." });
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
      return json(502, { ok: false, error: zoomMeeting.error || "Could not create Zoom meeting." });
    }

    const meeting = zoomMeeting.data;
    const zoomMeetingId = clean(meeting.id, 120);
    const zoomJoinUrl = clean(meeting.join_url, 1200);
    const zoomStartUrl = clean(meeting.start_url, 1200);

    await pool.query(
      `UPDATE ${SCHOOL_CALL_BOOKINGS_TABLE}
       SET zoom_meeting_id = ?, zoom_join_url = ?, zoom_start_url = ?, updated_at = ?
       WHERE booking_uuid = ?`,
      [zoomMeetingId, zoomJoinUrl, zoomStartUrl, nowSql(), bookingUuid]
    );

    const base = siteBaseUrl();
    const manageUrl = `${base}/schools/book-call/?manage=${encodeURIComponent(manageToken)}`;
    const slotHuman = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: SCHOOL_CALL_TIMEZONE,
    }).format(slotStartDate);

    const safeName = escapeHtml(firstName(fullName));
    const safeSchool = escapeHtml(schoolName);

    const userSubject = "Your School Call is Booked";
    const userHtml = [
      `<p>Hello ${safeName},</p>`,
      `<p>Your call has been booked successfully.</p>`,
      `<p><strong>School:</strong> ${safeSchool}<br/><strong>Time:</strong> ${escapeHtml(slotHuman)} (WAT)</p>`,
      `<p><strong>Zoom link:</strong> <a href=\"${zoomJoinUrl}\">Join Meeting</a></p>`,
      `<p>You can reschedule or cancel here: <a href=\"${manageUrl}\">Manage booking</a></p>`,
      "<p>Regards,<br/>Tochukwu Tech and AI Academy</p>",
    ].join("");

    const userText = [
      `Hello ${firstName(fullName)},`,
      "",
      "Your call has been booked successfully.",
      `School: ${schoolName}`,
      `Time: ${slotHuman} (WAT)`,
      `Zoom link: ${zoomJoinUrl}`,
      `Manage booking: ${manageUrl}`,
    ].join("\n");

    const adminSubject = `School Call Booked - ${schoolName}`;
    const adminText = [
      "New school call booking",
      `Name: ${fullName}`,
      `School: ${schoolName}`,
      `Email: ${workEmail}`,
      `Phone: ${phone}`,
      `Role: ${role}`,
      `Student population: ${studentPopulation}`,
      `Time: ${slotHuman} (WAT)`,
      `Zoom join link: ${zoomJoinUrl}`,
      `Manage link: ${manageUrl}`,
    ].join("\n");

    try {
      await sendEmail({ to: workEmail, subject: userSubject, html: userHtml, text: userText });
    } catch (_error) {}

    try {
      await sendEmail({
        to: "support@tochukwunkwocha.com",
        subject: adminSubject,
        text: adminText,
        html: adminText.replace(/\n/g, "<br/>")
      });
    } catch (_error) {}

    const reqMeta = requestContextToMetaData({ headers: event.headers });
    const metaEventId = `lead_school_call_${bookingUuid}`;
    const explicitOrigin = firstHeader(event.headers, ["origin"]);
    const forwardedProto = firstHeader(event.headers, ["x-forwarded-proto"]);
    const host = firstHeader(event.headers, ["host"]);
    const fallbackOrigin = forwardedProto && host ? `${forwardedProto}://${host}` : "";
    const originHeader = explicitOrigin || fallbackOrigin;
    const eventSourceUrl = clean(originHeader) ? `${clean(originHeader).replace(/\/+$/, "")}/schools/book-call/` : "";
    let metaLeadSent = false;
    try {
      const metaRes = await sendMetaLead({
        eventId: metaEventId,
        eventSourceUrl,
        email: workEmail,
        phone,
        fullName,
        externalId: `school_call:${workEmail}`,
        fbp: reqMeta.fbp,
        fbc: reqMeta.fbc,
        clientIpAddress: reqMeta.clientIpAddress,
        clientUserAgent: reqMeta.clientUserAgent,
        customData: {
          content_name: "Prompt to Profit for Schools Call Booking",
          content_category: "booking",
          lead_type: "call_booked",
        },
      });
      metaLeadSent = Boolean(metaRes && metaRes.ok);
    } catch (_metaError) {}

    return json(200, {
      ok: true,
      bookingUuid,
      manageToken,
      zoomJoinUrl,
      slotStartIso: slotStartDate.toISOString(),
      slotEndIso: slotEndDate.toISOString(),
      slotLabel: slotHuman,
      status: "booked",
      meta: {
        eventId: metaEventId,
        leadSent: metaLeadSent,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not create booking" });
  }
};
