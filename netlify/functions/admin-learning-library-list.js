const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLearningTables,
  listLearningCourses,
  VIDEO_ASSETS_TABLE,
  MODULES_TABLE,
  COURSE_MODULES_TABLE,
  MODULE_BATCH_DRIPS_TABLE,
  LESSONS_TABLE,
} = require("./_lib/learning");
const { ensureCourseBatchesTable } = require("./_lib/batch-store");

let hasDripBatchKeyColumnCached = null;
let hasDripOffsetSecondsColumnCached = null;
let hasModuleBatchAccessModeColumnCached = null;
let hasLessonCaptionsColumnCached = null;
let hasLessonTranscriptColumnCached = null;
let hasLessonCaptionsLanguagesColumnCached = null;
let hasLessonAudioDescriptionColumnCached = null;
let hasLessonSignLanguageColumnCached = null;
let hasLessonAccessibilityStatusColumnCached = null;
let hasCourseModuleMappingsTableCached = null;
const LEGACY_IMMEDIATE_DRIP_SENTINEL = "1970-01-01 00:00:00";

async function hasCourseModuleMappingsTable(pool) {
  if (hasCourseModuleMappingsTableCached === true) return true;
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?
     LIMIT 1`,
    [COURSE_MODULES_TABLE]
  );
  hasCourseModuleMappingsTableCached = Array.isArray(rows) && rows.length > 0;
  return hasCourseModuleMappingsTableCached;
}

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
  if (hasDripBatchKeyColumnCached === true) return true;
  try {
    hasDripBatchKeyColumnCached = await hasModuleColumn(pool, "drip_batch_key");
  } catch (_error) {
    hasDripBatchKeyColumnCached = false;
  }
  return hasDripBatchKeyColumnCached;
}

async function hasDripOffsetSecondsColumn(pool) {
  if (hasDripOffsetSecondsColumnCached === true) return true;
  try {
    hasDripOffsetSecondsColumnCached = await hasModuleColumn(pool, "drip_offset_seconds");
  } catch (_error) {
    hasDripOffsetSecondsColumnCached = false;
  }
  return hasDripOffsetSecondsColumnCached;
}

async function hasLessonColumn(pool, columnName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [LESSONS_TABLE, String(columnName || "")]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function hasTableColumn(pool, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [String(tableName || ""), String(columnName || "")]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function hasModuleBatchAccessModeColumn(pool) {
  if (hasModuleBatchAccessModeColumnCached === true) return true;
  try {
    hasModuleBatchAccessModeColumnCached = await hasTableColumn(pool, MODULE_BATCH_DRIPS_TABLE, "access_mode");
  } catch (_error) {
    hasModuleBatchAccessModeColumnCached = false;
  }
  return hasModuleBatchAccessModeColumnCached;
}

async function hasLessonCaptionsColumn(pool) {
  if (hasLessonCaptionsColumnCached === true) return true;
  try {
    hasLessonCaptionsColumnCached = await hasLessonColumn(pool, "captions_vtt_url");
  } catch (_error) {
    hasLessonCaptionsColumnCached = false;
  }
  return hasLessonCaptionsColumnCached;
}

async function hasLessonTranscriptColumn(pool) {
  if (hasLessonTranscriptColumnCached === true) return true;
  try {
    hasLessonTranscriptColumnCached = await hasLessonColumn(pool, "transcript_text");
  } catch (_error) {
    hasLessonTranscriptColumnCached = false;
  }
  return hasLessonTranscriptColumnCached;
}

async function hasLessonCaptionsLanguagesColumn(pool) {
  if (hasLessonCaptionsLanguagesColumnCached === true) return true;
  try {
    hasLessonCaptionsLanguagesColumnCached = await hasLessonColumn(pool, "captions_languages_json");
  } catch (_error) {
    hasLessonCaptionsLanguagesColumnCached = false;
  }
  return hasLessonCaptionsLanguagesColumnCached;
}

async function hasLessonAudioDescriptionColumn(pool) {
  if (hasLessonAudioDescriptionColumnCached === true) return true;
  try {
    hasLessonAudioDescriptionColumnCached = await hasLessonColumn(pool, "audio_description_text");
  } catch (_error) {
    hasLessonAudioDescriptionColumnCached = false;
  }
  return hasLessonAudioDescriptionColumnCached;
}

async function hasLessonSignLanguageColumn(pool) {
  if (hasLessonSignLanguageColumnCached === true) return true;
  try {
    hasLessonSignLanguageColumnCached = await hasLessonColumn(pool, "sign_language_video_url");
  } catch (_error) {
    hasLessonSignLanguageColumnCached = false;
  }
  return hasLessonSignLanguageColumnCached;
}

async function hasLessonAccessibilityStatusColumn(pool) {
  if (hasLessonAccessibilityStatusColumnCached === true) return true;
  try {
    hasLessonAccessibilityStatusColumnCached = await hasLessonColumn(pool, "accessibility_status");
  } catch (_error) {
    hasLessonAccessibilityStatusColumnCached = false;
  }
  return hasLessonAccessibilityStatusColumnCached;
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
    const hasCaptions = await hasLessonCaptionsColumn(pool);
    const hasTranscript = await hasLessonTranscriptColumn(pool);
    const hasCaptionsLanguages = await hasLessonCaptionsLanguagesColumn(pool);
    const hasAudioDescription = await hasLessonAudioDescriptionColumn(pool);
    const hasSignLanguage = await hasLessonSignLanguageColumn(pool);
    const hasAccessibilityStatus = await hasLessonAccessibilityStatusColumn(pool);
    const hasCourseModuleMappings = await hasCourseModuleMappingsTable(pool).catch(function () { return false; });
    const hasBatchAccessMode = await hasModuleBatchAccessModeColumn(pool);
    const dripBatchKeySelect = hasBatchKey ? "m.drip_batch_key" : "NULL AS drip_batch_key";
    const dripOffsetSecondsSelect = hasOffset ? "m.drip_offset_seconds" : "NULL AS drip_offset_seconds";
    const missingCaptionsSelect = hasCaptions
      ? "SUM(CASE WHEN is_active = 1 AND COALESCE(TRIM(captions_vtt_url), '') = '' THEN 1 ELSE 0 END) AS missing_captions_count"
      : "0 AS missing_captions_count";
    const missingTranscriptSelect = hasTranscript
      ? "SUM(CASE WHEN is_active = 1 AND COALESCE(TRIM(transcript_text), '') = '' THEN 1 ELSE 0 END) AS missing_transcript_count"
      : "0 AS missing_transcript_count";

    const modulesSql = hasCourseModuleMappings
      ? `SELECT
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
           m.updated_at,
           COALESCE(x.lesson_count, 0) AS lesson_count,
           COALESCE(x.active_lesson_count, 0) AS active_lesson_count,
           COALESCE(x.missing_captions_count, 0) AS missing_captions_count,
           COALESCE(x.missing_transcript_count, 0) AS missing_transcript_count
         FROM ${COURSE_MODULES_TABLE} cm
         JOIN ${MODULES_TABLE} m ON m.id = cm.module_id
         LEFT JOIN (
           SELECT module_id,
                  COUNT(*) AS lesson_count,
                  SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_lesson_count,
                  ${missingCaptionsSelect},
                  ${missingTranscriptSelect}
           FROM ${LESSONS_TABLE}
           GROUP BY module_id
         ) x ON x.module_id = m.id
         ORDER BY cm.course_slug ASC, cm.sort_order ASC, cm.id ASC`
      : `SELECT
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
           COALESCE(x.lesson_count, 0) AS lesson_count,
           COALESCE(x.active_lesson_count, 0) AS active_lesson_count,
           COALESCE(x.missing_captions_count, 0) AS missing_captions_count,
           COALESCE(x.missing_transcript_count, 0) AS missing_transcript_count
         FROM ${MODULES_TABLE} m
         LEFT JOIN (
           SELECT module_id,
                  COUNT(*) AS lesson_count,
                  SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_lesson_count,
                  ${missingCaptionsSelect},
                  ${missingTranscriptSelect}
           FROM ${LESSONS_TABLE}
           GROUP BY module_id
         ) x ON x.module_id = m.id
         ORDER BY m.course_slug ASC, m.sort_order ASC, m.id ASC`;
    const [modules] = await pool.query(modulesSql);

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

    const accessModeSelect = hasBatchAccessMode
      ? "access_mode"
      : `CASE
           WHEN drip_at <= '${LEGACY_IMMEDIATE_DRIP_SENTINEL}' THEN 'immediate'
           ELSE 'drip'
         END AS access_mode`;
    const dripAtSelect = hasBatchAccessMode
      ? "DATE_FORMAT(drip_at, '%Y-%m-%d %H:%i:%s') AS drip_at"
      : `CASE
           WHEN drip_at <= '${LEGACY_IMMEDIATE_DRIP_SENTINEL}' THEN NULL
           ELSE DATE_FORMAT(drip_at, '%Y-%m-%d %H:%i:%s')
         END AS drip_at`;
    const [moduleDripSchedules] = await pool.query(
      `SELECT module_id, batch_key, ${accessModeSelect}, ${dripAtSelect}
       FROM ${MODULE_BATCH_DRIPS_TABLE}
       ORDER BY module_id ASC, batch_key ASC`
    );

    let lessons = [];
    if (Number.isFinite(moduleId) && moduleId > 0) {
      const captionsVttSelect = hasCaptions ? "l.captions_vtt_url" : "NULL AS captions_vtt_url";
      const captionsLanguagesSelect = hasCaptionsLanguages ? "l.captions_languages_json" : "NULL AS captions_languages_json";
      const transcriptTextSelect = hasTranscript ? "l.transcript_text" : "NULL AS transcript_text";
      const audioDescriptionTextSelect = hasAudioDescription ? "l.audio_description_text" : "NULL AS audio_description_text";
      const signLanguageVideoUrlSelect = hasSignLanguage ? "l.sign_language_video_url" : "NULL AS sign_language_video_url";
      const accessibilityStatusSelect = hasAccessibilityStatus ? "l.accessibility_status" : "'draft' AS accessibility_status";
      const [rows] = await pool.query(
        `SELECT
           l.id,
           l.module_id,
           l.lesson_slug,
           l.lesson_title,
           l.lesson_order,
           l.video_asset_id,
           l.lesson_notes,
           ${captionsVttSelect},
           ${captionsLanguagesSelect},
           ${transcriptTextSelect},
           ${audioDescriptionTextSelect},
           ${signLanguageVideoUrlSelect},
           ${accessibilityStatusSelect},
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
      accessibility_metrics_available: Boolean(hasCaptions && hasTranscript),
      accessibility_columns: {
        captions_vtt_url: Boolean(hasCaptions),
        transcript_text: Boolean(hasTranscript),
      },
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
