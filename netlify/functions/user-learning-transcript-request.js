const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireStudentSession } = require("./_lib/user-auth");
const { LESSONS_TABLE, MODULES_TABLE, ensureLearningTables } = require("./_lib/learning");
const { listCourseForLearner } = require("./_lib/learning-progress");
const {
  upsertTranscriptAccessRequest,
  canViewTranscript,
  logTranscriptAudit,
  hashValue,
  getClientIp,
  readHeader,
} = require("./_lib/transcript-access");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const pool = getPool();
  try {
    await ensureLearningTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const body = JSON.parse(event.body || "{}");
    const lessonId = Number(body && body.lesson_id);
    const reason = clean(body && body.reason, 4000);
    let courseSlug = clean(body && body.course_slug, 120).toLowerCase();

    if (!courseSlug && Number.isFinite(lessonId) && lessonId > 0) {
      const [rows] = await pool.query(
        `SELECT m.course_slug
         FROM ${LESSONS_TABLE} l
         JOIN ${MODULES_TABLE} m ON m.id = l.module_id
         WHERE l.id = ?
           AND l.is_active = 1
           AND m.is_active = 1
         LIMIT 1`,
        [lessonId]
      );
      if (Array.isArray(rows) && rows.length) {
        courseSlug = clean(rows[0].course_slug, 120).toLowerCase();
      }
    }

    if (!courseSlug) return json(400, { ok: false, error: "course_slug or valid lesson_id is required" });

    const coursePayload = await listCourseForLearner(pool, {
      account_id: session.account.id,
      account_email: session.account.email,
      course_slug: courseSlug,
    });
    if (!coursePayload.ok) {
      return json(403, { ok: false, error: coursePayload.error || "Access denied" });
    }

    const existing = await canViewTranscript(pool, {
      account_id: session.account.id,
      course_slug: courseSlug,
    });
    if (existing.allowed) {
      return json(200, {
        ok: true,
        message: "Transcript access is already approved for this course.",
        transcript_access: { allowed: true, status: "approved" },
      });
    }

    const accessRow = await upsertTranscriptAccessRequest(pool, {
      account_id: session.account.id,
      course_slug: courseSlug,
      request_reason: reason || "Accessibility accommodation requested by student.",
    });

    await logTranscriptAudit(pool, {
      account_id: session.account.id,
      course_slug: courseSlug,
      lesson_id: Number.isFinite(lessonId) && lessonId > 0 ? lessonId : null,
      event_type: "request_submitted",
      status: "pending",
      detail: {
        reason: reason || null,
      },
      ip_hash: hashValue(getClientIp(event)),
      user_agent: readHeader(event, "user-agent"),
    });

    return json(200, {
      ok: true,
      message: "Transcript access request submitted for review.",
      transcript_access: {
        allowed: false,
        status: clean(accessRow && accessRow.status, 32) || "pending",
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not request transcript access." });
  }
};
