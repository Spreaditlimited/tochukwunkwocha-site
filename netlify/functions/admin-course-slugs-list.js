const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureLearningTables, listLearningCourses } = require("./_lib/learning");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 160);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();

  try {
    await ensureLearningTables(pool);
    const courses = await listLearningCourses(pool);
    const items = (Array.isArray(courses) ? courses : [])
      .map(function (course) {
        const slug = clean(course && course.course_slug, 120).toLowerCase();
        const label = clean(course && course.course_title, 220);
        return { slug: slug, label: label || slug };
      })
      .filter(function (item) { return !!item.slug; })
      .sort(function (a, b) {
        return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
      });

    return json(200, { ok: true, items });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not list courses." });
  }
};
