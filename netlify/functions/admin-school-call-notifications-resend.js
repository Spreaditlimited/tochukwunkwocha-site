const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { sendEmail } = require("./_lib/email");
const { siteBaseUrl } = require("./_lib/payments");
const { getSchoolNotificationRecipients } = require("./_lib/school-notification-recipients");
const {
  SCHOOL_CALL_BOOKINGS_TABLE,
  ensureSchoolCallTablesTochukwu,
  clean,
  isoFromSql,
  SCHOOL_CALL_TIMEZONE,
} = require("./_lib/school-calls-tochukwu");

function toInt(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  if (Number.isFinite(min) && v < min) return min;
  if (Number.isFinite(max) && v > max) return max;
  return v;
}

function firstName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[0] : "there";
}

function slotHuman(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: SCHOOL_CALL_TIMEZONE,
    }).format(d);
  } catch (_error) {
    return d.toISOString();
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    body = {};
  }

  const lookbackHours = toInt(body.lookbackHours, 72, 1, 24 * 30);
  const limit = toInt(body.limit, 50, 1, 300);
  const sendLead = body.sendLead === false ? false : true;
  const sendAdmins = body.sendAdmins === false ? false : true;

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}
    await ensureSchoolCallTablesTochukwu(pool);

    const [rows] = await pool.query(
      `SELECT booking_uuid, manage_token, full_name, school_name, work_email, phone, role_title, student_population,
              DATE_FORMAT(slot_start_utc, '%Y-%m-%d %H:%i:%s') AS slot_start_utc,
              zoom_join_url
       FROM ${SCHOOL_CALL_BOOKINGS_TABLE}
       WHERE status IN ('booked', 'rescheduled')
         AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [lookbackHours, limit]
    );
    const bookings = Array.isArray(rows) ? rows : [];
    const adminRecipients = sendAdmins ? getSchoolNotificationRecipients() : [];

    let leadSent = 0;
    let adminSent = 0;
    const failures = [];
    const base = siteBaseUrl();

    for (let i = 0; i < bookings.length; i += 1) {
      const row = bookings[i] || {};
      const bookingUuid = clean(row.booking_uuid, 72);
      const fullName = clean(row.full_name, 180);
      const schoolName = clean(row.school_name, 220);
      const workEmail = clean(row.work_email, 220).toLowerCase();
      const slotIso = isoFromSql(row.slot_start_utc);
      const zoomJoinUrl = clean(row.zoom_join_url, 1200);
      const manageToken = clean(row.manage_token, 160);
      const manageUrl = manageToken ? `${base}/schools/book-call/?manage=${encodeURIComponent(manageToken)}` : "";
      const when = slotHuman(slotIso);

      if (sendLead && workEmail) {
        const userSubject = "Your School Call is Booked";
        const userText = [
          `Hello ${firstName(fullName)},`,
          "",
          "Your call has been booked successfully.",
          `School: ${schoolName}`,
          when ? `Time: ${when} (WAT)` : "",
          zoomJoinUrl ? `Zoom link: ${zoomJoinUrl}` : "",
          manageUrl ? `Manage booking: ${manageUrl}` : "",
        ].filter(Boolean).join("\n");
        try {
          await sendEmail({ to: workEmail, subject: userSubject, text: userText });
          leadSent += 1;
        } catch (error) {
          failures.push({
            bookingUuid,
            channel: "lead_email",
            recipient: workEmail,
            error: clean(error && error.message, 200) || "send failed",
          });
        }
      }

      if (sendAdmins && adminRecipients.length) {
        const adminSubject = `School Call Booked - ${schoolName}`;
        const adminText = [
          "New school call booking",
          `Name: ${fullName}`,
          `School: ${schoolName}`,
          `Email: ${workEmail}`,
          `Phone: ${clean(row.phone, 80)}`,
          `Role: ${clean(row.role_title, 140)}`,
          `Student population: ${clean(row.student_population, 60)}`,
          when ? `Time: ${when} (WAT)` : "",
          zoomJoinUrl ? `Zoom join link: ${zoomJoinUrl}` : "",
          manageUrl ? `Manage link: ${manageUrl}` : "",
        ].filter(Boolean).join("\n");

        for (let j = 0; j < adminRecipients.length; j += 1) {
          const recipient = clean(adminRecipients[j], 220).toLowerCase();
          if (!recipient) continue;
          try {
            await sendEmail({ to: recipient, subject: adminSubject, text: adminText });
            adminSent += 1;
          } catch (error) {
            failures.push({
              bookingUuid,
              channel: "admin_email",
              recipient,
              error: clean(error && error.message, 200) || "send failed",
            });
          }
        }
      }
    }

    return json(200, {
      ok: true,
      lookbackHours,
      scanned: bookings.length,
      leadSent,
      adminSent,
      failureCount: failures.length,
      failures: failures.slice(0, 25),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not resend school call notifications." });
  }
};

