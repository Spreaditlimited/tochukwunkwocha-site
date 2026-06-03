const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { getLearnerBatchAwareCompletion } = require("./_lib/learning-progress");
const { STUDENT_CERTIFICATES_TABLE, ensureStudentCertificatesTable } = require("./_lib/student-certificates");
const { getCourseName } = require("./_lib/course-config");
const { sendEmail } = require("./_lib/email");
const {
  ASSIGNMENTS_TABLE,
  ensureLearningSupportTables,
  updateAssignmentByAdmin,
} = require("./_lib/learning-support");

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br/>");
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

function assignmentStatusLabel(status) {
  const raw = clean(status, 32).toLowerCase();
  if (raw === "submitted") return "Submitted";
  if (raw === "in_review") return "In review";
  if (raw === "needs_revision") return "Needs revision";
  if (raw === "approved") return "Approved";
  if (raw === "rejected") return "Rejected";
  return raw ? raw.replace(/_/g, " ") : "Updated";
}

async function hasCompletedCourse(pool, accountId, accountEmail, courseSlug) {
  const email = clean(accountEmail, 220).toLowerCase();
  if (!(Number(accountId || 0) > 0) || !email || !clean(courseSlug, 120)) return false;
  const completion = await getLearnerBatchAwareCompletion(pool, {
    account_id: Number(accountId || 0),
    account_email: email,
    course_slug: clean(courseSlug, 120).toLowerCase(),
  });
  const totalLessons = Number(completion && completion.total_lessons || 0);
  const completedLessons = Number(completion && completion.completed_lessons || 0);
  return totalLessons > 0 && completedLessons >= totalLessons;
}

