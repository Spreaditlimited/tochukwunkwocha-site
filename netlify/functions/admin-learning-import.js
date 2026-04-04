const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLearningTables,
  clean,
  toInt,
  VIDEO_ASSETS_TABLE,
  MODULES_TABLE,
  LESSONS_TABLE,
  upsertVideoAsset,
  findOrCreateModule,
} = require("./_lib/learning");

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(function (v) { return String(v || "").trim(); });
}

function parseCsvTable(csvText) {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .map(function (line) { return String(line || "").trim(); })
    .filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]).map(function (h) { return clean(h, 80).toLowerCase(); });
  const rows = lines.slice(1).map(function (line) {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach(function (header, idx) {
      row[header] = cols[idx] !== undefined ? cols[idx] : "";
    });
    return row;
  });
  return { headers, rows };
}

function pick(row, names) {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const csvText = String(body.csv_text || "");
  const apply = body.apply === true;
  if (!csvText.trim()) return json(400, { ok: false, error: "csv_text is required" });

  const parsed = parseCsvTable(csvText);
  if (!parsed.rows.length) return json(400, { ok: false, error: "CSV has no data rows" });

  const normalizedRows = parsed.rows.map(function (row, index) {
    const courseSlug = clean(pick(row, ["course_slug", "course", "course-slug"]), 120).toLowerCase();
    const moduleTitle = clean(pick(row, ["module_title", "module", "module-name"]), 220);
    const lessonTitle = clean(pick(row, ["lesson_title", "lesson", "lesson-name", "title"]), 220);
    const lessonOrder = toInt(pick(row, ["lesson_order", "order", "lesson_no", "lesson_number"]) || index + 1, index + 1);
    const videoUid = clean(pick(row, ["video_uid", "video_id", "uid"]), 120);
    const filename = clean(pick(row, ["filename", "file_name", "name"]), 320);
    const hlsUrl = clean(pick(row, ["hls_url", "hls", "manifest_hls"]), 1000);
    const dashUrl = clean(pick(row, ["dash_url", "dash", "manifest_dash"]), 1000);
    const moduleDescription = clean(pick(row, ["module_description", "module_desc", "description"]), 4000);
    return {
      row_number: index + 2,
      course_slug: courseSlug,
      module_title: moduleTitle,
      module_description: moduleDescription,
      lesson_title: lessonTitle,
      lesson_order: lessonOrder,
      video_uid: videoUid,
      filename,
      hls_url: hlsUrl,
      dash_url: dashUrl,
    };
  });

  const validationErrors = [];
  normalizedRows.forEach(function (row) {
    if (!row.course_slug) validationErrors.push(`Row ${row.row_number}: course_slug is required`);
    if (!row.module_title) validationErrors.push(`Row ${row.row_number}: module_title is required`);
    if (!row.lesson_title) validationErrors.push(`Row ${row.row_number}: lesson_title is required`);
  });

  if (!apply) {
    return json(200, {
      ok: true,
      preview: {
        total_rows: normalizedRows.length,
        error_count: validationErrors.length,
        errors: validationErrors.slice(0, 30),
        sample_rows: normalizedRows.slice(0, 12),
      },
    });
  }

  if (validationErrors.length) {
    return json(400, { ok: false, error: "Import has validation errors.", details: validationErrors.slice(0, 30) });
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await ensureLearningTables(pool);
    await conn.beginTransaction();

    let moduleWrites = 0;
    let lessonWrites = 0;
    let assetWrites = 0;
    const moduleCache = new Map();

    for (const row of normalizedRows) {
      const moduleKey = `${row.course_slug}::${row.module_title}`;
      let module = moduleCache.get(moduleKey);
      if (!module) {
        module = await findOrCreateModule(conn, {
          course_slug: row.course_slug,
          module_title: row.module_title,
          module_description: row.module_description || null,
          sort_order: 0,
          is_active: 1,
        });
        moduleCache.set(moduleKey, module);
        moduleWrites += 1;
      }

      let videoAssetId = null;
      if (row.video_uid || row.hls_url || row.dash_url || row.filename) {
        let uid = row.video_uid;
        if (!uid && row.hls_url) {
          const parts = row.hls_url.split("/");
          uid = clean(parts[3], 120);
        }
        if (!uid && row.dash_url) {
          const parts = row.dash_url.split("/");
          uid = clean(parts[3], 120);
        }
        if (uid) {
          const saved = await upsertVideoAsset(conn, {
            provider: "cloudflare_stream",
            video_uid: uid,
            filename: row.filename || uid,
            hls_url: row.hls_url || null,
            dash_url: row.dash_url || null,
            ready_to_stream: true,
          });
          videoAssetId = saved && saved.id ? Number(saved.id) : null;
          assetWrites += 1;
        }
      }

      const [existing] = await conn.query(
        `SELECT id
         FROM ${LESSONS_TABLE}
         WHERE module_id = ? AND lesson_title = ?
         LIMIT 1`,
        [module.id, row.lesson_title]
      );

      if (Array.isArray(existing) && existing.length) {
        await conn.query(
          `UPDATE ${LESSONS_TABLE}
           SET lesson_order = ?, video_asset_id = ?, is_active = 1, updated_at = NOW()
           WHERE id = ?
           LIMIT 1`,
          [row.lesson_order, videoAssetId, existing[0].id]
        );
      } else {
        const lessonSlugBase = clean(row.lesson_title, 160).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `lesson-${row.lesson_order}`;
        await conn.query(
          `INSERT INTO ${LESSONS_TABLE}
            (module_id, lesson_slug, lesson_title, lesson_order, video_asset_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())
           ON DUPLICATE KEY UPDATE
             lesson_title = VALUES(lesson_title),
             lesson_order = VALUES(lesson_order),
             video_asset_id = VALUES(video_asset_id),
             is_active = 1,
             updated_at = NOW()`,
          [module.id, lessonSlugBase, row.lesson_title, row.lesson_order, videoAssetId]
        );
      }
      lessonWrites += 1;
    }

    await conn.commit();

    const [statsRows] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM ${VIDEO_ASSETS_TABLE}) AS total_assets,
         (SELECT COUNT(*) FROM ${MODULES_TABLE}) AS total_modules,
         (SELECT COUNT(*) FROM ${LESSONS_TABLE}) AS total_lessons`
    );
    const stats = statsRows && statsRows[0] ? statsRows[0] : {};

    return json(200, {
      ok: true,
      applied: true,
      summary: {
        rows_processed: normalizedRows.length,
        modules_written: moduleWrites,
        lessons_written: lessonWrites,
        assets_written: assetWrites,
        total_assets: Number(stats.total_assets || 0),
        total_modules: Number(stats.total_modules || 0),
        total_lessons: Number(stats.total_lessons || 0),
      },
    });
  } catch (error) {
    try {
      await conn.rollback();
    } catch (_error) {}
    return json(500, { ok: false, error: error.message || "Could not apply CSV import." });
  } finally {
    conn.release();
  }
};
