const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLearningTables,
  VIDEO_ASSETS_TABLE,
  MODULES_TABLE,
  LESSONS_TABLE,
} = require("./_lib/learning");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const qs = event.queryStringParameters || {};
  const moduleId = Number(qs.module_id || 0);

  const pool = getPool();
  try {
    await ensureLearningTables(pool);

    const [modules] = await pool.query(
      `SELECT
         m.id,
         m.course_slug,
         m.module_slug,
         m.module_title,
         m.module_description,
         m.sort_order,
         m.is_active,
         m.created_at,
         m.updated_at,
         COUNT(l.id) AS lesson_count
       FROM ${MODULES_TABLE} m
       LEFT JOIN ${LESSONS_TABLE} l ON l.module_id = m.id
       GROUP BY m.id
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
      modules: Array.isArray(modules) ? modules : [],
      assets: Array.isArray(assets) ? assets : [],
      lessons,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load learning library." });
  }
};
