const crypto = require("crypto");
const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const { MODULES_TABLE, LESSONS_TABLE } = require("./_lib/learning");
const {
  ensureSchoolTables,
  requireSchoolAdminSession,
  SCHOOL_STUDENTS_TABLE,
  SCHOOL_CERTIFICATES_TABLE,
} = require("./_lib/schools");

const LESSON_PROGRESS_TABLE = "tochukwu_learning_lesson_progress";
const TEMP_CERT_PREVIEW_ENABLED = true;

function siteBaseUrl() {
  return String(process.env.SITE_BASE_URL || "https://tochukwunkwocha.com").trim().replace(/\/$/, "");
}

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
  const previewRequested = body.preview === true;
  if (!Number.isFinite(studentId) || studentId <= 0) return json(400, { ok: false, error: "studentId is required" });

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const [studentRows] = await pool.query(
      `SELECT id, full_name, email, account_id, status
       FROM ${SCHOOL_STUDENTS_TABLE}
       WHERE id = ?
         AND school_id = ?
       LIMIT 1`,
      [studentId, Number(session.admin.schoolId)]
    );
    if (!studentRows || !studentRows.length) return json(404, { ok: false, error: "Student not found" });
    const student = studentRows[0];
    if (String(student.status || "").toLowerCase() !== "active") {
      return json(400, { ok: false, error: "Student must be active before certificate can be issued" });
    }
    const accountId = Number(student.account_id || 0);
    if (!Number.isFinite(accountId) || accountId <= 0) {
      return json(400, { ok: false, error: "Student has no learner account yet" });
    }

    const [totRows] = await pool.query(
      `SELECT COUNT(*) AS total_lessons
       FROM ${LESSONS_TABLE} l
       JOIN ${MODULES_TABLE} m ON m.id = l.module_id
       WHERE m.course_slug = ?
         AND m.is_active = 1
         AND l.is_active = 1`,
      [session.admin.courseSlug]
    );
    const totalLessons = Number(totRows && totRows[0] && totRows[0].total_lessons || 0);
    if (!totalLessons) return json(400, { ok: false, error: "Course has no lessons configured." });

    const [doneRows] = await pool.query(
      `SELECT COUNT(*) AS completed_lessons
       FROM ${LESSON_PROGRESS_TABLE} p
       JOIN ${LESSONS_TABLE} l ON l.id = p.lesson_id
       JOIN ${MODULES_TABLE} m ON m.id = l.module_id
       WHERE p.account_id = ?
         AND p.is_completed = 1
         AND m.course_slug = ?
         AND m.is_active = 1
         AND l.is_active = 1`,
      [accountId, session.admin.courseSlug]
    );
    const completedLessons = Number(doneRows && doneRows[0] && doneRows[0].completed_lessons || 0);
    var previewAllowed = false;
    if (completedLessons < totalLessons && previewRequested && TEMP_CERT_PREVIEW_ENABLED) {
      const [previewRows] = await pool.query(
        `SELECT id
         FROM ${SCHOOL_STUDENTS_TABLE}
         WHERE school_id = ?
           AND status = 'active'
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [Number(session.admin.schoolId)]
      );
      const previewStudentId = Number(previewRows && previewRows[0] && previewRows[0].id || 0);
      previewAllowed = previewStudentId > 0 && previewStudentId === Number(studentId);
    }

    if (completedLessons < totalLessons && !previewAllowed) {
      return json(400, { ok: false, error: "Student has not completed 100% of the course." });
    }

    const certNo = `TN-SCH-${crypto.randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    await pool.query(
      `INSERT INTO ${SCHOOL_CERTIFICATES_TABLE}
        (school_id, student_id, course_slug, certificate_no, status, issued_by_admin_id, issued_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'issued', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         certificate_no = certificate_no,
         status = 'issued',
         issued_by_admin_id = VALUES(issued_by_admin_id),
         issued_at = VALUES(issued_at),
         updated_at = VALUES(updated_at)`,
      [
        Number(session.admin.schoolId),
        studentId,
        session.admin.courseSlug,
        certNo,
        Number(session.admin.id),
        now,
        now,
        now,
      ]
    );

    const [certRows] = await pool.query(
      `SELECT certificate_no, issued_at
       FROM ${SCHOOL_CERTIFICATES_TABLE}
       WHERE student_id = ?
         AND course_slug = ?
       LIMIT 1`,
      [studentId, session.admin.courseSlug]
    );

    return json(200, {
      ok: true,
      previewIssued: !!(completedLessons < totalLessons),
      certificate: {
        certificateNo: certRows && certRows[0] ? String(certRows[0].certificate_no || certNo) : certNo,
        certificateUrl:
          `${siteBaseUrl()}/schools/certificate/?certificate_no=` +
          encodeURIComponent(certRows && certRows[0] ? String(certRows[0].certificate_no || certNo) : certNo),
        issuedAt: certRows && certRows[0] && certRows[0].issued_at
          ? new Date(certRows[0].issued_at).toISOString()
          : new Date().toISOString(),
        student: {
          id: Number(student.id),
          fullName: String(student.full_name || ""),
          email: String(student.email || ""),
        },
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not issue certificate." });
  }
};
