const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  SCHOOL_CALL_BOOKINGS_TABLE,
  ensureSchoolCallTablesTochukwu,
  toPublicBookingRow,
} = require("./_lib/school-calls-tochukwu");
const {
  BUILD_SCORECARDS_TABLE,
  ensureBuildScorecardTablesTochukwu,
} = require("./_lib/build-scorecards-tochukwu");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 1000);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool); } catch (_error) {}
    await ensureSchoolCallTablesTochukwu(pool);
    await ensureBuildScorecardTablesTochukwu(pool);

    const [rows] = await pool.query(
      `SELECT
         c.id,
         c.booking_uuid,
         c.manage_token,
         c.full_name,
         c.school_name,
         c.work_email,
         c.phone,
         c.role_title,
         c.student_population,
         c.lead_source_type,
         c.lead_source_path,
         c.source_lead_uuid,
         c.timezone_label,
         DATE_FORMAT(c.slot_start_utc, '%Y-%m-%d %H:%i:%s') AS slot_start_utc,
         DATE_FORMAT(c.slot_end_utc, '%Y-%m-%d %H:%i:%s') AS slot_end_utc,
         c.duration_minutes,
         c.status,
         c.zoom_meeting_id,
         c.zoom_join_url,
         c.zoom_start_url,
         c.cancel_reason,
         c.reschedule_note,
         c.assigned_owner,
         c.call_outcome_status,
         c.outcome_feedback,
         DATE_FORMAT(c.next_follow_up_at, '%Y-%m-%d %H:%i:%s') AS next_follow_up_at,
         c.outcome_updated_by,
         DATE_FORMAT(c.outcome_updated_at, '%Y-%m-%d %H:%i:%s') AS outcome_updated_at,
         DATE_FORMAT(c.cancelled_at, '%Y-%m-%d %H:%i:%s') AS cancelled_at,
         DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(c.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
         b.lead_uuid AS build_lead_uuid,
         b.business_name,
         b.score AS build_score,
         b.band_key,
         b.headline AS build_headline,
         b.answers_json,
         DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS build_created_at
       FROM ${SCHOOL_CALL_BOOKINGS_TABLE} c
       LEFT JOIN ${BUILD_SCORECARDS_TABLE} b
         ON b.lead_uuid = c.source_lead_uuid
         OR (c.source_lead_uuid IS NULL AND c.source_lead_uuid = '' AND b.work_email = c.work_email)
       WHERE c.lead_source_type = 'build'
       ORDER BY COALESCE(c.slot_start_utc, c.created_at) DESC, c.id DESC
       LIMIT 300`
    );

    const bookings = (rows || []).map(function (row) {
      const base = toPublicBookingRow(row);
      let answers = [];
      try {
        const parsed = row.answers_json ? JSON.parse(String(row.answers_json)) : [];
        if (Array.isArray(parsed)) answers = parsed;
      } catch (_error) {}
      return Object.assign({}, base, {
        buildLeadUuid: clean(row.build_lead_uuid, 64),
        buildBusinessName: clean(row.business_name, 220),
        buildScore: Number(row.build_score || 0),
        buildBandKey: clean(row.band_key, 40),
        buildHeadline: clean(row.build_headline, 255),
        buildAnswers: answers,
        buildSubmittedAt: clean(row.build_created_at, 40),
      });
    });

    return json(200, { ok: true, bookings });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load build calls" });
  }
};
