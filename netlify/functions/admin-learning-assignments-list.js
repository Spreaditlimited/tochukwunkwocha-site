const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLearningSupportTables,
  listAssignmentsForAdmin,
  normalizeCourseSlug,
} = require("./_lib/learning-support");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const courseSlug = normalizeCourseSlug(event.queryStringParameters && event.queryStringParameters.course_slug) || "all";
  const status = clean(event.queryStringParameters && event.queryStringParameters.status, 32).toLowerCase() || "all";
  const search = clean(event.queryStringParameters && event.queryStringParameters.search, 220);

  const pool = getPool();
  try {
    await ensureLearningSupportTables(pool, { bootstrap: true });
    const payload = await listAssignmentsForAdmin(pool, {
      course_slug: courseSlug,
      status,
      search,
      limit: 200,
    });
    return json(200, {
      ok: true,
      filters: {
        course_slug: courseSlug,
        status,
        search,
      },
      total: Number(payload.total || 0),
      items: Array.isArray(payload.items) ? payload.items : [],
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load assignments." });
  }
};
