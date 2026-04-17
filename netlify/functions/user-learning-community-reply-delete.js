const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireStudentSession } = require("./_lib/user-auth");
const { hasCourseAccess } = require("./_lib/learning-progress");
const {
  ensureLearningSupportTables,
  getCourseLearningFeatures,
  deleteCommunityReplyByOwner,
  normalizeCourseSlug,
} = require("./_lib/learning-support");

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const courseSlug = normalizeCourseSlug(body.course_slug);
  const replyId = Number(body.reply_id || 0);
  if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });
  if (!(replyId > 0)) return json(400, { ok: false, error: "reply_id is required" });

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

    const result = await deleteCommunityReplyByOwner(pool, {
      reply_id: replyId,
      course_slug: courseSlug,
      account_id: session.account.id,
      author_email: session.account.email,
    });

    return json(200, { ok: true, result });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not delete reply." });
  }
};
