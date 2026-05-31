const crypto = require("crypto");
const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const {
  ensureSchoolTables,
  requireSchoolAdminSession,
  SCHOOL_STUDENTS_TABLE,
  SCHOOL_CERTIFICATES_TABLE,
} = require("./_lib/schools");
const { getLearnerBatchAwareCompletion } = require("./_lib/learning-progress");

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
  if (!Number.isFinite(studentId) || studentId <= 0) return json(400, { ok: false, error: "studentId is required" });

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const [studentRows] = await pool.query(
      `SELECT id, full_name, email, account_id, status, website_url, website_submitted_at
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
    if (!String(student.website_url || "").trim()) {
      return json(400, { ok: false, error: "Student must submit website link before certificate can be issued" });
    }
    const accountId = Number(student.account_id || 0);
    if (!Number.isFinite(accountId) || accountId <= 0) {
      return json(400, { ok: false, error: "Student has no learner account yet" });
    }
    const [accountRows] = await pool.query(
      `SELECT full_name, certificate_name_confirmed_at
       FROM student_accounts
       WHERE id = ?
       LIMIT 1`,
      [accountId]
    );
    const account = accountRows && accountRows.length ? accountRows[0] : null;
    if (!account) return json(404, { ok: false, error: "Learner account not found" });
    if (!account.certificate_name_confirmed_at) {
      return json(400, {
        ok: false,
        code: "CERTIFICATE_NAME_CONFIRMATION_REQUIRED",
        error: "Student must confirm their certificate name in profile before certificate can be issued",
      });
    }
    const recipientName = String(account.full_name || "").trim();
    if (!recipientName) {
      return json(400, { ok: false, error: "Student profile name is missing" });
    }

    const completion = await getLearnerBatchAwareCompletion(pool, {
      account_id: accountId,
      account_email: String(student.email || "").toLowerCase(),
      course_slug: session.admin.courseSlug,
    });
    const totalLessons = Number(completion && completion.total_lessons || 0);
    if (!totalLessons) return json(400, { ok: false, error: "Course has no lessons configured." });
    const completedLessons = Number(completion && completion.completed_lessons || 0);

    if (completedLessons < totalLessons) {
      return json(400, { ok: false, error: "Student has not completed 100% of the course." });
    }

    const certNo = `TN-SCH-${crypto.randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    await pool.query(
      `INSERT INTO ${SCHOOL_CERTIFICATES_TABLE}
        (school_id, student_id, course_slug, certificate_no, recipient_name, status, issued_by_admin_id, issued_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         certificate_no = certificate_no,
         recipient_name = recipient_name,
         status = 'issued',
         issued_by_admin_id = VALUES(issued_by_admin_id),
         issued_at = VALUES(issued_at),
         updated_at = VALUES(updated_at)`,
      [
        Number(session.admin.schoolId),
        studentId,
        session.admin.courseSlug,
        certNo,
        recipientName,
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
          fullName: recipientName,
          email: String(student.email || ""),
        },
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not issue certificate." });
  }
};