async function issueIndividualCertificateIfEligible(pool, assignment) {
  const accountId = Number(assignment && assignment.account_id || 0);
  const courseSlug = clean(assignment && assignment.course_slug, 120).toLowerCase();
  if (!(accountId > 0) || !courseSlug) return { issued: false, reason: "missing_account_or_course" };

  const [accountRows] = await pool.query(
    `SELECT full_name, email, certificate_name_confirmed_at
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

  const completionEmail = clean(assignment && assignment.student_email, 220).toLowerCase()
    || clean(account && account.email, 220).toLowerCase();
  const completed = await hasCompletedCourse(pool, accountId, completionEmail, courseSlug);
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
    issuedAt: certRows && certRows[0] && certRows[0].issued_at
      ? new Date(certRows[0].issued_at).toISOString()
      : new Date().toISOString(),
  };
}

async function sendStatusChangeEmail(input) {
  const to = clean(input && input.to, 220).toLowerCase();
  if (!to) throw new Error("Student email is missing.");
  const studentName = clean(input && input.studentName, 180) || "Student";
  const courseName = clean(input && input.courseName, 180) || "your course";
  const adminFeedback = clean(input && input.adminFeedback, 4000);
  const previousStatus = clean(input && input.previousStatus, 32);
  const nextStatus = clean(input && input.nextStatus, 32);
  const certificateUrl = clean(input && input.certificateUrl, 1500);
  const websiteUrl = clean(input && input.websiteUrl, 1500);
  const certificateReady = !!certificateUrl;
  const feedbackLine = adminFeedback ? adminFeedback : "No additional feedback was added.";
  const statusLabel = assignmentStatusLabel(nextStatus);
  const subject = certificateReady
    ? "Your learning support status changed - Certificate ready"
    : `Your learning support status changed to ${statusLabel}`;
  const dashboardUrl = `${siteBaseUrl()}/dashboard/courses/`;
  const html = [
    `<p>Hello ${escapeHtml(studentName)},</p>`,
    `<p>Your learning support submission for <strong>${escapeHtml(courseName)}</strong> has been updated.</p>`,
    `<p><strong>Status:</strong> ${escapeHtml(assignmentStatusLabel(previousStatus))} to ${escapeHtml(statusLabel)}</p>`,
    `<p><strong>Feedback:</strong><br/>${nl2br(feedbackLine)}</p>`,
    websiteUrl && nextStatus === "approved" ? `<p><strong>Approved website:</strong> <a href="${escapeHtml(websiteUrl)}">${escapeHtml(websiteUrl)}</a></p>` : "",
    certificateReady
      ? `<p>Your certificate is now available.</p><p><a href="${escapeHtml(certificateUrl)}">Download your certificate</a></p>`
      : "",
    !certificateReady && nextStatus === "approved" && websiteUrl
      ? "<p>Your certificate will be available after all certificate requirements are fully satisfied.</p>"
      : "",
    `<p><a href="${escapeHtml(dashboardUrl)}">Open your dashboard</a></p>`,
    "<p>Tochukwu Tech and AI Academy</p>",
  ].filter(Boolean).join("\n");
  const text = [
    `Hello ${studentName},`,
    "",
    `Your learning support submission for ${courseName} has been updated.`,
    `Status: ${assignmentStatusLabel(previousStatus)} to ${statusLabel}`,
    `Feedback: ${feedbackLine}`,
    websiteUrl && nextStatus === "approved" ? `Approved website: ${websiteUrl}` : "",
    certificateReady ? `Your certificate is now available: ${certificateUrl}` : "",
    !certificateReady && nextStatus === "approved" && websiteUrl
      ? "Your certificate will be available after all certificate requirements are fully satisfied."
      : "",
    `Open your dashboard: ${dashboardUrl}`,
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

  const pool = getPool();
  try {
    await ensureLearningSupportTables(pool, { bootstrap: true });
    const assignmentId = Number(body.assignment_id || 0);
    const [beforeRows] = await pool.query(
      `SELECT id, course_slug, account_id, student_email, student_name, submission_kind, submission_text, submission_link, status
       FROM ${ASSIGNMENTS_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [assignmentId]
    );
    const before = beforeRows && beforeRows[0] ? beforeRows[0] : null;
    const item = await updateAssignmentByAdmin(pool, {
      assignment_id: assignmentId,
      status: body.status,
      admin_feedback: body.admin_feedback,
      admin_actor: auth && auth.payload ? auth.payload.role : "admin",
    });
    const previousStatus = clean(before && before.status, 32).toLowerCase();
    const nextStatus = clean(item && item.status, 32).toLowerCase();
    const statusChanged = previousStatus && nextStatus && previousStatus !== nextStatus;
    const becameApproved = previousStatus !== "approved" && nextStatus === "approved";
    const isCertificateProof = clean(before && before.submission_kind, 24).toLowerCase() === "link"
      && clean(before && before.submission_text, 120) === CERTIFICATE_PROOF_MARKER;
    let email = {
      attempted: false,
      sent: false,
      certificateReady: false,
      note: "",
    };
    if (statusChanged) {
      email.attempted = true;
      let cert = null;
      if (becameApproved && isCertificateProof) {
        cert = await issueIndividualCertificateIfEligible(pool, before);
      }
      email.certificateReady = !!(cert && cert.issued);
      try {
        await sendStatusChangeEmail({
          to: before.student_email,
          studentName: before.student_name,
          courseName: getCourseName(before.course_slug),
          websiteUrl: before.submission_link,
          certificateUrl: cert && cert.issued ? cert.certificateUrl : "",
          adminFeedback: item && item.admin_feedback ? item.admin_feedback : "",
          previousStatus,
          nextStatus,
        });
        email.sent = true;
        if (cert && cert.issued) {
          email.note = "Status update email sent with certificate link.";
        } else if (becameApproved && isCertificateProof && cert && cert.reason) {
          email.note = "Status update email sent. Certificate link not included: " + certificateBlockReasonText(cert && cert.reason) + ".";
        } else {
          email.note = "Status update email sent with feedback.";
        }
      } catch (emailError) {
        email.note = emailError && emailError.message ? emailError.message : "Email send failed";
        console.warn("assignment_status_email_failed", {
          assignment_id: assignmentId,
          error: emailError && emailError.message ? emailError.message : String(emailError || "unknown"),
        });
      }
    }
    return json(200, { ok: true, item, email });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not update assignment." });
  }
};
