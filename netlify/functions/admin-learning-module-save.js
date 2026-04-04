const { json, badMethod } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLearningTables,
  clean,
  slugify,
  findOrCreateModule,
  ensureModuleById,
  MODULES_TABLE,
} = require("./_lib/learning");

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

  const pool = getPool();
  try {
    await ensureLearningTables(pool);

    const id = Number(body.id || 0);
    const courseSlug = clean(body.course_slug, 120).toLowerCase();
    const moduleTitle = clean(body.module_title, 220);
    const moduleDescription = clean(body.module_description, 4000) || null;
    const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
    const isActive = body.is_active === false || Number(body.is_active) === 0 ? 0 : 1;

    if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });
    if (!moduleTitle) return json(400, { ok: false, error: "module_title is required" });

    if (Number.isFinite(id) && id > 0) {
      const existing = await ensureModuleById(pool, id);
      if (!existing) return json(404, { ok: false, error: "Module not found" });

      const nextSlug = slugify(clean(body.module_slug, 160) || existing.module_slug || moduleTitle, "module");
      await pool.query(
        `UPDATE ${MODULES_TABLE}
         SET course_slug = ?, module_slug = ?, module_title = ?, module_description = ?, sort_order = ?, is_active = ?, updated_at = ?
         WHERE id = ?
         LIMIT 1`,
        [courseSlug, nextSlug, moduleTitle, moduleDescription, sortOrder, isActive, nowSql(), id]
      );

      const [rows] = await pool.query(
        `SELECT id, course_slug, module_slug, module_title, module_description, sort_order, is_active, created_at, updated_at
         FROM ${MODULES_TABLE}
         WHERE id = ?
         LIMIT 1`,
        [id]
      );
      return json(200, { ok: true, module: rows && rows[0] ? rows[0] : null });
    }

    const module = await findOrCreateModule(pool, {
      course_slug: courseSlug,
      module_title: moduleTitle,
      module_description: moduleDescription,
      sort_order: sortOrder,
      is_active: isActive,
    });

    return json(200, { ok: true, module });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not save module." });
  }
};
