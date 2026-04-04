const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const { ensureSchoolTables, requireSchoolAdminSession, setSchoolStudentStatus } = require("./_lib/schools");

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const studentId = Number(body.studentId || 0);
  const active = !!body.active;
  if (!Number.isFinite(studentId) || studentId <= 0) {
    return json(400, { ok: false, error: "studentId is required" });
  }

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    await setSchoolStudentStatus(pool, {
      schoolId: session.admin.schoolId,
      studentId,
      active,
    });
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not update student status." });
  }
};

