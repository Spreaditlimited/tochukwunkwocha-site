const { json } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { sendEmail } = require("./_lib/email");
const { siteBaseUrl } = require("./_lib/payments");
const {
  SCHOOL_CALL_BOOKINGS_TABLE,
  ensureSchoolCallTablesTochukwu,
  clean,
  isoFromSql,
  sqlFromIso,
} = require("./_lib/school-calls-tochukwu");

const NOTIFICATIONS_TABLE = "tochukwu_school_call_notifications";

function normalizeInt(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const safe = Math.floor(n);
  if (Number.isFinite(min) && safe < min) return min;
  if (Number.isFinite(max) && safe > max) return max;
  return safe;
}

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

function minutesUntil(iso, now) {
  const eventDate = new Date(iso);
  const nowDate = now instanceof Date ? now : new Date();
  if (!Number.isFinite(eventDate.getTime()) || !Number.isFinite(nowDate.getTime())) return NaN;
  return Math.floor((eventDate.getTime() - nowDate.getTime()) / 60000);
}

function stageFor(minutesLeft) {
  if (!Number.isFinite(minutesLeft)) return "";
  if (minutesLeft >= 1410 && minutesLeft <= 1470) return "24h";
  if (minutesLeft >= 20 && minutesLeft <= 40) return "30m";
  return "";
}

function stageLabel(stage) {
  if (stage === "24h") return "in about 24 hours";
  if (stage === "30m") return "in about 30 minutes";
  return "soon";
}

function slotLabel(iso, timezone) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: clean(timezone, 80) || "Europe/London",
    }).format(d);
  } catch (_error) {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Europe/London",
    }).format(d);
  }
}

function parseAdminRecipients() {
  const raw = String(process.env.SCHOOL_CALL_ALERT_EMAILS || "").trim();
  const fallback = "support@tochukwunkwocha.com";
  const src = raw || fallback;
  const emails = src
    .split(",")
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(emails));
}

function reminderEmailForLead(row, stage) {
  const fullName = clean(row.full_name, 180);
  const schoolName = clean(row.school_name, 220);
  const timezone = clean(row.timezone_label, 80) || "Europe/London";
  const slotIso = isoFromSql(row.slot_start_utc);
  const slotInLeadZone = slotLabel(slotIso, timezone);
  const slotInLondon = slotLabel(slotIso, "Europe/London");
  const zoomUrl = clean(row.zoom_join_url, 1200);
  const manageToken = clean(row.manage_token, 140);
  const manageUrl = `${siteBaseUrl()}/schools/book-call/?manage=${encodeURIComponent(manageToken)}`;
  const whenText = stageLabel(stage);

  const subject = `Reminder: School call ${whenText}`;
  const html = [
    `<p>Hello ${escapeHtml(firstName(fullName))},</p>`,
    `<p>This is a reminder that your school call is ${escapeHtml(whenText)}.</p>`,
    `<p><strong>School:</strong> ${escapeHtml(schoolName)}<br/><strong>Your timezone (${escapeHtml(timezone)}):</strong> ${escapeHtml(slotInLeadZone)}<br/><strong>Europe/London:</strong> ${escapeHtml(slotInLondon)}</p>`,
    zoomUrl ? `<p><strong>Zoom:</strong> <a href="${zoomUrl}">Join Meeting</a></p>` : "",
    `<p>Need to change it? <a href="${manageUrl}">Reschedule or cancel your booking</a>.</p>`,
    "<p>Regards,<br/>Tochukwu Tech and AI Academy</p>",
  ].filter(Boolean).join("\n");

  const text = [
    `Hello ${firstName(fullName)},`,
    "",
    `This is a reminder that your school call is ${whenText}.`,
    `School: ${schoolName}`,
    `Your timezone (${timezone}): ${slotInLeadZone}`,
    `Europe/London: ${slotInLondon}`,
    zoomUrl ? `Zoom: ${zoomUrl}` : "",
    `Manage booking: ${manageUrl}`,
  ].filter(Boolean).join("\n");

  return { subject, html, text };
}

