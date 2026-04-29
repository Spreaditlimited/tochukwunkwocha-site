const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireStudentSession } = require("./_lib/user-auth");
const { hasCourseAccess } = require("./_lib/learning-progress");
const {
  ensureLearningSupportTables,
  getCourseLearningFeatures,
  listCommunityThreads,
  normalizeCourseSlug,
} = require("./_lib/learning-support");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 400);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const courseSlug = normalizeCourseSlug(event.queryStringParameters && event.queryStringParameters.course_slug);
  if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });

  const status = clean(event.queryStringParameters && event.queryStringParameters.status, 24).toLowerCase() || "all";
  const search = clean(event.queryStringParameters && event.queryStringParameters.search, 220);

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

    const items = await listCommunityThreads(pool, {
      course_slug: courseSlug,
      status,
      search,
      limit: 60,
    });

    return json(200, {
      ok: true,
      features,
      items,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load course community." });
  }
};
