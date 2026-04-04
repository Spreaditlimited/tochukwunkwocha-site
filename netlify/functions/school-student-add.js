const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const { ensureSchoolTables, requireSchoolAdminSession, addSchoolStudents } = require("./_lib/schools");

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const fullName = clean(body.full_name || body.fullName, 180);
  const email = clean(body.email, 220).toLowerCase();
  if (!fullName || !email) {
    return json(400, { ok: false, error: "full_name and email are required" });
  }

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const result = await addSchoolStudents(pool, {
      schoolId: session.admin.schoolId,
      courseSlug: session.admin.courseSlug,
      rows: [{ full_name: fullName, email }],
    });
    return json(200, { ok: true, result });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not add student." });
  }
};
