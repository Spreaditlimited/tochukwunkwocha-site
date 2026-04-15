const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireStudentSession } = require("./_lib/user-auth");
const { listCourseForLearner } = require("./_lib/learning-progress");
const { LESSONS_TABLE, MODULES_TABLE, ensureLearningTables } = require("./_lib/learning");
const {
  canViewTranscript,
  logTranscriptAudit,
  buildTranscriptWatermark,
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
    if (!Number.isFinite(lessonId) || lessonId <= 0) {
      return json(400, { ok: false, error: "lesson_id is required" });
    }

    const [lessonRows] = await pool.query(
      `SELECT l.id AS lesson_id,
              l.lesson_title,
              l.transcript_text,
              m.course_slug
       FROM ${LESSONS_TABLE} l
       JOIN ${MODULES_TABLE} m ON m.id = l.module_id
       WHERE l.id = ?
         AND l.is_active = 1
         AND m.is_active = 1
       LIMIT 1`,
      [lessonId]
    );
    if (!Array.isArray(lessonRows) || !lessonRows.length) {
      return json(404, { ok: false, error: "Lesson not found" });
    }
    const lesson = lessonRows[0];
    const courseSlug = clean(lesson.course_slug, 120).toLowerCase();
    const transcriptRaw = clean(lesson.transcript_text, 120000);
    if (!transcriptRaw) {
      return json(404, { ok: false, error: "Transcript is not available for this lesson yet." });
    }

    const coursePayload = await listCourseForLearner(pool, {
      account_id: session.account.id,
      account_email: session.account.email,
      course_slug: courseSlug,
    });
    if (!coursePayload.ok) {
      return json(403, { ok: false, error: coursePayload.error || "Access denied" });
    }

    const isLessonVisible = (coursePayload.course.modules || []).some(function (moduleRow) {
      return (moduleRow.lessons || []).some(function (lessonRow) {
        return Number(lessonRow.id) === lessonId;
      });
    });
    if (!isLessonVisible) {
      return json(403, { ok: false, error: "This lesson is not yet available for your access group." });
    }

    const access = await canViewTranscript(pool, {
      account_id: session.account.id,
      course_slug: courseSlug,
    });
    if (!access.allowed) {
      await logTranscriptAudit(pool, {
        account_id: session.account.id,
        course_slug: courseSlug,
        lesson_id: lessonId,
        event_type: "view_attempt",
        status: "denied",
        detail: {
          reason: access.reason || "not_approved",
          transcript_status: access.status || "none",
        },
        ip_hash: hashValue(getClientIp(event)),
        user_agent: readHeader(event, "user-agent"),
      });
      return json(403, {
        ok: false,
        error: "Transcript access requires approved accessibility accommodation.",
        transcript_access: {
          allowed: false,
          status: clean(access.status, 32) || "none",
          reason: clean(access.reason, 64) || "not_approved",
        },
      });
    }

    const watermark = buildTranscriptWatermark({
      account_id: session.account.id,
      email: session.account.email,
      lesson_id: lessonId,
    });
    const finalTranscript = transcriptRaw + watermark;

    await logTranscriptAudit(pool, {
      account_id: session.account.id,
      course_slug: courseSlug,
      lesson_id: lessonId,
      event_type: "view_granted",
      status: "approved",
      detail: {
        lesson_title: clean(lesson.lesson_title, 220),
        length: finalTranscript.length,
      },
      ip_hash: hashValue(getClientIp(event)),
      user_agent: readHeader(event, "user-agent"),
    });

    return json(200, {
      ok: true,
      lesson_id: lessonId,
      course_slug: courseSlug,
      transcript_text: finalTranscript,
      transcript_access: {
        allowed: true,
        status: "approved",
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load transcript." });
  }
};
