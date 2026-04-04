const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const { ensureSchoolTables, requireSchoolAdminSession, schoolAnalytics } = require("./_lib/schools");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const metrics = await schoolAnalytics(pool, session.admin.schoolId, session.admin.courseSlug);
    return json(200, { ok: true, admin: session.admin, metrics });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load school dashboard." });
  }
};

