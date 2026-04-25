const { json, badMethod } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLearningTables,
  clean,
  slugify,
  ensureModuleById,
  findLearningCourseBySlug,
  MODULES_TABLE,
  COURSE_MODULES_TABLE,
  MODULE_BATCH_DRIPS_TABLE,
  LESSONS_TABLE,
} = require("./_lib/learning");

const LEGACY_IMMEDIATE_DRIP_SENTINEL = "1970-01-01 00:00:00";

async function hasCourseModuleMappingsTable(pool) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?
     LIMIT 1`,
    [COURSE_MODULES_TABLE]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function hasModuleBatchAccessModeColumn(pool) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = 'access_mode'
     LIMIT 1`,
    [MODULE_BATCH_DRIPS_TABLE]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function moduleSlugExists(conn, courseSlug, moduleSlug) {
  const [rows] = await conn.query(
    `SELECT 1
     FROM ${MODULES_TABLE}
     WHERE course_slug = ?
       AND module_slug = ?
     LIMIT 1`,
    [courseSlug, moduleSlug]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function nextUniqueModuleSlug(conn, courseSlug, preferredSlug) {
  const base = slugify(preferredSlug, "module").slice(0, 150) || "module";
  let candidate = base;
  for (let i = 1; i <= 250; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await moduleSlugExists(conn, courseSlug, candidate);
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

  const sourceModuleId = Number(body && body.source_module_id || 0);
  const targetCourseSlug = clean(body && body.target_course_slug, 120).toLowerCase();
  const forceDuplicate = body && body.force_duplicate === true;
  if (!(sourceModuleId > 0)) return json(400, { ok: false, error: "source_module_id is required" });
  if (!targetCourseSlug) return json(400, { ok: false, error: "target_course_slug is required" });

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await ensureLearningTables(pool);
    const hasCourseModuleMappings = await hasCourseModuleMappingsTable(pool).catch(function () { return false; });
    const sourceModule = await ensureModuleById(pool, sourceModuleId);
    if (!sourceModule) return json(404, { ok: false, error: "Source module not found." });

    const targetCourse = await findLearningCourseBySlug(pool, targetCourseSlug);
    if (!targetCourse) return json(400, { ok: false, error: "Target course does not exist." });

    if (hasCourseModuleMappings && !forceDuplicate) {
      const [mappingRows] = await pool.query(
        `SELECT id
         FROM ${COURSE_MODULES_TABLE}
         WHERE course_slug = ?
           AND module_id = ?
         LIMIT 1`,
        [targetCourseSlug, sourceModuleId]
      );
      if (Array.isArray(mappingRows) && mappingRows.length) {
        return json(409, { ok: false, error: "This module is already linked to the selected course." });
      }

      const now = nowSql();
      await pool.query(
        `INSERT INTO ${COURSE_MODULES_TABLE}
          (course_slug, module_id, sort_order, is_active, drip_enabled, drip_at, drip_batch_key, drip_offset_seconds, drip_notified_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          targetCourseSlug,
          sourceModuleId,
          Number.isFinite(Number(sourceModule.sort_order)) ? Number(sourceModule.sort_order) : 0,
          Number(sourceModule.is_active || 0) === 0 ? 0 : 1,
          Number(sourceModule.drip_enabled || 0) === 1 ? 1 : 0,
          sourceModule.drip_at || null,
          clean(sourceModule.drip_batch_key, 64) || null,
          Number.isFinite(Number(sourceModule.drip_offset_seconds)) ? Number(sourceModule.drip_offset_seconds) : null,
          sourceModule.drip_notified_at || null,
          now,
          now,
        ]
      );

      const [linkedRows] = await pool.query(
        `SELECT
           m.id,
           cm.course_slug,
           m.module_slug,
           m.module_title,
           m.module_description,
           cm.sort_order,
           cm.is_active,
           cm.drip_enabled,
           DATE_FORMAT(cm.drip_at, '%Y-%m-%d %H:%i:%s') AS drip_at,
           cm.drip_batch_key,
           cm.drip_offset_seconds,
           DATE_FORMAT(cm.drip_notified_at, '%Y-%m-%d %H:%i:%s') AS drip_notified_at,
           m.created_at,
           m.updated_at
         FROM ${COURSE_MODULES_TABLE} cm
         JOIN ${MODULES_TABLE} m ON m.id = cm.module_id
         WHERE cm.course_slug = ?
           AND cm.module_id = ?
         LIMIT 1`,
        [targetCourseSlug, sourceModuleId]
      );

      return json(200, {
        ok: true,
        module: linkedRows && linkedRows[0] ? linkedRows[0] : null,
        copied_lessons: 0,
        copied_drip_schedules: 0,
        linked_existing_module: true,
      });
    }

    const [existingRows] = await pool.query(
      `SELECT id
       FROM ${MODULES_TABLE}
       WHERE course_slug = ?
         AND LOWER(TRIM(module_title)) = LOWER(TRIM(?))
       LIMIT 1`,
      [targetCourseSlug, clean(sourceModule.module_title, 220)]
    );
    if (Array.isArray(existingRows) && existingRows.length) {
      return json(409, { ok: false, error: "A module with this title already exists in the selected course." });
    }

    const [sourceLessonRows] = await pool.query(
      `SELECT lesson_slug, lesson_title, lesson_order, video_asset_id, lesson_notes, captions_vtt_url, captions_languages_json, transcript_text, audio_description_text, sign_language_video_url, accessibility_status, is_active
       FROM ${LESSONS_TABLE}
       WHERE module_id = ?
       ORDER BY lesson_order ASC, id ASC`,
      [sourceModuleId]
    );
    const hasBatchAccessMode = await hasModuleBatchAccessModeColumn(pool).catch(function () { return false; });
    const accessModeSelect = hasBatchAccessMode
      ? "access_mode"
      : `CASE
           WHEN drip_at <= '${LEGACY_IMMEDIATE_DRIP_SENTINEL}' THEN 'immediate'
           ELSE 'drip'
         END AS access_mode`;
    const [sourceDripRows] = await pool.query(
      `SELECT batch_key, ${accessModeSelect}, drip_at
       FROM ${MODULE_BATCH_DRIPS_TABLE}
       WHERE module_id = ?
       ORDER BY batch_key ASC`,
      [sourceModuleId]
    );

    await conn.beginTransaction();
    const nextSlug = await nextUniqueModuleSlug(
      conn,
      targetCourseSlug,
      clean(sourceModule.module_slug, 160) || clean(sourceModule.module_title, 220)
    );
    const now = nowSql();
    const [insertModule] = await conn.query(
      `INSERT INTO ${MODULES_TABLE}
        (course_slug, module_slug, module_title, module_description, sort_order, is_active, drip_enabled, drip_at, drip_batch_key, drip_offset_seconds, drip_notified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        targetCourseSlug,
        nextSlug,
        clean(sourceModule.module_title, 220),
        clean(sourceModule.module_description, 4000) || null,
        Number.isFinite(Number(sourceModule.sort_order)) ? Number(sourceModule.sort_order) : 0,
        Number(sourceModule.is_active || 0) === 0 ? 0 : 1,
        Number(sourceModule.drip_enabled || 0) === 1 ? 1 : 0,
        sourceModule.drip_at || null,
        clean(sourceModule.drip_batch_key, 64) || null,
        Number.isFinite(Number(sourceModule.drip_offset_seconds)) ? Number(sourceModule.drip_offset_seconds) : null,
        now,
        now,
      ]
    );
    const newModuleId = Number(insertModule && insertModule.insertId || 0);
    if (!(newModuleId > 0)) throw new Error("Could not clone module.");

    for (const lesson of (Array.isArray(sourceLessonRows) ? sourceLessonRows : [])) {
      // Source data already satisfies unique slug within module.
      // New module starts empty, so direct insert is safe.
      // eslint-disable-next-line no-await-in-loop
      await conn.query(
        `INSERT INTO ${LESSONS_TABLE}
          (module_id, lesson_slug, lesson_title, lesson_order, video_asset_id, lesson_notes, captions_vtt_url, captions_languages_json, transcript_text, audio_description_text, sign_language_video_url, accessibility_status, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newModuleId,
          clean(lesson.lesson_slug, 160) || slugify(clean(lesson.lesson_title, 220), "lesson"),
          clean(lesson.lesson_title, 220),
          Number.isFinite(Number(lesson.lesson_order)) ? Number(lesson.lesson_order) : 0,
          Number(lesson.video_asset_id || 0) > 0 ? Number(lesson.video_asset_id) : null,
          clean(lesson.lesson_notes, 4000) || null,
          clean(lesson.captions_vtt_url, 1200) || null,
          clean(lesson.captions_languages_json, 4000) || null,
          clean(lesson.transcript_text, 120000) || null,
          clean(lesson.audio_description_text, 120000) || null,
          clean(lesson.sign_language_video_url, 1200) || null,
          (function () {
            const raw = clean(lesson.accessibility_status, 32).toLowerCase();
            if (raw === "ready" || raw === "in_progress" || raw === "blocked") return raw;
            return "draft";
          })(),
          Number(lesson.is_active || 0) === 0 ? 0 : 1,
          now,
          now,
        ]
      );
    }

    for (const drip of (Array.isArray(sourceDripRows) ? sourceDripRows : [])) {
      // eslint-disable-next-line no-await-in-loop
      if (hasBatchAccessMode) {
        await conn.query(
          `INSERT INTO ${MODULE_BATCH_DRIPS_TABLE}
            (module_id, batch_key, access_mode, drip_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            newModuleId,
            clean(drip.batch_key, 64).toLowerCase(),
            clean(drip.access_mode, 24).toLowerCase() === "immediate" ? "immediate" : "drip",
            drip.drip_at,
            now,
            now,
          ]
        );
      } else {
        await conn.query(
          `INSERT INTO ${MODULE_BATCH_DRIPS_TABLE}
            (module_id, batch_key, drip_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            newModuleId,
            clean(drip.batch_key, 64).toLowerCase(),
            drip.drip_at,
            now,
            now,
          ]
        );
      }
    }

    await conn.commit();

    const [moduleRows] = await pool.query(
      `SELECT id, course_slug, module_slug, module_title, module_description, sort_order, is_active, drip_enabled,
              DATE_FORMAT(drip_at, '%Y-%m-%d %H:%i:%s') AS drip_at,
              drip_batch_key, drip_offset_seconds,
              DATE_FORMAT(drip_notified_at, '%Y-%m-%d %H:%i:%s') AS drip_notified_at,
              created_at, updated_at
       FROM ${MODULES_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [newModuleId]
    );

    return json(200, {
      ok: true,
      module: moduleRows && moduleRows[0] ? moduleRows[0] : null,
      copied_lessons: Array.isArray(sourceLessonRows) ? sourceLessonRows.length : 0,
      copied_drip_schedules: Array.isArray(sourceDripRows) ? sourceDripRows.length : 0,
    });
  } catch (error) {
    try {
      await conn.rollback();
    } catch (_error) {}
    return json(500, { ok: false, error: error.message || "Could not clone module." });
  } finally {
    conn.release();
  }
};
