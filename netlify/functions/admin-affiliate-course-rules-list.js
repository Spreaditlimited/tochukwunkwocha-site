const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { listLearningCourses } = require("./_lib/learning");
const { listAffiliateCourseRules, ensureAffiliateTables } = require("./_lib/affiliates");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();
  try {
    await ensureAffiliateTables(pool);
    const rules = await listAffiliateCourseRules(pool);
    const learningCourses = await listLearningCourses(pool).catch(function () {
      return [];
    });
    const courses = (Array.isArray(learningCourses) ? learningCourses : []).map(function (row) {
      return {
        slug: clean(row && row.course_slug, 120).toLowerCase(),
        label: clean(row && row.course_title, 220),
      };
    });
    return json(200, { ok: true, rules, courses });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load affiliate rules" });
  }
};
