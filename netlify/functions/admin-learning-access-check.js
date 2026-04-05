const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { getStudentCourseAccessAudit } = require("./_lib/learning-progress");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const email = clean(event.queryStringParameters && event.queryStringParameters.email, 220).toLowerCase();
  const courseSlug = clean(event.queryStringParameters && event.queryStringParameters.course_slug, 120).toLowerCase() || "prompt-to-profit";
  if (!email) return json(400, { ok: false, error: "email is required" });

  const pool = getPool();
  try {
    const audit = await getStudentCourseAccessAudit(pool, {
      account_email: email,
      course_slug: courseSlug,
    });
    return json(200, { ok: true, audit });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not check access." });
  }
};
