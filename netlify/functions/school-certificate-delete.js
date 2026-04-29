const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const {
  ensureSchoolTables,
  requireSchoolAdminSession,
  SCHOOL_STUDENTS_TABLE,
  SCHOOL_CERTIFICATES_TABLE,
} = require("./_lib/schools");

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
  if (!Number.isFinite(studentId) || studentId <= 0) {
    return json(400, { ok: false, error: "studentId is required" });
  }

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const [studentRows] = await pool.query(
      `SELECT id
       FROM ${SCHOOL_STUDENTS_TABLE}
       WHERE id = ?
         AND school_id = ?
       LIMIT 1`,
      [studentId, Number(session.admin.schoolId)]
    );
    if (!Array.isArray(studentRows) || !studentRows.length) {
      return json(404, { ok: false, error: "Student not found" });
    }

    const [res] = await pool.query(
      `DELETE FROM ${SCHOOL_CERTIFICATES_TABLE}
       WHERE student_id = ?
         AND school_id = ?
         AND course_slug = ?`,
      [studentId, Number(session.admin.schoolId), String(session.admin.courseSlug || "").trim().toLowerCase()]
    );

    return json(200, {
      ok: true,
      deleted: Number(res && res.affectedRows || 0),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not delete certificate." });
  }
};
