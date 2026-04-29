const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureLearningAccessOverridesTable } = require("./_lib/learning-access-overrides");
const { MODULES_TABLE, LESSONS_TABLE, ensureLearningTables } = require("./_lib/learning");
const { LESSON_PROGRESS_TABLE, ensureLearningProgressTables } = require("./_lib/learning-progress");
const {
  ASSIGNMENTS_TABLE,
  ensureLearningSupportTables,
  getCourseLearningFeatures,
  createStudentAssignment,
  normalizeCourseSlug,
  normalizeUrl,
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

async function hasIndividualAccessForCourse(pool, input) {
  const email = String(input && input.email || "").toLowerCase();
  const courseSlug = normalizeCourseSlug(input && input.courseSlug);
  if (!email || !courseSlug) return false;

  const [orderRows] = await pool.query(
    `SELECT id
     FROM course_orders
     WHERE LOWER(email) COLLATE utf8mb4_general_ci = ?
       AND course_slug = ?
       AND status = 'paid'
     LIMIT 1`,
    [email, courseSlug]
  );
  if (Array.isArray(orderRows) && orderRows.length) return true;

  const [manualRows] = await pool.query(
    `SELECT id
     FROM course_manual_payments
     WHERE LOWER(email) COLLATE utf8mb4_general_ci = ?
       AND course_slug = ?
       AND status = 'approved'
     LIMIT 1`,
    [email, courseSlug]
  );
  if (Array.isArray(manualRows) && manualRows.length) return true;

  await ensureLearningAccessOverridesTable(pool).catch(function () {
    return null;
  });
  const [overrideRows] = await pool.query(
    `SELECT id
     FROM tochukwu_learning_access_overrides
     WHERE LOWER(email) COLLATE utf8mb4_general_ci = ?
       AND course_slug = ?
       AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [email, courseSlug]
  );
  return Array.isArray(overrideRows) && overrideRows.length > 0;
}

async function loadLatestProofStatus(pool, input) {
  const accountId = Number(input && input.accountId || 0);
  const email = String(input && input.email || "").toLowerCase();
  const courseSlug = normalizeCourseSlug(input && input.courseSlug);
  if (!(accountId > 0) || !email || !courseSlug) return "missing";

  const [rows] = await pool.query(
    `SELECT status
     FROM ${ASSIGNMENTS_TABLE}
     WHERE account_id = ?
       AND LOWER(student_email) COLLATE utf8mb4_general_ci = ?
       AND course_slug = ?
       AND submission_kind = 'link'
       AND submission_text = ?
     ORDER BY id DESC
     LIMIT 1`,
    [accountId, email, courseSlug, CERTIFICATE_PROOF_MARKER]
  );
  const status = clean(rows && rows[0] && rows[0].status, 32).toLowerCase();
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "submitted") return "pending";
  if (status === "pending") return "pending";
  return "missing";
}

async function hasCompletedCourse(pool, input) {
  const accountId = Number(input && input.accountId || 0);
  const courseSlug = normalizeCourseSlug(input && input.courseSlug);
  if (!(accountId > 0) || !courseSlug) return false;

  await ensureLearningTables(pool);
  await ensureLearningProgressTables(pool);

  const [totalRows] = await pool.query(
    `SELECT COUNT(*) AS total_lessons
     FROM ${LESSONS_TABLE} l
     JOIN ${MODULES_TABLE} m ON m.id = l.module_id
     WHERE m.is_active = 1
       AND l.is_active = 1
       AND m.course_slug = ?
     LIMIT 1`,
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
       AND m.course_slug = ?
     LIMIT 1`,
    [accountId, courseSlug]
  );
  const completedLessons = Number(doneRows && doneRows[0] && doneRows[0].completed_lessons || 0);
  return completedLessons >= totalLessons;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const courseSlug = normalizeCourseSlug(body.course_slug || body.courseSlug);
  const websiteUrl = normalizeUrl(body.website_url || body.websiteUrl, 1500);
  if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });
  if (!websiteUrl) return json(400, { ok: false, error: "Valid website URL is required" });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureLearningSupportTables(pool, { bootstrap: true });
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });
    if (session.account && session.account.certificateNameNeedsConfirmation === true) {
      return json(400, {
        ok: false,
        error: "Confirm your profile name in Dashboard Profile before submitting certificate proof.",
      });
    }

    const email = String(session.account.email || "").toLowerCase();
    const hasAccess = await hasIndividualAccessForCourse(pool, { email, courseSlug });
    if (!hasAccess) return json(403, { ok: false, error: "You do not have individual access to this course." });

    const features = await getCourseLearningFeatures(pool, courseSlug).catch(function () {
      return null;
    });

    if (!features || features.certificate_proof_required !== true) {
      return json(400, { ok: false, error: "Certificate proof is not required for this course." });
    }
    const completedCourse = await hasCompletedCourse(pool, {
      accountId: Number(session.account.id || 0),
      courseSlug,
    });
    if (!completedCourse) {
      return json(400, {
        ok: false,
        error: "Complete all lessons before submitting certificate proof.",
      });
    }

    const latestProofStatus = await loadLatestProofStatus(pool, {
      accountId: Number(session.account.id || 0),
      email,
      courseSlug,
    });
    if (latestProofStatus === "approved") {
      return json(400, {
        ok: false,
        error: "Your certificate proof is already approved and cannot be resubmitted.",
      });
    }
    if (latestProofStatus === "pending") {
      return json(400, {
        ok: false,
        error: "Your submitted proof is pending admin review.",
      });
    }

    const item = await createStudentAssignment(pool, {
      course_slug: courseSlug,
      account_id: Number(session.account.id || 0),
      student_email: email,
      student_name: clean(session.account.fullName, 180),
      submission_kind: "link",
      submission_text: CERTIFICATE_PROOF_MARKER,
      submission_link: websiteUrl,
    });

    return json(200, {
      ok: true,
      proof: {
        status: clean(item && item.status, 32).toLowerCase() || "submitted",
        submitted_at: item && item.created_at ? new Date(item.created_at).toISOString() : new Date().toISOString(),
        website_url: clean(item && item.submission_link, 1500) || websiteUrl,
      },
      course: {
        course_slug: courseSlug,
        certificate_proof_required: !!(features && features.certificate_proof_required),
        certificate_proof_type: clean(features && features.certificate_proof_type, 24) || "website_link",
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not submit certificate proof." });
  }
};
