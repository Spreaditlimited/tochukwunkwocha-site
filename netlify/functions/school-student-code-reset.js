const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const { ensureSchoolTables, requireSchoolAdminSession, resetSchoolStudentCode } = require("./_lib/schools");

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

  const studentId = Number(body.studentId || 0);
  if (!Number.isFinite(studentId) || studentId <= 0) {
    return json(400, { ok: false, error: "studentId is required" });
  }

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const result = await resetSchoolStudentCode(pool, {
      schoolId: Number(session.admin.schoolId),
      studentId,
      adminId: Number(session.admin.id),
      reason: clean(body.reason, 300) || "manual_reset",
    });

    return json(200, {
      ok: true,
      student: {
        id: Number(result.studentId),
        previous_code: result.previousCode || "",
        student_code: result.newCode || "",
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not reset student code." });
  }
};
