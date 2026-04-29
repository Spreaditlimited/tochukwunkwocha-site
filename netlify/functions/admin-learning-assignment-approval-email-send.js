const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { MODULES_TABLE, LESSONS_TABLE } = require("./_lib/learning");
const { LESSON_PROGRESS_TABLE } = require("./_lib/learning-progress");
const { STUDENT_CERTIFICATES_TABLE, ensureStudentCertificatesTable } = require("./_lib/student-certificates");
const { getCourseName } = require("./_lib/course-config");
const { sendEmail } = require("./_lib/email");
const { ASSIGNMENTS_TABLE, ensureLearningSupportTables } = require("./_lib/learning-support");

const CERTIFICATE_PROOF_MARKER = "[CERTIFICATE_PROOF_WEBSITE]";

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

function nowSqlDateTime() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function siteBaseUrl() {
  return clean(process.env.SITE_BASE_URL || "https://tochukwunkwocha.com", 240).replace(/\/$/, "");
}

function certificateNo() {
  return `TN-IND-${crypto.randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
}

function certificateBlockReasonText(reason) {
  const code = clean(reason, 80).toLowerCase();
  if (code === "missing_account_or_course") return "student account/course mapping is missing";
  if (code === "account_not_found") return "student account was not found";
  if (code === "certificate_name_unconfirmed") return "student has not confirmed certificate name in Dashboard Profile";
  if (code === "recipient_name_missing") return "student profile name is missing";
  if (code === "course_incomplete") return "student is not currently at 100% completion for this course";
  if (code === "certificate_not_found_after_upsert") return "certificate record could not be loaded after issuance";
  return code || "unknown requirement";
}

async function hasCompletedCourse(pool, accountId, courseSlug) {
  const [totalRows] = await pool.query(
    `SELECT COUNT(*) AS total_lessons
     FROM ${LESSONS_TABLE} l
     JOIN ${MODULES_TABLE} m ON m.id = l.module_id
     WHERE m.is_active = 1
       AND l.is_active = 1
       AND m.course_slug = ?`,
    [courseSlug]
  );
  const totalLessons = Number(totalRows && totalRows[0] && totalRows[0].total_lessons || 0);
  if (!(totalLessons > 0)) return false;

  const [doneRows] = await pool.query(
    `SELECT COUNT(*) AS completed_lessons
     FROM ${LESSON_PROGRESS_TABLE} p
     JOIN ${LESSONS_TABLE} l ON l.id = p.lesson_id
     JOIN ${MODULES_TABLE} m ON m.id = l.module_id
     WHERE p.account_id = ?
       AND p.is_completed = 1
       AND m.is_active = 1
       AND l.is_active = 1
       AND m.course_slug = ?`,
    [Number(accountId), courseSlug]
  );
  const completedLessons = Number(doneRows && doneRows[0] && doneRows[0].completed_lessons || 0);
  return completedLessons >= totalLessons;
}

async function issueIndividualCertificateIfEligible(pool, assignment) {
  const accountId = Number(assignment && assignment.account_id || 0);
  const courseSlug = clean(assignment && assignment.course_slug, 120).toLowerCase();
  if (!(accountId > 0) || !courseSlug) return { issued: false, reason: "missing_account_or_course" };

  const [accountRows] = await pool.query(
    `SELECT full_name, certificate_name_confirmed_at
     FROM student_accounts
     WHERE id = ?
     LIMIT 1`,
    [accountId]
  );
  const account = accountRows && accountRows[0] ? accountRows[0] : null;
  if (!account) return { issued: false, reason: "account_not_found" };
  if (!account.certificate_name_confirmed_at) return { issued: false, reason: "certificate_name_unconfirmed" };
  const recipientName = clean(account.full_name, 180);
  if (!recipientName) return { issued: false, reason: "recipient_name_missing" };

  const completed = await hasCompletedCourse(pool, accountId, courseSlug);
  if (!completed) return { issued: false, reason: "course_incomplete" };

  await ensureStudentCertificatesTable(pool);
  const now = nowSqlDateTime();
  await pool.query(
    `INSERT INTO ${STUDENT_CERTIFICATES_TABLE}
      (account_id, course_slug, certificate_no, recipient_name, status, issued_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'issued', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       certificate_no = certificate_no,
       recipient_name = recipient_name,
       status = 'issued',
       issued_at = issued_at,
       updated_at = VALUES(updated_at)`,
    [accountId, courseSlug, certificateNo(), recipientName, now, now, now]
  );
  const [certRows] = await pool.query(
    `SELECT certificate_no, issued_at
     FROM ${STUDENT_CERTIFICATES_TABLE}
     WHERE account_id = ?
       AND course_slug = ?
       AND status = 'issued'
     LIMIT 1`,
    [accountId, courseSlug]
  );
  const certNo = clean(certRows && certRows[0] && certRows[0].certificate_no, 140);
  if (!certNo) return { issued: false, reason: "certificate_not_found_after_upsert" };
  return {
    issued: true,
    certificateNo: certNo,
    certificateUrl: `${siteBaseUrl()}/dashboard/certificate/?certificate_no=${encodeURIComponent(certNo)}`,
  };
}

async function sendApprovalEmail(input) {
  const to = clean(input && input.to, 220).toLowerCase();
  if (!to) throw new Error("Student email is missing.");
  const studentName = clean(input && input.studentName, 180) || "Student";
  const courseName = clean(input && input.courseName, 180) || "your course";
  const adminFeedback = clean(input && input.adminFeedback, 4000);
  const certificateUrl = clean(input && input.certificateUrl, 1500);
  const websiteUrl = clean(input && input.websiteUrl, 1500);
  const certificateReady = !!certificateUrl;
  const feedbackLine = adminFeedback ? adminFeedback : "No additional feedback was added.";
  const subject = certificateReady
    ? "Your Website Proof Was Approved — Certificate Ready"
    : "Your Website Proof Was Approved";
  const html = [
    `<p>Hello ${studentName},</p>`,
    `<p>Great news. Your website proof for <strong>${courseName}</strong> has been approved.</p>`,
    websiteUrl ? `<p><strong>Approved website:</strong> <a href="${websiteUrl}">${websiteUrl}</a></p>` : "",
    certificateReady
      ? `<p>Your certificate is now available.</p><p><a href="${certificateUrl}">Download your certificate</a></p>`
      : "<p>Your certificate will be available after all certificate requirements are fully satisfied.</p>",
    `<p><strong>Admin feedback:</strong> ${feedbackLine}</p>`,
    "<p>If your dashboard does not update immediately, refresh and check again.</p>",
    "<p>Tochukwu Tech and AI Academy</p>",
  ].filter(Boolean).join("\n");
  const text = [
    `Hello ${studentName},`,
    "",
    `Great news. Your website proof for ${courseName} has been approved.`,
    websiteUrl ? `Approved website: ${websiteUrl}` : "",
    certificateReady
      ? `Your certificate is now available: ${certificateUrl}`
      : "Your certificate will be available after all certificate requirements are fully satisfied.",
    `Admin feedback: ${feedbackLine}`,
    "If your dashboard does not update immediately, refresh and check again.",
    "",
    "Tochukwu Tech and AI Academy",
  ].filter(Boolean).join("\n");
  await sendEmail({ to, subject, html, text });
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });
  const assignmentId = Number(body.assignment_id || 0);
  if (!(assignmentId > 0)) return json(400, { ok: false, error: "assignment_id is required" });

  const pool = getPool();
  try {
    await ensureLearningSupportTables(pool, { bootstrap: true });
    const [rows] = await pool.query(
      `SELECT id, course_slug, account_id, student_email, student_name, submission_kind, submission_text, submission_link, status, admin_feedback
       FROM ${ASSIGNMENTS_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [assignmentId]
    );
    if (!Array.isArray(rows) || !rows.length) return json(404, { ok: false, error: "Assignment not found." });
    const item = rows[0];
    const isCertificateProof = clean(item.submission_kind, 24).toLowerCase() === "link"
      && clean(item.submission_text, 120) === CERTIFICATE_PROOF_MARKER;
    if (!isCertificateProof) return json(400, { ok: false, error: "This assignment is not a certificate proof submission." });
    if (clean(item.status, 32).toLowerCase() !== "approved") {
      return json(400, { ok: false, error: "Approve this submission before sending an approval email." });
    }

    const cert = await issueIndividualCertificateIfEligible(pool, item);
    await sendApprovalEmail({
      to: item.student_email,
      studentName: item.student_name,
      courseName: getCourseName(item.course_slug),
      websiteUrl: item.submission_link,
      certificateUrl: cert && cert.issued ? cert.certificateUrl : "",
      adminFeedback: item.admin_feedback,
    });

    return json(200, {
      ok: true,
      sent: true,
      certificateReady: !!(cert && cert.issued),
      message: cert && cert.issued
        ? "Approval email sent with certificate link."
        : "Approval email sent. Certificate link not included: " + certificateBlockReasonText(cert && cert.reason) + ".",
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not send approval email." });
  }
};
