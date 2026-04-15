const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { ensureLearningTables, LESSONS_TABLE, VIDEO_ASSETS_TABLE, MODULES_TABLE } = require("./_lib/learning");
const { generateText, hasKeyForProvider, selectedProviderName } = require("./_lib/ai-client");
let accessibilityLessonColumnsEnsured = false;

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number.isFinite(fallback) ? fallback : 0;
  return Math.trunc(n);
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (error) {
    const msg = String((error && error.message) || "").toLowerCase();
    if (
      msg.indexOf("duplicate column") !== -1 ||
      msg.indexOf("duplicate key name") !== -1 ||
      msg.indexOf("already exists") !== -1
    ) {
      return;
    }
    throw error;
  }
}

async function ensureAccessibilityLessonColumns(pool) {
  if (accessibilityLessonColumnsEnsured) return;
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN captions_vtt_url TEXT NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN captions_languages_json TEXT NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN transcript_text LONGTEXT NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN audio_description_text LONGTEXT NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN sign_language_video_url TEXT NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN accessibility_status VARCHAR(32) NOT NULL DEFAULT 'draft'`);
  accessibilityLessonColumnsEnsured = true;
}

async function hasLessonColumn(pool, columnName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [LESSONS_TABLE, clean(columnName, 80)]
  );
  return Array.isArray(rows) && rows.length > 0;
}

function stripVttToPlainText(vtt) {
  const raw = String(vtt || "");
  if (!raw) return "";
  const lines = raw.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || "").trim();
    if (!line) continue;
    if (/^WEBVTT/i.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    if (/^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(line)) continue;
    if (/^\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}\.\d{3}/.test(line)) continue;
    out.push(line.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
  }
  return out.filter(Boolean).join("\n").slice(0, 120000);
}

function getCloudflareConfig() {
  const accountId = clean(process.env.CLOUDFLARE_ACCOUNT_ID, 120);
  const token = clean(process.env.CLOUDFLARE_STREAM_API_TOKEN, 500);
  if (!accountId || !token) return null;
  return { accountId, token };
}

async function cfFetch(pathname, config) {
  const url = `https://api.cloudflare.com/client/v4${pathname}`;
  const ctrl = new AbortController();
  const timeout = setTimeout(function () { ctrl.abort(); }, 4500);
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const payload = await res.json().catch(function () { return null; });
  if (!res.ok || !payload || payload.success !== true) {
    const errMsg =
      (payload && Array.isArray(payload.errors) && payload.errors[0] && payload.errors[0].message) ||
      (payload && payload.message) ||
      `Cloudflare request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return payload;
}

async function cfPostJson(pathname, config, body) {
  const url = `https://api.cloudflare.com/client/v4${pathname}`;
  const ctrl = new AbortController();
  const timeout = setTimeout(function () { ctrl.abort(); }, 4500);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const payload = await res.json().catch(function () { return null; });
  if (!res.ok || !payload || payload.success !== true) {
    const errMsg =
      (payload && Array.isArray(payload.errors) && payload.errors[0] && payload.errors[0].message) ||
      (payload && payload.message) ||
      `Cloudflare request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return payload;
}

function pickCaptionTrack(result) {
  const rows = Array.isArray(result) ? result : [];
  if (!rows.length) return null;
  const preferred = rows.find(function (row) {
    const lang = clean(row && (row.language || row.lang), 40).toLowerCase();
    return lang === "en" || lang === "en-us" || lang === "en-gb";
  });
  return preferred || rows[0] || null;
}

function normalizeCaptionLanguage(input) {
  const raw = clean(input, 40).toLowerCase();
  if (!raw) return "en";
  if (raw === "en-us" || raw === "en-gb") return "en";
  return raw;
}

function inferCaptionLanguage(captionsLanguagesJson, captionsUrl) {
  const fromJson = clean(captionsLanguagesJson, 4000);
  if (fromJson) {
    try {
      const parsed = JSON.parse(fromJson);
      if (Array.isArray(parsed) && parsed.length) {
        const lang = normalizeCaptionLanguage(parsed[0]);
        if (lang) return lang;
      }
    } catch (_error) {}
  }
  const url = clean(captionsUrl, 1200).toLowerCase();
  const m = url.match(/\/captions\/([a-z0-9-]+)\.vtt(?:$|\?)/i);
  if (m && m[1]) return normalizeCaptionLanguage(m[1]);
  return "en";
}

function captionTrackUrl(track, videoUid) {
  const direct =
    clean(track && track.url, 1200) ||
    clean(track && track.vtt_url, 1200) ||
    clean(track && track.webvtt, 1200) ||
    clean(track && track.download_url, 1200);
  if (direct) return direct;

  const uid = clean(videoUid, 120);
  const lang = clean(track && (track.language || track.lang), 40) || "en";
  if (!uid) return "";
  return `https://videodelivery.net/${encodeURIComponent(uid)}/captions/${encodeURIComponent(lang)}.vtt`;
}

async function fetchText(url) {
  const target = clean(url, 1200);
  if (!target) return "";
  const ctrl = new AbortController();
  const timeout = setTimeout(function () { ctrl.abort(); }, 4500);
  let res;
  try {
    res = await fetch(target, {
      method: "GET",
      headers: {
        Accept: "text/vtt,text/plain,*/*",
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) return "";
  const text = await res.text().catch(function () { return ""; });
  return clean(text, 200000);
}

async function cfFetchCaptionVtt(videoUid, language, config) {
  const uid = clean(videoUid, 120);
  const lang = normalizeCaptionLanguage(language || "en");
  if (!uid || !lang || !config) return "";
  const url =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}` +
    `/stream/${encodeURIComponent(uid)}/captions/${encodeURIComponent(lang)}/vtt`;
  const ctrl = new AbortController();
  const timeout = setTimeout(function () { ctrl.abort(); }, 4500);
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "text/vtt,text/plain,*/*",
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) return "";
  const text = await res.text().catch(function () { return ""; });
  return clean(text, 200000);
}

async function generateAudioDescriptionDraft(input) {
  const transcript = clean(input && input.transcript, 120000);
  if (!transcript) return "";
  if (!hasKeyForProvider(selectedProviderName())) return "";

  const response = await generateText({
    systemPrompt:
      "You draft concise audio description notes for educational videos. Keep it practical and neutral. Do not invent visuals not implied by the transcript.",
    userPrompt:
      "Create a short audio-description aid for a lesson.\n" +
      "Lesson title: " + clean(input && input.lessonTitle, 220) + "\n\n" +
      "Transcript:\n" + transcript + "\n\n" +
      "Output plain text with bullet points.",
    temperature: 0.2,
    maxTokens: 900,
    mockText: "",
  });
  return clean(response && response.text, 120000);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  try {
    await applyRuntimeSettings(getPool());
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    body = {};
  }

  const moduleId = Number(body.module_id || 0);
  const courseSlug = clean(body.course_slug, 120).toLowerCase();
  const dryRun = body.dry_run === true;
  const limit = Math.max(1, Math.min(toInt(body.limit, 4), 8));
  const offset = Math.max(0, toInt(body.offset, 0));
  const includeAudioDescription = body.include_audio_description !== false;

  if (!(moduleId > 0) && !courseSlug) {
    return json(400, { ok: false, error: "module_id or course_slug is required." });
  }

  const pool = getPool();
  try {
    await ensureLearningTables(pool);
    await ensureAccessibilityLessonColumns(pool);

    const [hasCaptions, hasCaptionsLangs, hasTranscript, hasAudioDesc, hasStatus] = await Promise.all([
      hasLessonColumn(pool, "captions_vtt_url").catch(function () { return false; }),
      hasLessonColumn(pool, "captions_languages_json").catch(function () { return false; }),
      hasLessonColumn(pool, "transcript_text").catch(function () { return false; }),
      hasLessonColumn(pool, "audio_description_text").catch(function () { return false; }),
      hasLessonColumn(pool, "accessibility_status").catch(function () { return false; }),
    ]);
    if (!hasCaptions || !hasCaptionsLangs || !hasTranscript || !hasAudioDesc || !hasStatus) {
      return json(400, {
        ok: false,
        error:
          "Accessibility lesson columns are not available yet in this database. Run the lesson schema migration first, then retry.",
      });
    }

    const filters = [];
    const params = [];
    if (moduleId > 0) {
      filters.push("l.module_id = ?");
      params.push(moduleId);
    }
    if (courseSlug) {
      filters.push("m.course_slug = ?");
      params.push(courseSlug);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM ${LESSONS_TABLE} l
       JOIN ${MODULES_TABLE} m ON m.id = l.module_id
       WHERE l.is_active = 1
         AND ${filters.length ? filters.join(" AND ") : "1=1"}`,
      params
    );
    const totalMatching = Number(countRows && countRows[0] && countRows[0].total || 0);

    const [rows] = await pool.query(
      `SELECT
         l.id AS lesson_id,
         l.lesson_title,
         l.module_id,
         l.video_asset_id,
         l.captions_vtt_url,
         l.captions_languages_json,
         l.transcript_text,
         l.audio_description_text,
         l.accessibility_status,
         a.video_uid
       FROM ${LESSONS_TABLE} l
       JOIN ${MODULES_TABLE} m ON m.id = l.module_id
       LEFT JOIN ${VIDEO_ASSETS_TABLE} a ON a.id = l.video_asset_id
       WHERE l.is_active = 1
         AND ${filters.length ? filters.join(" AND ") : "1=1"}
       ORDER BY l.id ASC
       LIMIT ?
       OFFSET ?`,
      params.concat([limit, offset])
    );

    const cloudflare = getCloudflareConfig();
    const videoAssetIds = Array.from(new Set((Array.isArray(rows) ? rows : []).map(function (row) {
      return Number(row && row.video_asset_id || 0);
    }).filter(function (id) {
      return id > 0;
    })));
    const sharedA11yByVideoAssetId = new Map();
    if (videoAssetIds.length) {
      const placeholders = videoAssetIds.map(function () { return "?"; }).join(",");
      const [sharedRows] = await pool.query(
        `SELECT
           video_asset_id,
           captions_vtt_url,
           captions_languages_json,
           transcript_text,
           audio_description_text,
           accessibility_status
         FROM ${LESSONS_TABLE}
         WHERE video_asset_id IN (${placeholders})
           AND (
             COALESCE(TRIM(captions_vtt_url), '') <> ''
             OR COALESCE(TRIM(transcript_text), '') <> ''
             OR COALESCE(TRIM(audio_description_text), '') <> ''
           )
         ORDER BY id ASC`,
        videoAssetIds
      );
      (Array.isArray(sharedRows) ? sharedRows : []).forEach(function (row) {
        const videoAssetId = Number(row && row.video_asset_id || 0);
        if (!(videoAssetId > 0)) return;
        const candidate = {
          captions_vtt_url: clean(row && row.captions_vtt_url, 1200),
          captions_languages_json: clean(row && row.captions_languages_json, 4000),
          transcript_text: clean(row && row.transcript_text, 120000),
          audio_description_text: clean(row && row.audio_description_text, 120000),
          accessibility_status: clean(row && row.accessibility_status, 32).toLowerCase() || "draft",
        };
        const score = (candidate.captions_vtt_url ? 2 : 0) + (candidate.transcript_text ? 3 : 0) + (candidate.audio_description_text ? 1 : 0);
        const prev = sharedA11yByVideoAssetId.get(videoAssetId);
        if (!prev || score > prev.score) {
          sharedA11yByVideoAssetId.set(videoAssetId, { score: score, value: candidate });
        }
      });
    }

    const items = [];
    let updated = 0;
    let skipped = 0;
    let blocked = 0;
    let propagatedRows = 0;
    const reasonCounts = {};
    let processedInBatch = 0;
    const startedAt = Date.now();
    const softDeadlineMs = 24000;

    for (const row of Array.isArray(rows) ? rows : []) {
      if (Date.now() - startedAt >= softDeadlineMs) break;
      const lessonId = Number(row && row.lesson_id || 0);
      if (!(lessonId > 0)) continue;
      const videoAssetId = Number(row && row.video_asset_id || 0);
      const lessonTitle = clean(row && row.lesson_title, 220);
      const videoUid = clean(row && row.video_uid, 120);
      let captionsUrl = clean(row && row.captions_vtt_url, 1200);
      let captionsLanguages = clean(row && row.captions_languages_json, 4000);
      let transcriptText = clean(row && row.transcript_text, 120000);
      let audioDescriptionText = clean(row && row.audio_description_text, 120000);
      let status = clean(row && row.accessibility_status, 32).toLowerCase() || "draft";
      let reason = "";

      if (videoAssetId > 0 && (!captionsUrl || !transcriptText || !audioDescriptionText)) {
        const shared = sharedA11yByVideoAssetId.get(videoAssetId);
        if (shared && shared.value) {
          const inherited = shared.value;
          if (!captionsUrl && inherited.captions_vtt_url) captionsUrl = inherited.captions_vtt_url;
          if (!captionsLanguages && inherited.captions_languages_json) captionsLanguages = inherited.captions_languages_json;
          if (!transcriptText && inherited.transcript_text) transcriptText = inherited.transcript_text;
          if (!audioDescriptionText && inherited.audio_description_text) audioDescriptionText = inherited.audio_description_text;
          if (!reason && (captionsUrl || transcriptText || audioDescriptionText)) {
            reason = "inherited_from_shared_video";
          }
        }
      }

      if (!videoUid) {
        blocked += 1;
        status = "blocked";
        reason = "no_video_uid";
      }

      if (!captionsUrl && videoUid && cloudflare) {
        try {
          const payload = await cfFetch(
            `/accounts/${encodeURIComponent(cloudflare.accountId)}/stream/${encodeURIComponent(videoUid)}/captions`,
            cloudflare
          );
          const track = pickCaptionTrack(payload && payload.result);
          if (track) {
            captionsUrl = captionTrackUrl(track, videoUid);
            const lang = clean(track && (track.language || track.lang), 40);
            if (!captionsLanguages && lang) {
              captionsLanguages = JSON.stringify([lang]);
            }
          }
        } catch (_error) {}
      }

      if (!captionsUrl && videoUid && cloudflare) {
        try {
          await cfPostJson(
            `/accounts/${encodeURIComponent(cloudflare.accountId)}/stream/${encodeURIComponent(videoUid)}/captions/en/generate`,
            cloudflare,
            { language: "en", waitForReady: false }
          );
          captionsUrl = `https://videodelivery.net/${encodeURIComponent(videoUid)}/captions/en.vtt`;
          if (!captionsLanguages) captionsLanguages = JSON.stringify(["en"]);
          status = "in_progress";
          reason = "caption_generation_started";
        } catch (_error) {}
      }

      if (!transcriptText && captionsUrl) {
        const captionLanguage = inferCaptionLanguage(captionsLanguages, captionsUrl);
        let vtt = "";
        if (videoUid && cloudflare) {
          vtt = await cfFetchCaptionVtt(videoUid, captionLanguage, cloudflare).catch(function () { return ""; });
        }
        if (!vtt) {
          vtt = await fetchText(captionsUrl);
        }
        transcriptText = stripVttToPlainText(vtt);
      }

      if (!audioDescriptionText && includeAudioDescription && transcriptText) {
        try {
          audioDescriptionText = await generateAudioDescriptionDraft({
            lessonTitle,
            transcript: transcriptText,
          });
        } catch (_error) {}
      }

      if (!reason) {
        if (captionsUrl && transcriptText) {
          status = "ready";
        } else if (captionsUrl || transcriptText || audioDescriptionText) {
          status = "in_progress";
          if (!captionsUrl) reason = "captions_missing";
          else if (!transcriptText) reason = "transcript_pending";
        } else {
          status = "blocked";
          blocked += 1;
          reason = "no_caption_source";
        }
      }
      if (reason) reasonCounts[reason] = Number(reasonCounts[reason] || 0) + 1;

      const changed =
        captionsUrl !== clean(row && row.captions_vtt_url, 1200) ||
        captionsLanguages !== clean(row && row.captions_languages_json, 4000) ||
        transcriptText !== clean(row && row.transcript_text, 120000) ||
        audioDescriptionText !== clean(row && row.audio_description_text, 120000) ||
        status !== (clean(row && row.accessibility_status, 32).toLowerCase() || "draft");

      items.push({
        lesson_id: lessonId,
        lesson_title: lessonTitle,
        video_uid: videoUid || null,
        captions_found: Boolean(captionsUrl),
        transcript_found: Boolean(transcriptText),
        audio_description_drafted: Boolean(audioDescriptionText),
        status,
        changed,
        reason: reason || null,
      });

      if (!changed) {
        skipped += 1;
        processedInBatch += 1;
        continue;
      }
      if (dryRun) {
        processedInBatch += 1;
        continue;
      }

      if (videoAssetId > 0) {
        const [upd] = await pool.query(
          `UPDATE ${LESSONS_TABLE}
           SET captions_vtt_url = ?,
               captions_languages_json = ?,
               transcript_text = ?,
               audio_description_text = ?,
               accessibility_status = ?,
               updated_at = NOW()
           WHERE video_asset_id = ?`,
          [
            captionsUrl || null,
            captionsLanguages || null,
            transcriptText || null,
            audioDescriptionText || null,
            status || "draft",
            videoAssetId,
          ]
        );
        propagatedRows += Number(upd && upd.affectedRows || 0);
      } else {
        const [upd] = await pool.query(
          `UPDATE ${LESSONS_TABLE}
           SET captions_vtt_url = ?,
               captions_languages_json = ?,
               transcript_text = ?,
               audio_description_text = ?,
               accessibility_status = ?,
               updated_at = NOW()
           WHERE id = ?
           LIMIT 1`,
          [
            captionsUrl || null,
            captionsLanguages || null,
            transcriptText || null,
            audioDescriptionText || null,
            status || "draft",
            lessonId,
          ]
        );
        propagatedRows += Number(upd && upd.affectedRows || 0);
      }
      updated += 1;
      processedInBatch += 1;
    }

    const nextOffset = offset + processedInBatch;
    const hasMore = nextOffset < totalMatching;

    return json(200, {
      ok: true,
      dry_run: dryRun,
      scope: {
        module_id: moduleId > 0 ? moduleId : null,
        course_slug: courseSlug || null,
        limit,
        offset,
      },
      total_matching: totalMatching,
      has_more: hasMore,
      next_offset: hasMore ? nextOffset : null,
      summary: {
        scanned: items.length,
        updated,
        skipped,
        blocked,
        propagated_rows: propagatedRows,
        reason_counts: reasonCounts,
      },
      items,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not generate accessibility drafts." });
  }
};
