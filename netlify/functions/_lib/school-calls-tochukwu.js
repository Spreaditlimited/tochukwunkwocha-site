const { nowSql } = require("./db");

const SCHOOL_CALL_BOOKINGS_TABLE = "school_call_bookings_tochukwu";

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 400);
}

function normalizeEmail(value) {
  const email = clean(value, 220).toLowerCase();
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

async function ensureSchoolCallTablesTochukwu(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHOOL_CALL_BOOKINGS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      booking_uuid VARCHAR(64) NOT NULL,
      manage_token VARCHAR(128) NOT NULL,
      full_name VARCHAR(180) NOT NULL,
      school_name VARCHAR(220) NOT NULL,
      work_email VARCHAR(220) NOT NULL,
      phone VARCHAR(80) NULL,
      role_title VARCHAR(140) NULL,
      student_population VARCHAR(60) NULL,
      timezone_label VARCHAR(80) NOT NULL DEFAULT 'UTC',
      slot_start_utc DATETIME NULL,
      slot_end_utc DATETIME NULL,
      duration_minutes INT NOT NULL DEFAULT 30,
      status VARCHAR(40) NOT NULL DEFAULT 'booked',
      zoom_meeting_id VARCHAR(120) NULL,
      zoom_join_url VARCHAR(1200) NULL,
      zoom_start_url VARCHAR(1200) NULL,
      cancel_reason VARCHAR(255) NULL,
      reschedule_note VARCHAR(255) NULL,
      cancelled_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_school_call_booking_uuid_tochukwu (booking_uuid),
      UNIQUE KEY uniq_school_call_manage_token_tochukwu (manage_token),
      UNIQUE KEY uniq_school_call_slot_start_tochukwu (slot_start_utc),
      KEY idx_school_call_email_tochukwu (work_email),
      KEY idx_school_call_status_tochukwu (status),
      KEY idx_school_call_zoom_meeting_tochukwu (zoom_meeting_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE ${SCHOOL_CALL_BOOKINGS_TABLE} ADD COLUMN cancel_reason VARCHAR(255) NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_CALL_BOOKINGS_TABLE} ADD COLUMN reschedule_note VARCHAR(255) NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_CALL_BOOKINGS_TABLE} ADD COLUMN cancelled_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_CALL_BOOKINGS_TABLE} ADD UNIQUE KEY uniq_school_call_slot_start_tochukwu (slot_start_utc)`);
}

function getLondonDateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => (parts.find((p) => p.type === type) || {}).value || "";
  return {
    year: Number(get("year") || 0),
    month: Number(get("month") || 0),
    day: Number(get("day") || 0),
    weekday: String(get("weekday") || "").toLowerCase(),
  };
}

function timeZoneOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const byType = {};
  parts.forEach((p) => {
    byType[p.type] = p.value;
  });
  const asUTC = Date.UTC(
    Number(byType.year || 0),
    Number(byType.month || 1) - 1,
    Number(byType.day || 1),
    Number(byType.hour || 0),
    Number(byType.minute || 0),
    Number(byType.second || 0)
  );
  return (asUTC - date.getTime()) / 60000;
}

function londonLocalToUtcIso(year, month, day, hour, minute) {
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const probe = new Date(naiveUtcMs);
  const offsetMin = timeZoneOffsetMinutes(probe, "Europe/London");
  const utcMs = naiveUtcMs - offsetMin * 60000;
  return new Date(utcMs).toISOString();
}

function sqlFromIso(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function isoFromSql(value) {
  const raw = clean(value, 40);
  if (!raw) return "";
  const normalized = raw.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString();
}

function slotLabel(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(d);
}

function buildCandidateSlots(input) {
  const days = Math.max(7, Math.min(35, Number((input && input.days) || 21) || 21));
  const durationMinutes = Math.max(15, Math.min(120, Number((input && input.durationMinutes) || 30) || 30));
  const now = new Date();
  const slots = [];

  const londonHours = [10, 12, 14, 16];
  for (let i = 0; i < days; i += 1) {
    const cursor = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const parts = getLondonDateParts(cursor);
    if (!parts.year || !parts.month || !parts.day) continue;
    if (parts.weekday === "sat" || parts.weekday === "sun") continue;

    for (const hour of londonHours) {
      const startIso = londonLocalToUtcIso(parts.year, parts.month, parts.day, hour, 0);
      const startDate = new Date(startIso);
      if (!Number.isFinite(startDate.getTime())) continue;
      if (startDate.getTime() <= now.getTime() + 2 * 60 * 60 * 1000) continue;
      const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

      slots.push({
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
        label: slotLabel(startDate.toISOString()),
      });
    }
  }

  return slots.sort((a, b) => (a.startIso < b.startIso ? -1 : a.startIso > b.startIso ? 1 : 0));
}

async function fetchActiveBookedSlotMap(pool) {
  const [rows] = await pool.query(
    `SELECT slot_start_utc
     FROM ${SCHOOL_CALL_BOOKINGS_TABLE}
     WHERE status IN ('booked', 'rescheduled')
       AND slot_start_utc IS NOT NULL`
  );
  const map = new Set();
  (rows || []).forEach((row) => {
    const iso = isoFromSql(row.slot_start_utc);
    if (iso) map.add(iso);
  });
  return map;
}

function toPublicBookingRow(row) {
  return {
    bookingUuid: clean(row.booking_uuid, 72),
    fullName: clean(row.full_name, 180),
    schoolName: clean(row.school_name, 220),
    workEmail: clean(row.work_email, 220),
    phone: clean(row.phone, 80),
    role: clean(row.role_title, 140),
    studentPopulation: clean(row.student_population, 60),
    timezone: clean(row.timezone_label, 80) || "UTC",
    status: clean(row.status, 40),
    slotStartIso: isoFromSql(row.slot_start_utc),
    slotEndIso: isoFromSql(row.slot_end_utc),
    durationMinutes: Number(row.duration_minutes || 30),
    zoomJoinUrl: clean(row.zoom_join_url, 1200),
    zoomMeetingId: clean(row.zoom_meeting_id, 120),
    createdAt: isoFromSql(row.created_at),
    updatedAt: isoFromSql(row.updated_at),
    cancelReason: clean(row.cancel_reason, 255),
    rescheduleNote: clean(row.reschedule_note, 255),
    cancelledAt: isoFromSql(row.cancelled_at),
    slotLabel: slotLabel(isoFromSql(row.slot_start_utc)),
  };
}

module.exports = {
  SCHOOL_CALL_BOOKINGS_TABLE,
  ensureSchoolCallTablesTochukwu,
  normalizeEmail,
  clean,
  nowSql,
  sqlFromIso,
  isoFromSql,
  buildCandidateSlots,
  fetchActiveBookedSlotMap,
  toPublicBookingRow,
  slotLabel,
};
