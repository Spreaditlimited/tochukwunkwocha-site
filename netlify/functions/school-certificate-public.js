const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const {
  ensureSchoolTables,
  SCHOOL_CERTIFICATES_TABLE,
  SCHOOL_STUDENTS_TABLE,
  SCHOOL_ACCOUNTS_TABLE,
} = require("./_lib/schools");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function humanCourseName(slug) {
  const s = clean(slug, 120).toLowerCase();
  if (s === "prompt-to-profit") return "Prompt to Profit";
  if (s === "prompt-to-production") return "Prompt to Profit Advanced";
  return s || "Course";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const qs = event.queryStringParameters || {};
  const certificateNo = clean(qs.certificate_no || qs.certificateNo, 140).toUpperCase();
  if (!certificateNo) return json(400, { ok: false, error: "certificate_no is required" });

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    const [rows] = await pool.query(
      `SELECT
         c.certificate_no,
         c.issued_at,
         c.course_slug,
         c.status,
         s.full_name AS student_name,
         s.email AS student_email,
         sc.school_name
       FROM ${SCHOOL_CERTIFICATES_TABLE} c
       JOIN ${SCHOOL_STUDENTS_TABLE} s ON s.id = c.student_id
       JOIN ${SCHOOL_ACCOUNTS_TABLE} sc ON sc.id = c.school_id
       WHERE c.certificate_no = ?
         AND c.status = 'issued'
       LIMIT 1`,
      [certificateNo]
    );
    if (!rows || !rows.length) return json(404, { ok: false, error: "Certificate not found" });
    const row = rows[0];
    return json(200, {
      ok: true,
      certificate: {
        certificateNo: clean(row.certificate_no, 140),
        issuedAt: row.issued_at ? new Date(row.issued_at).toISOString() : null,
        courseSlug: clean(row.course_slug, 120),
        courseName: humanCourseName(row.course_slug),
        studentName: clean(row.student_name, 180),
        studentEmail: clean(row.student_email, 220),
        schoolName: clean(row.school_name, 220),
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load certificate." });
  }
};
