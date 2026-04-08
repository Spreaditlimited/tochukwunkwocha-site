const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLearningTables,
  listLearningCourses,
  VIDEO_ASSETS_TABLE,
  MODULES_TABLE,
  MODULE_BATCH_DRIPS_TABLE,
  LESSONS_TABLE,
} = require("./_lib/learning");
const { ensureCourseBatchesTable } = require("./_lib/batch-store");

let hasDripBatchKeyColumnCached = null;
let hasDripOffsetSecondsColumnCached = null;

async function hasModuleColumn(pool, columnName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [MODULES_TABLE, String(columnName || "")]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function hasDripBatchKeyColumn(pool) {
  if (typeof hasDripBatchKeyColumnCached === "boolean") return hasDripBatchKeyColumnCached;
  try {
    hasDripBatchKeyColumnCached = await hasModuleColumn(pool, "drip_batch_key");
  } catch (_error) {
    hasDripBatchKeyColumnCached = false;
  }
  return hasDripBatchKeyColumnCached;
}

async function hasDripOffsetSecondsColumn(pool) {
  if (typeof hasDripOffsetSecondsColumnCached === "boolean") return hasDripOffsetSecondsColumnCached;
  try {
    hasDripOffsetSecondsColumnCached = await hasModuleColumn(pool, "drip_offset_seconds");
  } catch (_error) {
    hasDripOffsetSecondsColumnCached = false;
  }
  return hasDripOffsetSecondsColumnCached;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const qs = event.queryStringParameters || {};
  const moduleId = Number(qs.module_id || 0);

  const pool = getPool();
  try {
    await ensureLearningTables(pool);
    await ensureCourseBatchesTable(pool);
    const courses = await listLearningCourses(pool);
    const hasBatchKey = await hasDripBatchKeyColumn(pool);
    const hasOffset = await hasDripOffsetSecondsColumn(pool);
    const dripBatchKeySelect = hasBatchKey ? "m.drip_batch_key" : "NULL AS drip_batch_key";
    const dripOffsetSecondsSelect = hasOffset ? "m.drip_offset_seconds" : "NULL AS drip_offset_seconds";

    const [modules] = await pool.query(
      `SELECT
         m.id,
         m.course_slug,
         m.module_slug,
         m.module_title,
         m.module_description,
         m.sort_order,
         m.is_active,
         m.drip_enabled,
         DATE_FORMAT(m.drip_at, '%Y-%m-%d %H:%i:%s') AS drip_at,
         ${dripBatchKeySelect},
         ${dripOffsetSecondsSelect},
         DATE_FORMAT(m.drip_notified_at, '%Y-%m-%d %H:%i:%s') AS drip_notified_at,
         m.created_at,
         m.updated_at,
         COALESCE(x.lesson_count, 0) AS lesson_count
       FROM ${MODULES_TABLE} m
       LEFT JOIN (
         SELECT module_id, COUNT(*) AS lesson_count
         FROM ${LESSONS_TABLE}
         GROUP BY module_id
       ) x ON x.module_id = m.id
       ORDER BY m.course_slug ASC, m.sort_order ASC, m.id ASC`
    );

    const [assets] = await pool.query(
      `SELECT
         id,
         provider,
         video_uid,
         filename,
         hls_url,
         dash_url,
         duration_seconds,
         ready_to_stream,
         source_created_at,
         updated_at
       FROM ${VIDEO_ASSETS_TABLE}
       ORDER BY updated_at DESC
       LIMIT 1000`
    );

    const [courseBatches] = await pool.query(
      `SELECT course_slug, batch_key, batch_label, status, is_active,
              DATE_FORMAT(batch_start_at, '%Y-%m-%d %H:%i:%s') AS batch_start_at
       FROM course_batches
       ORDER BY course_slug ASC, batch_start_at ASC, batch_key ASC`
    );

    const [moduleDripSchedules] = await pool.query(
      `SELECT module_id, batch_key, DATE_FORMAT(drip_at, '%Y-%m-%d %H:%i:%s') AS drip_at
       FROM ${MODULE_BATCH_DRIPS_TABLE}
       ORDER BY module_id ASC, batch_key ASC`
    );

    let lessons = [];
    if (Number.isFinite(moduleId) && moduleId > 0) {
      const [rows] = await pool.query(
        `SELECT
           l.id,
           l.module_id,
           l.lesson_slug,
           l.lesson_title,
           l.lesson_order,
           l.video_asset_id,
           l.lesson_notes,
           l.is_active,
           l.created_at,
           l.updated_at,
           a.video_uid,
           a.filename,
           a.hls_url,
           a.dash_url
         FROM ${LESSONS_TABLE} l
         LEFT JOIN ${VIDEO_ASSETS_TABLE} a ON a.id = l.video_asset_id
         WHERE l.module_id = ?
         ORDER BY l.lesson_order ASC, l.id ASC`,
        [moduleId]
      );
      lessons = Array.isArray(rows) ? rows : [];
    }

    return json(200, {
      ok: true,
      courses: Array.isArray(courses) ? courses : [],
      modules: Array.isArray(modules) ? modules : [],
      course_batches: Array.isArray(courseBatches) ? courseBatches : [],
      module_drip_schedules: Array.isArray(moduleDripSchedules) ? moduleDripSchedules : [],
      assets: Array.isArray(assets) ? assets : [],
      lessons,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load learning library." });
  }
};
