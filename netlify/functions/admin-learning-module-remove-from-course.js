const { json, badMethod } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLearningTables,
  clean,
  slugify,
  MODULES_TABLE,
} = require("./_lib/learning");

const UNASSIGNED_COURSE_SLUG = "__unassigned_modules__";

async function moduleSlugExists(conn, courseSlug, moduleSlug, excludeModuleId) {
  const [rows] = await conn.query(
    `SELECT 1
     FROM ${MODULES_TABLE}
     WHERE course_slug = ?
       AND module_slug = ?
       AND id <> ?
     LIMIT 1`,
    [courseSlug, moduleSlug, excludeModuleId]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function nextUniqueModuleSlug(conn, courseSlug, preferredSlug, moduleId) {
  const base = slugify(preferredSlug, "module").slice(0, 150) || "module";
  let candidate = base;
  for (let i = 1; i <= 250; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await moduleSlugExists(conn, courseSlug, candidate, moduleId);
    if (!exists) return candidate;
    candidate = `${base.slice(0, 144)}-${i + 1}`;
  }
  return `${base.slice(0, 136)}-${Date.now()}`;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const moduleId = Number(body && body.module_id || 0);
  const selectedCourseSlug = clean(body && body.course_slug, 120).toLowerCase();
  if (!(moduleId > 0)) return json(400, { ok: false, error: "module_id is required" });
  if (!selectedCourseSlug) return json(400, { ok: false, error: "course_slug is required" });

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await ensureLearningTables(pool);

    const [rows] = await conn.query(
      `SELECT id, course_slug, module_slug, module_title
       FROM ${MODULES_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [moduleId]
    );
    const moduleRow = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!moduleRow) return json(404, { ok: false, error: "Module not found." });

    const currentCourseSlug = clean(moduleRow.course_slug, 120).toLowerCase();
    if (currentCourseSlug !== selectedCourseSlug) {
      return json(409, { ok: false, error: "Module is no longer mapped to the selected course." });
    }

    const nextSlug = await nextUniqueModuleSlug(
      conn,
      UNASSIGNED_COURSE_SLUG,
      clean(moduleRow.module_slug, 160) || clean(moduleRow.module_title, 220),
      moduleId
    );
    await conn.query(
      `UPDATE ${MODULES_TABLE}
       SET course_slug = ?, module_slug = ?, is_active = 0, updated_at = ?
       WHERE id = ?
       LIMIT 1`,
      [UNASSIGNED_COURSE_SLUG, nextSlug, nowSql(), moduleId]
    );

    return json(200, {
      ok: true,
      module_id: moduleId,
      removed_from_course: selectedCourseSlug,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not detach module from course." });
  } finally {
    conn.release();
  }
};
