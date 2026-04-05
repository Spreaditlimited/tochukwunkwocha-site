const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { listStudentsProgressByCourse } = require("./_lib/learning-progress");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const courseSlug = clean(event.queryStringParameters && event.queryStringParameters.course_slug, 120).toLowerCase() || "prompt-to-profit";
  const search = clean(event.queryStringParameters && event.queryStringParameters.search, 180);
  const batchKey = clean(event.queryStringParameters && event.queryStringParameters.batch_key, 120).toLowerCase() || "all";
  const enrollmentType = clean(event.queryStringParameters && event.queryStringParameters.enrollment_type, 40).toLowerCase() || "all";
  const debugEnabled = process.env.LEARNING_PROGRESS_DEBUG === "1";
  if (debugEnabled) {
    console.log("[admin-learning-progress-list][debug] query", {
      course_slug: courseSlug,
      enrollment_type: enrollmentType,
      batch_key: batchKey,
      search,
    });
  }

  const pool = getPool();
  try {
    const payload = await listStudentsProgressByCourse(pool, {
      course_slug: courseSlug,
      search,
      batch_key: batchKey,
      enrollment_type: enrollmentType,
    });

    return json(200, { ok: true, ...payload });
  } catch (error) {
    console.error("[admin-learning-progress-list] failed", {
      course_slug: courseSlug,
      enrollment_type: enrollmentType,
      batch_key: batchKey,
      search,
      message: error && error.message ? error.message : "Unknown error",
    });
    return json(500, { ok: false, error: error.message || "Could not load learning progress." });
  }
};
