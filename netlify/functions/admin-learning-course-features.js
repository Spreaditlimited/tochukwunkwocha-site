const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLearningSupportTables,
  getCourseLearningFeatures,
  saveCourseLearningFeatures,
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
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();
  await ensureLearningSupportTables(pool, { bootstrap: true });

  try {
    if (event.httpMethod === "GET") {
      const courseSlug = normalizeCourseSlug(event.queryStringParameters && event.queryStringParameters.course_slug);
      if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });
      const features = await getCourseLearningFeatures(pool, courseSlug);
      return json(200, { ok: true, features });
    }

    const body = parseBody(event);
    if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });
    const courseSlug = normalizeCourseSlug(body.course_slug);
    if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });

    const features = await saveCourseLearningFeatures(pool, {
      course_slug: courseSlug,
      assignments_enabled: body.assignments_enabled,
      course_community_enabled: body.course_community_enabled,
      tutor_questions_enabled: body.tutor_questions_enabled,
      alumni_participation_mode: body.alumni_participation_mode,
    });

    return json(200, { ok: true, features });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not manage course features." });
  }
};
