const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureCouponsTables, listCoupons } = require("./_lib/coupons");
const { listLearningCourses } = require("./_lib/learning");
const { canonicalizeCourseSlug } = require("./_lib/course-config");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 220);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();
  try {
    await ensureCouponsTables(pool);
    const items = await listCoupons(pool);
    let courses = [];
    try {
      const rows = await listLearningCourses(pool);
      courses = (Array.isArray(rows) ? rows : [])
        .map(function (row) {
          const slug = canonicalizeCourseSlug(clean(row && row.course_slug, 120));
          const label = clean(row && row.course_title, 220);
          return { slug: slug, label: label || slug };
        })
        .filter(function (item) { return !!item.slug; });
    } catch (_error) {
      courses = [];
    }
    return json(200, { ok: true, items, courses });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load coupons" });
  }
};
