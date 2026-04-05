const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { getStudentCourseProgressDetail } = require("./_lib/learning-progress");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const courseSlug = clean(event.queryStringParameters && event.queryStringParameters.course_slug, 120).toLowerCase();
  const accountId = Number(event.queryStringParameters && event.queryStringParameters.account_id || 0);
  const email = clean(event.queryStringParameters && event.queryStringParameters.email, 220).toLowerCase();
  const debugEnabled = process.env.LEARNING_PROGRESS_DEBUG === "1";
  if (debugEnabled) {
    console.log("[admin-learning-progress-detail][debug] query", {
      course_slug: courseSlug,
      account_id: Number.isFinite(accountId) && accountId > 0 ? accountId : null,
      email: email || null,
    });
  }

  if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });
  if ((!Number.isFinite(accountId) || accountId <= 0) && !email) {
    return json(400, { ok: false, error: "account_id or email is required" });
  }

  const pool = getPool();
  try {
    const payload = await getStudentCourseProgressDetail(pool, {
      course_slug: courseSlug,
      account_id: Number.isFinite(accountId) && accountId > 0 ? accountId : null,
      email,
    });
    const resolvedBranch = payload && payload._resolution_branch ? payload._resolution_branch : null;
    if (payload && payload._resolution_branch) delete payload._resolution_branch;
    if (debugEnabled) {
      console.log("[admin-learning-progress-detail][debug] resolved", {
        branch: resolvedBranch || "unknown",
        status: 200,
      });
    }

    return json(200, { ok: true, ...payload });
  } catch (error) {
    const isNotFound = error && error.code === "NOT_FOUND";
    console.error("[admin-learning-progress-detail] failed", {
      course_slug: courseSlug,
      account_id: Number.isFinite(accountId) && accountId > 0 ? accountId : null,
      email: email || null,
      code: error && error.code ? error.code : null,
      reason: error && error.reason ? error.reason : null,
      message: error && error.message ? error.message : "Unknown error",
    });
    return json(isNotFound ? 404 : 500, {
      ok: false,
      error: error && error.message ? error.message : "Could not load student learning detail.",
    });
  }
};
