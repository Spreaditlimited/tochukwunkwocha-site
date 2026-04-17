const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireStudentSession } = require("./_lib/user-auth");
const { hasCourseAccess } = require("./_lib/learning-progress");
const {
  ensureLearningSupportTables,
  getCourseLearningFeatures,
  listCommunityReplies,
  normalizeCourseSlug,
} = require("./_lib/learning-support");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const courseSlug = normalizeCourseSlug(event.queryStringParameters && event.queryStringParameters.course_slug);
  const threadId = Number(event.queryStringParameters && event.queryStringParameters.thread_id || 0);
  if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });
  if (!(threadId > 0)) return json(400, { ok: false, error: "thread_id is required" });

  const pool = getPool();
  try {
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    await ensureLearningSupportTables(pool, { bootstrap: true });
    const access = await hasCourseAccess(pool, session.account.email, courseSlug);
    if (!access) return json(403, { ok: false, error: "You do not currently have access to this course." });

    const features = await getCourseLearningFeatures(pool, courseSlug);
    if (!features.course_community_enabled) {
      return json(403, { ok: false, error: "Course community is currently disabled for this course." });
    }

    const items = await listCommunityReplies(pool, {
      course_slug: courseSlug,
      thread_id: threadId,
      limit: 120,
    });

    return json(200, { ok: true, items });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load replies." });
  }
};
