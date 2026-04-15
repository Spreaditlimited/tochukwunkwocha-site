const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { TRANSCRIPT_ACCESS_TABLE, ensureTranscriptAccessTables } = require("./_lib/transcript-access");
const { canonicalizeCourseSlug } = require("./_lib/course-config");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function canonicalCourse(value) {
  const raw = clean(value, 120).toLowerCase();
  if (!raw || raw === "all") return "all";
  return clean(canonicalizeCourseSlug(raw), 120).toLowerCase();
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();
  try {
    await ensureTranscriptAccessTables(pool);
    const q = event.queryStringParameters || {};
    const courseSlug = canonicalCourse(q.course_slug);
    const status = clean(q.status, 32).toLowerCase() || "pending";
    const limitRaw = Number(q.limit || 100);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 100;

    const where = ["ta.status = ?"];
    const params = [status];
    if (courseSlug !== "all") {
      where.push("ta.course_slug = ?");
      params.push(courseSlug);
    }

    const [rows] = await pool.query(
      `SELECT ta.id,
              ta.account_id,
              ta.course_slug,
              ta.status,
              ta.request_reason,
              ta.requested_at,
              ta.approved_at,
              ta.updated_at,
              sa.full_name,
              sa.email
       FROM ${TRANSCRIPT_ACCESS_TABLE} ta
       JOIN student_accounts sa ON sa.id = ta.account_id
       WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(ta.requested_at, ta.updated_at) DESC, ta.id DESC
       LIMIT ${limit}`,
      params
    );

    const items = (Array.isArray(rows) ? rows : []).map(function (row) {
      return {
        id: Number(row.id || 0),
        account_id: Number(row.account_id || 0),
        course_slug: clean(row.course_slug, 120).toLowerCase(),
        status: clean(row.status, 32).toLowerCase() || "pending",
        request_reason: clean(row.request_reason, 4000),
        requested_at: row.requested_at || null,
        approved_at: row.approved_at || null,
        updated_at: row.updated_at || null,
        full_name: clean(row.full_name, 180),
        email: clean(row.email, 220).toLowerCase(),
      };
    });

    return json(200, {
      ok: true,
      items,
      filters: {
        course_slug: courseSlug,
        status,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load transcript requests." });
  }
};
