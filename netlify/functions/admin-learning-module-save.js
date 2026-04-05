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
    const dripEnabled = body.drip_enabled === true || Number(body.drip_enabled) === 1 ? 1 : 0;
    const dripAtRaw = clean(body.drip_at, 64);
    const dripAt = dripAtRaw ? (
      /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(dripAtRaw)
        ? dripAtRaw.replace("T", " ") + (dripAtRaw.length === 16 ? ":00" : "")
        : null
    ) : null;
    const applyToTitleGroup = body.apply_to_title_group === true;

    if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });
    if (!moduleTitle) return json(400, { ok: false, error: "module_title is required" });
    if (dripEnabled && !dripAt) return json(400, { ok: false, error: "Valid drip_at is required when drip is enabled" });

    if (Number.isFinite(id) && id > 0) {
      const existing = await ensureModuleById(pool, id);
      if (!existing) return json(404, { ok: false, error: "Module not found" });

      const nextSlug = slugify(clean(body.module_slug, 160) || existing.module_slug || moduleTitle, "module");
      await pool.query(
        `UPDATE ${MODULES_TABLE}
         SET course_slug = ?, module_slug = ?, module_title = ?, module_description = ?, sort_order = ?, is_active = ?, drip_enabled = ?, drip_at = ?, updated_at = ?
         WHERE id = ?
         LIMIT 1`,
        [courseSlug, nextSlug, moduleTitle, moduleDescription, sortOrder, isActive, dripEnabled, dripEnabled ? dripAt : null, nowSql(), id]
      );

      if (applyToTitleGroup) {
        await pool.query(
          `UPDATE ${MODULES_TABLE}
           SET is_active = ?, drip_enabled = ?, drip_at = ?, updated_at = ?
           WHERE course_slug = ?
             AND LOWER(TRIM(module_title)) = LOWER(TRIM(?))`,
          [isActive, dripEnabled, dripEnabled ? dripAt : null, nowSql(), courseSlug, moduleTitle]
        );
      }

      const [rows] = await pool.query(
        `SELECT id, course_slug, module_slug, module_title, module_description, sort_order, is_active, drip_enabled,
                DATE_FORMAT(drip_at, '%Y-%m-%d %H:%i:%s') AS drip_at,
                DATE_FORMAT(drip_notified_at, '%Y-%m-%d %H:%i:%s') AS drip_notified_at,
                created_at, updated_at
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

    if (module && module.id) {
      await pool.query(
        `UPDATE ${MODULES_TABLE}
         SET drip_enabled = ?, drip_at = ?, updated_at = ?
         WHERE id = ?
         LIMIT 1`,
        [dripEnabled, dripEnabled ? dripAt : null, nowSql(), Number(module.id)]
      );
    }

    const [createdRows] = await pool.query(
      `SELECT id, course_slug, module_slug, module_title, module_description, sort_order, is_active, drip_enabled,
              DATE_FORMAT(drip_at, '%Y-%m-%d %H:%i:%s') AS drip_at,
              DATE_FORMAT(drip_notified_at, '%Y-%m-%d %H:%i:%s') AS drip_notified_at,
              created_at, updated_at
       FROM ${MODULES_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [Number(module && module.id || 0)]
    );

    return json(200, { ok: true, module: createdRows && createdRows[0] ? createdRows[0] : module });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not save module." });
  }
};
