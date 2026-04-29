const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireStudentSession } = require("./_lib/user-auth");
const { hasCourseAccess } = require("./_lib/learning-progress");
const { LESSONS_TABLE, MODULES_TABLE, COURSE_MODULES_TABLE } = require("./_lib/learning");
const {
  ensureLearningSupportTables,
  getCourseLearningFeatures,
  createCommunityThread,
  normalizeCourseSlug,
  normalizeCommunityQuestionType,
} = require("./_lib/learning-support");

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

async function validateLessonInCourse(pool, lessonId, courseSlug) {
  const id = Number(lessonId || 0);
  if (!(id > 0)) return { lesson_id: null, module_id: null };
  const [rows] = await pool.query(
    `SELECT l.id AS lesson_id, l.module_id
     FROM ${LESSONS_TABLE} l
     JOIN ${MODULES_TABLE} m ON m.id = l.module_id
     LEFT JOIN ${COURSE_MODULES_TABLE} cm
       ON cm.module_id = m.id
      AND cm.course_slug = ?
      AND cm.is_active = 1
     WHERE l.id = ?
       AND l.is_active = 1
       AND (
         m.course_slug = ?
         OR cm.id IS NOT NULL
       )
     LIMIT 1`,
    [courseSlug, id, courseSlug]
  );
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Selected lesson is invalid for this course.");
  }
  return {
    lesson_id: Number(rows[0].lesson_id || 0),
    module_id: Number(rows[0].module_id || 0),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const courseSlug = normalizeCourseSlug(body.course_slug);
  if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });

  const title = clean(body.title, 220);
  const text = clean(body.body, 20000);

  const pool = getPool();
  try {
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    await ensureLearningSupportTables(pool, { bootstrap: true });
    const access = await hasCourseAccess(pool, session.account.email, courseSlug, session.account.id);
    if (!access) return json(403, { ok: false, error: "You do not currently have access to this course." });

    const features = await getCourseLearningFeatures(pool, courseSlug);
    if (!features.course_community_enabled) {
      return json(403, { ok: false, error: "Course community is currently disabled for this course." });
    }

    const lesson = await validateLessonInCourse(pool, Number(body.lesson_id || 0), courseSlug);
    const questionType = normalizeCommunityQuestionType(body.question_type, !!features.tutor_questions_enabled);

    const item = await createCommunityThread(pool, {
      course_slug: courseSlug,
      account_id: session.account.id,
      author_email: session.account.email,
      author_name: session.account.fullName,
      lesson_id: lesson.lesson_id,
      module_id: lesson.module_id,
      question_type: questionType,
      title,
      body: text,
    });

    return json(200, { ok: true, item });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not create thread." });
  }
};
