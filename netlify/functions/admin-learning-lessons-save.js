const { json, badMethod } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLearningTables,
  clean,
  slugify,
  ensureModuleById,
  LESSONS_TABLE,
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

  const moduleId = Number(body.module_id || 0);
  const lessons = Array.isArray(body.lessons) ? body.lessons : [];
  const replaceAll = body.replace_all === false ? false : true;

  if (!Number.isFinite(moduleId) || moduleId <= 0) {
    return json(400, { ok: false, error: "module_id is required" });
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await ensureLearningTables(pool);
    const module = await ensureModuleById(pool, moduleId);
    if (!module) return json(404, { ok: false, error: "Module not found" });

    await conn.beginTransaction();
    const keepIds = [];

    for (let i = 0; i < lessons.length; i += 1) {
      const row = lessons[i] || {};
      const lessonId = Number(row.id || 0);
      const lessonTitle = clean(row.lesson_title, 220);
      if (!lessonTitle) continue;

      const lessonOrder = Number.isFinite(Number(row.lesson_order)) ? Number(row.lesson_order) : i + 1;
      const videoAssetId = Number(row.video_asset_id || 0);
      const safeVideoAssetId = Number.isFinite(videoAssetId) && videoAssetId > 0 ? videoAssetId : null;
      const lessonNotes = clean(row.lesson_notes, 4000) || null;
      const captionsVttUrl = clean(row.captions_vtt_url, 1200) || null;
      const captionsLanguagesJson = clean(row.captions_languages_json, 4000) || null;
      const transcriptText = clean(row.transcript_text, 120000) || null;
      const audioDescriptionText = clean(row.audio_description_text, 120000) || null;
      const signLanguageVideoUrl = clean(row.sign_language_video_url, 1200) || null;
      const accessibilityStatusRaw = clean(row.accessibility_status, 32).toLowerCase();
      const accessibilityStatus = (
        accessibilityStatusRaw === "ready" ||
        accessibilityStatusRaw === "in_progress" ||
        accessibilityStatusRaw === "blocked"
      ) ? accessibilityStatusRaw : "draft";
      const isActive = row.is_active === false || Number(row.is_active) === 0 ? 0 : 1;
      const now = nowSql();
      const lessonTitleNorm = lessonTitle.toLowerCase().replace(/\s+/g, " ").trim();

      const [existingByTitle] = await conn.query(
        `SELECT id, lesson_slug
         FROM ${LESSONS_TABLE}
         WHERE module_id = ? AND LOWER(TRIM(lesson_title)) = ?
         ORDER BY id ASC
         LIMIT 1`,
        [moduleId, lessonTitleNorm]
      );
      const existingTitleRow = Array.isArray(existingByTitle) && existingByTitle.length ? existingByTitle[0] : null;

      if (Number.isFinite(lessonId) && lessonId > 0) {
        const targetLessonId = existingTitleRow && Number(existingTitleRow.id || 0) > 0
          ? Number(existingTitleRow.id)
          : lessonId;
        const keepSlug = existingTitleRow && existingTitleRow.lesson_slug
          ? String(existingTitleRow.lesson_slug)
          : slugify(clean(row.lesson_slug, 160) || lessonTitle, "lesson");
        await conn.query(
          `UPDATE ${LESSONS_TABLE}
           SET lesson_slug = ?, lesson_title = ?, lesson_order = ?, video_asset_id = ?, lesson_notes = ?, captions_vtt_url = ?, captions_languages_json = ?, transcript_text = ?, audio_description_text = ?, sign_language_video_url = ?, accessibility_status = ?, is_active = ?, updated_at = ?
           WHERE id = ? AND module_id = ?
           LIMIT 1`,
          [keepSlug, lessonTitle, lessonOrder, safeVideoAssetId, lessonNotes, captionsVttUrl, captionsLanguagesJson, transcriptText, audioDescriptionText, signLanguageVideoUrl, accessibilityStatus, isActive, now, targetLessonId, moduleId]
        );
        keepIds.push(targetLessonId);
        continue;
      }

      if (existingTitleRow && Number(existingTitleRow.id || 0) > 0) {
        const targetLessonId = Number(existingTitleRow.id);
        const keepSlug = String(existingTitleRow.lesson_slug || slugify(clean(row.lesson_slug, 160) || lessonTitle, "lesson"));
        await conn.query(
          `UPDATE ${LESSONS_TABLE}
           SET lesson_slug = ?, lesson_title = ?, lesson_order = ?, video_asset_id = ?, lesson_notes = ?, captions_vtt_url = ?, captions_languages_json = ?, transcript_text = ?, audio_description_text = ?, sign_language_video_url = ?, accessibility_status = ?, is_active = ?, updated_at = ?
           WHERE id = ? AND module_id = ?
           LIMIT 1`,
          [keepSlug, lessonTitle, lessonOrder, safeVideoAssetId, lessonNotes, captionsVttUrl, captionsLanguagesJson, transcriptText, audioDescriptionText, signLanguageVideoUrl, accessibilityStatus, isActive, now, targetLessonId, moduleId]
        );
        keepIds.push(targetLessonId);
        continue;
      }

      const baseSlug = slugify(clean(row.lesson_slug, 160) || lessonTitle, "lesson");
      let nextSlug = baseSlug;
      let createdId = 0;
      for (let attempt = 1; attempt <= 8; attempt += 1) {
        try {
          const [ins] = await conn.query(
            `INSERT INTO ${LESSONS_TABLE}
              (module_id, lesson_slug, lesson_title, lesson_order, video_asset_id, lesson_notes, captions_vtt_url, captions_languages_json, transcript_text, audio_description_text, sign_language_video_url, accessibility_status, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [moduleId, nextSlug, lessonTitle, lessonOrder, safeVideoAssetId, lessonNotes, captionsVttUrl, captionsLanguagesJson, transcriptText, audioDescriptionText, signLanguageVideoUrl, accessibilityStatus, isActive, now, now]
          );
          createdId = Number(ins && ins.insertId ? ins.insertId : 0);
          break;
        } catch (error) {
          const msg = String(error && error.message || "").toLowerCase();
          if (msg.indexOf("duplicate") === -1) throw error;
          const [titleRows] = await conn.query(
            `SELECT id, lesson_slug
             FROM ${LESSONS_TABLE}
             WHERE module_id = ? AND LOWER(TRIM(lesson_title)) = ?
             ORDER BY id ASC
             LIMIT 1`,
            [moduleId, lessonTitleNorm]
          );
          if (Array.isArray(titleRows) && titleRows.length) {
            createdId = Number(titleRows[0].id || 0);
            if (createdId > 0) {
              await conn.query(
                `UPDATE ${LESSONS_TABLE}
                 SET lesson_order = ?, video_asset_id = ?, lesson_notes = ?, captions_vtt_url = ?, captions_languages_json = ?, transcript_text = ?, audio_description_text = ?, sign_language_video_url = ?, accessibility_status = ?, is_active = ?, updated_at = ?
                 WHERE id = ? AND module_id = ?
                 LIMIT 1`,
                [lessonOrder, safeVideoAssetId, lessonNotes, captionsVttUrl, captionsLanguagesJson, transcriptText, audioDescriptionText, signLanguageVideoUrl, accessibilityStatus, isActive, now, createdId, moduleId]
              );
              break;
            }
          }
          nextSlug = `${baseSlug}-${attempt + 1}`;
        }
      }
      if (createdId > 0) keepIds.push(createdId);
    }

    if (replaceAll) {
      if (keepIds.length) {
        const placeholders = keepIds.map(function () { return "?"; }).join(",");
        await conn.query(
          `DELETE FROM ${LESSONS_TABLE}
           WHERE module_id = ?
             AND id NOT IN (${placeholders})`,
          [moduleId].concat(keepIds)
        );
      } else {
        await conn.query(`DELETE FROM ${LESSONS_TABLE} WHERE module_id = ?`, [moduleId]);
      }
    }

    await conn.commit();

    const [rows] = await pool.query(
      `SELECT
         l.id,
         l.module_id,
         l.lesson_slug,
         l.lesson_title,
         l.lesson_order,
         l.video_asset_id,
         l.lesson_notes,
         l.captions_vtt_url,
         l.captions_languages_json,
         l.transcript_text,
         l.audio_description_text,
         l.sign_language_video_url,
         l.accessibility_status,
         l.is_active,
         l.created_at,
         l.updated_at,
         a.video_uid,
         a.filename,
         a.hls_url,
         a.dash_url
       FROM ${LESSONS_TABLE} l
       LEFT JOIN tochukwu_learning_video_assets a ON a.id = l.video_asset_id
       WHERE l.module_id = ?
       ORDER BY l.lesson_order ASC, l.id ASC`,
      [moduleId]
    );

    return json(200, { ok: true, module, lessons: Array.isArray(rows) ? rows : [] });
  } catch (error) {
    try {
      await conn.rollback();
    } catch (_error) {}
    return json(500, { ok: false, error: error.message || "Could not save lessons." });
  } finally {
    conn.release();
  }
};