function reminderEmailForAdmin(row, stage) {
  const fullName = clean(row.full_name, 180);
  const schoolName = clean(row.school_name, 220);
  const workEmail = clean(row.work_email, 220).toLowerCase();
  const phone = clean(row.phone, 80);
  const role = clean(row.role_title, 140);
  const studentPopulation = clean(row.student_population, 60);
  const timezone = clean(row.timezone_label, 80) || "Europe/London";
  const slotIso = isoFromSql(row.slot_start_utc);
  const slotInLeadZone = slotLabel(slotIso, timezone);
  const slotInLondon = slotLabel(slotIso, "Europe/London");
  const zoomUrl = clean(row.zoom_join_url, 1200);
  const manageToken = clean(row.manage_token, 140);
  const manageUrl = `${siteBaseUrl()}/schools/book-call/?manage=${encodeURIComponent(manageToken)}`;
  const bookingUuid = clean(row.booking_uuid, 80);
  const whenText = stageLabel(stage);

  const subject = `School Call Alert (${stage}): ${schoolName}`;
  const text = [
    `Reminder stage: ${stage} (${whenText})`,
    `Booking: ${bookingUuid}`,
    `School: ${schoolName}`,
    `Contact: ${fullName}`,
    `Email: ${workEmail}`,
    `Phone: ${phone}`,
    `Role: ${role}`,
    `Student population: ${studentPopulation}`,
    `Lead timezone (${timezone}): ${slotInLeadZone}`,
    `Europe/London: ${slotInLondon}`,
    zoomUrl ? `Zoom: ${zoomUrl}` : "",
    `Manage: ${manageUrl}`,
  ].filter(Boolean).join("\n");

  return {
    subject,
    text,
    html: text.replace(/\n/g, "<br/>")
  };
}

