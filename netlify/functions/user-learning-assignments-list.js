const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireStudentSession } = require("./_lib/user-auth");
const { hasCourseAccess } = require("./_lib/learning-progress");
const {
  ensureLearningSupportTables,
  getCourseLearningFeatures,
  listStudentAssignments,
  normalizeCourseSlug,
} = require("./_lib/learning-support");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const courseSlug = normalizeCourseSlug(event.queryStringParameters && event.queryStringParameters.course_slug);
  if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });

  const pool = getPool();
  try {
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    await ensureLearningSupportTables(pool);
    const access = await hasCourseAccess(pool, session.account.email, courseSlug, session.account.id);
    if (!access) return json(403, { ok: false, error: "You do not currently have access to this course." });

    const features = await getCourseLearningFeatures(pool, courseSlug);
    const items = await listStudentAssignments(pool, {
      course_slug: courseSlug,
      account_id: session.account.id,
      student_email: session.account.email,
      limit: 30,
    });

    return json(200, {
      ok: true,
      features,
      items,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load assignments." });
  }
};
