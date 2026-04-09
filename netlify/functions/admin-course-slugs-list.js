const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { listLearningCourses } = require("./_lib/learning");
const { listCourseConfigs, canonicalizeCourseSlug } = require("./_lib/course-config");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 160);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();

  try {
    let courses = [];
    try {
      courses = await listLearningCourses(pool);
    } catch (_error) {
      courses = [];
    }
    const dbItems = (Array.isArray(courses) ? courses : [])
      .map(function (course) {
        const slug = canonicalizeCourseSlug(clean(course && course.course_slug, 120));
        const label = clean(course && course.course_title, 220);
        return { slug: slug, label: label || slug };
      })
      .filter(function (item) { return !!item.slug; });

    const configuredItems = (listCourseConfigs() || [])
      .map(function (cfg) {
        const slug = canonicalizeCourseSlug(clean(cfg && cfg.slug, 120));
        const label = clean(cfg && cfg.name, 220);
        return { slug: slug, label: label || slug };
      })
      .filter(function (item) { return !!item.slug; });

    const merged = new Map();
    configuredItems.forEach(function (item) {
      merged.set(item.slug, item);
    });
    dbItems.forEach(function (item) {
      merged.set(item.slug, item);
    });

    const items = Array.from(merged.values()).sort(function (a, b) {
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
      });

    return json(200, { ok: true, items });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not list courses." });
  }
};