async function ensureNotificationTable(pool) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${NOTIFICATIONS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      booking_uuid VARCHAR(72) NOT NULL,
      slot_start_utc DATETIME NOT NULL,
      stage VARCHAR(20) NOT NULL,
      channel VARCHAR(40) NOT NULL,
      recipient_email VARCHAR(220) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      sent_at DATETIME NULL,
      error_message VARCHAR(500) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_school_call_notification (booking_uuid, slot_start_utc, stage, channel, recipient_email),
      KEY idx_tochukwu_school_call_notification_status (status, updated_at),
      KEY idx_tochukwu_school_call_notification_booking (booking_uuid, slot_start_utc)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

async function fetchUpcomingBookings(pool, lookaheadHours, lookbackMinutes, limit) {
  const [rows] = await pool.query(
    `SELECT *
     FROM ${SCHOOL_CALL_BOOKINGS_TABLE}
     WHERE status IN ('booked', 'rescheduled')
       AND COALESCE(call_outcome_status, '') NOT IN ('completed', 'won', 'lost', 'no_show')
       AND slot_start_utc IS NOT NULL
       AND slot_start_utc >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
       AND slot_start_utc <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR)
     ORDER BY slot_start_utc ASC
     LIMIT ?`,
    [Number(lookbackMinutes), Number(lookaheadHours), Number(limit)]
  );
  return Array.isArray(rows) ? rows : [];
}

async function upsertPending(pool, payload) {
  const now = nowSql();
  await pool.query(
    `INSERT INTO ${NOTIFICATIONS_TABLE}
      (booking_uuid, slot_start_utc, stage, channel, recipient_email, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 1, ?, ?)
     ON DUPLICATE KEY UPDATE
      attempts = attempts + 1,
      updated_at = VALUES(updated_at)`,
    [
      clean(payload.bookingUuid, 72),
      sqlFromIso(payload.slotStartIso),
      clean(payload.stage, 20),
      clean(payload.channel, 40),
      clean(payload.recipientEmail, 220).toLowerCase(),
      now,
      now,
    ]
  );
}

async function getExistingNotification(pool, payload) {
  const [rows] = await pool.query(
    `SELECT id, status, attempts
     FROM ${NOTIFICATIONS_TABLE}
     WHERE booking_uuid = ?
       AND slot_start_utc = ?
       AND stage = ?
       AND channel = ?
       AND recipient_email = ?
     LIMIT 1`,
    [
      clean(payload.bookingUuid, 72),
      sqlFromIso(payload.slotStartIso),
      clean(payload.stage, 20),
      clean(payload.channel, 40),
      clean(payload.recipientEmail, 220).toLowerCase(),
    ]
  );
  return rows && rows.length ? rows[0] : null;
}

async function markSent(pool, payload) {
  const now = nowSql();
  await pool.query(
    `UPDATE ${NOTIFICATIONS_TABLE}
     SET status = 'sent',
         sent_at = ?,
         error_message = NULL,
         updated_at = ?
     WHERE booking_uuid = ?
       AND slot_start_utc = ?
       AND stage = ?
       AND channel = ?
       AND recipient_email = ?
     LIMIT 1`,
    [
      now,
      now,
      clean(payload.bookingUuid, 72),
      sqlFromIso(payload.slotStartIso),
      clean(payload.stage, 20),
      clean(payload.channel, 40),
      clean(payload.recipientEmail, 220).toLowerCase(),
    ]
  );
}

async function markFailed(pool, payload) {
  const now = nowSql();
  await pool.query(
    `UPDATE ${NOTIFICATIONS_TABLE}
     SET status = 'failed',
         error_message = ?,
         updated_at = ?
     WHERE booking_uuid = ?
       AND slot_start_utc = ?
       AND stage = ?
       AND channel = ?
       AND recipient_email = ?
     LIMIT 1`,
    [
      clean(payload.errorMessage, 500) || "unknown_error",
      now,
      clean(payload.bookingUuid, 72),
      sqlFromIso(payload.slotStartIso),
      clean(payload.stage, 20),
      clean(payload.channel, 40),
      clean(payload.recipientEmail, 220).toLowerCase(),
    ]
  );
}

exports.handler = async function () {
  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}

    await ensureSchoolCallTablesTochukwu(pool);
    await ensureNotificationTable(pool);

    const lookaheadHours = normalizeInt(process.env.SCHOOL_CALL_REMINDER_LOOKAHEAD_HOURS, 26, 1, 72);
    const lookbackMinutes = normalizeInt(process.env.SCHOOL_CALL_REMINDER_LOOKBACK_MINUTES, 30, 0, 360);
    const batchLimit = normalizeInt(process.env.SCHOOL_CALL_REMINDER_BATCH_LIMIT, 150, 1, 500);

    const rows = await fetchUpcomingBookings(pool, lookaheadHours, lookbackMinutes, batchLimit);
    const adminRecipients = parseAdminRecipients();
    const now = new Date();

    let considered = 0;
    let stageMatched = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] || {};
      const bookingUuid = clean(row.booking_uuid, 72);
      const leadEmail = clean(row.work_email, 220).toLowerCase();
      const slotStartIso = isoFromSql(row.slot_start_utc);
      if (!bookingUuid || !leadEmail || !slotStartIso) {
        skipped += 1;
        continue;
      }

      considered += 1;
      const stage = stageFor(minutesUntil(slotStartIso, now));
      if (!stage) {
        skipped += 1;
        continue;
      }
      stageMatched += 1;

      const notifications = [];
      notifications.push({ channel: "lead_email", recipientEmail: leadEmail, email: reminderEmailForLead(row, stage) });
      for (let j = 0; j < adminRecipients.length; j += 1) {
        notifications.push({
          channel: "admin_email",
          recipientEmail: adminRecipients[j],
          email: reminderEmailForAdmin(row, stage),
        });
      }

      for (let k = 0; k < notifications.length; k += 1) {
        const item = notifications[k];
        if (!clean(item.recipientEmail, 220)) {
          skipped += 1;
          continue;
        }

        const basePayload = {
          bookingUuid,
          slotStartIso,
          stage,
          channel: item.channel,
          recipientEmail: item.recipientEmail,
        };

        const existing = await getExistingNotification(pool, basePayload);
        if (existing && clean(existing.status, 40).toLowerCase() === "sent") {
          skipped += 1;
          continue;
        }

        await upsertPending(pool, basePayload);

        try {
          await sendEmail({
            to: item.recipientEmail,
            subject: item.email.subject,
            text: item.email.text,
            html: item.email.html,
          });
          await markSent(pool, basePayload);
          sent += 1;
        } catch (error) {
          await markFailed(pool, Object.assign({}, basePayload, {
            errorMessage: error && error.message ? error.message : "send_failed",
          }));
          failed += 1;
        }
      }
    }

    return json(200, {
      ok: true,
      considered,
      stageMatched,
      sent,
      failed,
      skipped,
      lookedUp: rows.length,
      adminRecipients: adminRecipients.length,
    });
  } catch (error) {
    console.error("[school-call-reminder-cron] failed", {
      message: error && error.message ? error.message : String(error || "unknown_error"),
      stack: error && error.stack ? String(error.stack).slice(0, 1200) : "",
    });
    return json(500, { ok: false, error: error.message || "Could not run school call reminders." });
  }
};
