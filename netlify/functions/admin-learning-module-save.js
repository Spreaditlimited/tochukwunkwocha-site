const { json, badMethod } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLearningTables,
  clean,
  slugify,
  findOrCreateModule,
  ensureModuleById,
  findLearningCourseBySlug,
  MODULES_TABLE,
  COURSE_MODULES_TABLE,
  MODULE_BATCH_DRIPS_TABLE,
} = require("./_lib/learning");

const LEGACY_IMMEDIATE_DRIP_SENTINEL = "1970-01-01 00:00:00";

function normalizeBatchKey(value) {
  return clean(value, 64).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64);
}

function normalizeAccessMode(value) {
  const raw = clean(value, 24).toLowerCase();
  return raw === "immediate" ? "immediate" : "drip";
}

function normalizeDripDateTime(value) {
  const raw = clean(value, 64);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw + " 00:00:00";
  }
  const usDateMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (usDateMatch) {
    const mm = String(Math.max(1, Math.min(12, Number(usDateMatch[1])))).padStart(2, "0");
    const dd = String(Math.max(1, Math.min(31, Number(usDateMatch[2])))).padStart(2, "0");
    const yyyy = String(usDateMatch[3]);
    const hh = String(Math.max(0, Math.min(23, Number(usDateMatch[4] || 0)))).padStart(2, "0");
    const mi = String(Math.max(0, Math.min(59, Number(usDateMatch[5] || 0)))).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:00`;
  }
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(raw)) return null;
  return raw.replace("T", " ") + (raw.length === 16 ? ":00" : "");
}

function hasInvalidDripScheduleRows(rawSchedules) {
  const rows = Array.isArray(rawSchedules) ? rawSchedules : [];
  for (const item of rows) {
    const batchKey = normalizeBatchKey(item && item.batch_key);
    if (!batchKey) continue;
    const modeFromInput = clean(item && item.access_mode, 24).toLowerCase();
    const isImmediate = modeFromInput === "immediate";
    if (isImmediate) continue;
    const dripAt = normalizeDripDateTime(item && item.drip_at);
    if (!dripAt) return true;
  }
  return false;
}

function parseSqlDateMs(value) {
  const raw = String(value || "").trim();
  if (!raw) return NaN;
  const ms = new Date(raw.replace(" ", "T") + "Z").getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

async function resolveCourseDripAnchor(pool, courseSlug) {
  try {
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(
          COALESCE(
            MAX(CASE WHEN is_active = 1 THEN batch_start_at ELSE NULL END),
            MIN(batch_start_at)
          ),
          '%Y-%m-%d %H:%i:%s'
        ) AS anchor_start_at
       FROM course_batches
       WHERE course_slug = ?
         AND batch_start_at IS NOT NULL`,
      [clean(courseSlug, 120).toLowerCase()]
    );
    return rows && rows[0] && rows[0].anchor_start_at
      ? String(rows[0].anchor_start_at)
      : "";
  } catch (_error) {
    return "";
  }
}

async function listCourseBatchKeys(pool, courseSlug) {
  try {
    const [rows] = await pool.query(
      `SELECT batch_key
       FROM course_batches
       WHERE course_slug = ?`,
      [clean(courseSlug, 120).toLowerCase()]
    );
    return (Array.isArray(rows) ? rows : [])
      .map(function (row) { return normalizeBatchKey(row && row.batch_key); })
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function buildValidatedSchedules(rawSchedules, fallbackLegacy) {
  const list = [];
  (Array.isArray(rawSchedules) ? rawSchedules : []).forEach(function (item) {
    const batchKey = normalizeBatchKey(item && item.batch_key);
    const dripAt = normalizeDripDateTime(item && item.drip_at);
    const modeFromInput = clean(item && item.access_mode, 24).toLowerCase();
    const accessMode = modeFromInput === "immediate"
      ? "immediate"
      : (modeFromInput === "drip" ? "drip" : (dripAt ? "drip" : "immediate"));
    if (!batchKey) return;
    if (accessMode === "drip" && !dripAt) return;
    list.push({ batch_key: batchKey, access_mode: accessMode, drip_at: dripAt || null });
  });

  if (!list.length && fallbackLegacy && fallbackLegacy.batch_key && fallbackLegacy.drip_at) {
    list.push({
      batch_key: normalizeBatchKey(fallbackLegacy.batch_key),
      access_mode: normalizeAccessMode(fallbackLegacy.access_mode || "drip"),
      drip_at: normalizeDripDateTime(fallbackLegacy.drip_at),
    });
  }

  const deduped = [];
  const seen = new Set();
  list.forEach(function (row) {
    if (!row.batch_key) return;
    if (row.access_mode === "drip" && !row.drip_at) return;
    if (seen.has(row.batch_key)) return;
    seen.add(row.batch_key);
    deduped.push(row);
  });
  return deduped;
}

function pickPrimaryDripSchedule(schedules) {
  const rows = (Array.isArray(schedules) ? schedules : []).filter(function (row) {
    return normalizeAccessMode(row && row.access_mode) === "drip" && !!normalizeDripDateTime(row && row.drip_at);
  }).slice();
  rows.sort(function (a, b) {
    return String(a.drip_at || "").localeCompare(String(b.drip_at || ""));
  });
  return rows.length ? rows[0] : null;
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

async function replaceModuleDripSchedules(pool, moduleId, schedules) {
  const id = Number(moduleId || 0);
  if (!(id > 0)) return;
  const hasAccessMode = await hasModuleBatchAccessModeColumn(pool).catch(function () { return false; });
  await pool.query(
    `DELETE FROM ${MODULE_BATCH_DRIPS_TABLE}
     WHERE module_id = ?`,
    [id]
  );
  const rows = Array.isArray(schedules) ? schedules : [];
  for (const row of rows) {
    const accessMode = normalizeAccessMode(row && row.access_mode);
    const dripAt = normalizeDripDateTime(row && row.drip_at) || nowSql();
    if (hasAccessMode) {
      await pool.query(
        `INSERT INTO ${MODULE_BATCH_DRIPS_TABLE}
          (module_id, batch_key, access_mode, drip_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, row.batch_key, accessMode, dripAt, nowSql(), nowSql()]
      );
    } else {
      const legacyDripAt = accessMode === "immediate" ? LEGACY_IMMEDIATE_DRIP_SENTINEL : dripAt;
      await pool.query(
        `INSERT INTO ${MODULE_BATCH_DRIPS_TABLE}
          (module_id, batch_key, drip_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, row.batch_key, legacyDripAt, nowSql(), nowSql()]
      );
    }
  }
}

async function fetchModuleDripSchedules(pool, moduleId) {
  const id = Number(moduleId || 0);
  if (!(id > 0)) return [];
  const hasAccessMode = await hasModuleBatchAccessModeColumn(pool).catch(function () { return false; });
  const accessModeSelect = hasAccessMode
    ? "access_mode"
    : `CASE
         WHEN drip_at <= '${LEGACY_IMMEDIATE_DRIP_SENTINEL}' THEN 'immediate'
         ELSE 'drip'
       END AS access_mode`;
  const dripAtSelect = hasAccessMode
    ? "DATE_FORMAT(drip_at, '%Y-%m-%d %H:%i:%s') AS drip_at"
    : `CASE
         WHEN drip_at <= '${LEGACY_IMMEDIATE_DRIP_SENTINEL}' THEN NULL
         ELSE DATE_FORMAT(drip_at, '%Y-%m-%d %H:%i:%s')
       END AS drip_at`;
  const [rows] = await pool.query(
    `SELECT batch_key, ${accessModeSelect}, ${dripAtSelect}
     FROM ${MODULE_BATCH_DRIPS_TABLE}
     WHERE module_id = ?
     ORDER BY batch_key ASC`,
    [id]
  );
  return Array.isArray(rows) ? rows : [];
}

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

async function upsertCourseModuleMapping(pool, input) {
  const moduleId = Number(input && input.module_id || 0);
  const courseSlug = clean(input && input.course_slug, 120).toLowerCase();
  if (!(moduleId > 0) || !courseSlug) return;
  await pool.query(
    `INSERT INTO ${COURSE_MODULES_TABLE}
      (course_slug, module_id, sort_order, is_active, drip_enabled, drip_at, drip_batch_key, drip_offset_seconds, drip_notified_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
     ON DUPLICATE KEY UPDATE
      sort_order = VALUES(sort_order),
      is_active = VALUES(is_active),
      drip_enabled = VALUES(drip_enabled),
      drip_at = VALUES(drip_at),
      drip_batch_key = VALUES(drip_batch_key),
      drip_offset_seconds = VALUES(drip_offset_seconds),
      updated_at = VALUES(updated_at)`,
    [
      courseSlug,
      moduleId,
      Number.isFinite(Number(input && input.sort_order)) ? Number(input.sort_order) : 0,
      Number(input && input.is_active || 0) === 0 ? 0 : 1,
      Number(input && input.drip_enabled || 0) === 1 ? 1 : 0,
      input && input.drip_at ? input.drip_at : null,
      clean(input && input.drip_batch_key, 64) || null,
      Number.isFinite(Number(input && input.drip_offset_seconds)) ? Number(input.drip_offset_seconds) : null,
      nowSql(),
      nowSql(),
    ]
  );
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

  const pool = getPool();
  try {
    await ensureLearningTables(pool);
    const hasCourseModuleMappings = await hasCourseModuleMappingsTable(pool).catch(function () { return false; });

    const id = Number(body.id || 0);
    const courseSlug = clean(body.course_slug, 120).toLowerCase();
    const moduleTitle = clean(body.module_title, 220);
    const moduleDescription = clean(body.module_description, 4000) || null;
    const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
    const isActive = body.is_active === false || Number(body.is_active) === 0 ? 0 : 1;
    const dripEnabledInput = body.drip_enabled === true || Number(body.drip_enabled) === 1 ? 1 : 0;
    const applyToTitleGroup = body.apply_to_title_group === true;

    if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });
    if (!moduleTitle) return json(400, { ok: false, error: "module_title is required" });
    const existingCourse = await findLearningCourseBySlug(pool, courseSlug);
    if (!existingCourse) return json(400, { ok: false, error: "Create this course first before adding modules." });
    const isImmediateCourse = String(existingCourse.enrollment_mode || "").trim().toLowerCase() === "immediate";

    const legacyDripAt = normalizeDripDateTime(body.drip_at);
    const legacyDripBatchKey = normalizeBatchKey(body.drip_batch_key);
    if (dripEnabledInput && hasInvalidDripScheduleRows(body.drip_schedules)) {
      return json(400, { ok: false, error: "Set a valid drip date/time for every selected batch that is not marked Immediate access." });
    }
    const schedulesInput = buildValidatedSchedules(body.drip_schedules, {
      batch_key: legacyDripBatchKey,
      access_mode: body.access_mode || "drip",
      drip_at: legacyDripAt,
    });
    const dripEnabled = isImmediateCourse ? 0 : dripEnabledInput;
    const schedules = isImmediateCourse ? [] : schedulesInput;
    const courseBatchKeys = await listCourseBatchKeys(pool, courseSlug);
    if (dripEnabled && courseBatchKeys.length && !schedules.length) {
      return json(400, { ok: false, error: "Add at least one batch access rule when batch access control is enabled." });
    }
    if (dripEnabled && schedules.some(function (row) { return courseBatchKeys.length && courseBatchKeys.indexOf(row.batch_key) === -1; })) {
      return json(400, { ok: false, error: "One or more drip batches are invalid for this course." });
    }

    const primary = pickPrimaryDripSchedule(schedules);
    let dripOffsetSeconds = null;
    if (dripEnabled && primary && primary.drip_at) {
      const anchorStartAt = await resolveCourseDripAnchor(pool, courseSlug);
      const dripAtMs = parseSqlDateMs(primary.drip_at);
      const anchorMs = parseSqlDateMs(anchorStartAt);
      if (Number.isFinite(dripAtMs) && Number.isFinite(anchorMs)) {
        dripOffsetSeconds = Math.round((dripAtMs - anchorMs) / 1000);
      }
    }

    let targetModuleId = 0;
    if (Number.isFinite(id) && id > 0) {
      const existing = await ensureModuleById(pool, id);
      if (!existing) return json(404, { ok: false, error: "Module not found" });
      const nextSlug = slugify(clean(body.module_slug, 160) || existing.module_slug || moduleTitle, "module");
      await pool.query(
        `UPDATE ${MODULES_TABLE}
         SET course_slug = ?, module_slug = ?, module_title = ?, module_description = ?, sort_order = ?, is_active = ?, drip_enabled = ?, drip_at = ?, drip_batch_key = ?, drip_offset_seconds = ?, updated_at = ?
         WHERE id = ?
         LIMIT 1`,
        [
          courseSlug,
          nextSlug,
          moduleTitle,
          moduleDescription,
          sortOrder,
          isActive,
          dripEnabled,
          dripEnabled && primary ? primary.drip_at : null,
          dripEnabled && primary ? primary.batch_key : null,
          dripEnabled ? dripOffsetSeconds : null,
          nowSql(),
          id,
        ]
      );
      targetModuleId = id;
      if (hasCourseModuleMappings) {
        await upsertCourseModuleMapping(pool, {
          module_id: id,
          course_slug: courseSlug,
          sort_order: sortOrder,
          is_active: isActive,
          drip_enabled: dripEnabled,
          drip_at: dripEnabled && primary ? primary.drip_at : null,
          drip_batch_key: dripEnabled && primary ? primary.batch_key : null,
          drip_offset_seconds: dripEnabled ? dripOffsetSeconds : null,
        });
      }

      if (applyToTitleGroup) {
        const [groupRows] = await pool.query(
          `SELECT id
           FROM ${MODULES_TABLE}
           WHERE course_slug = ?
             AND LOWER(TRIM(module_title)) = LOWER(TRIM(?))`,
          [courseSlug, moduleTitle]
        );
        for (const row of (Array.isArray(groupRows) ? groupRows : [])) {
          await replaceModuleDripSchedules(pool, Number(row.id || 0), dripEnabled ? schedules : []);
        }
      } else {
        await replaceModuleDripSchedules(pool, Number(id), dripEnabled ? schedules : []);
      }
    } else {
      const module = await findOrCreateModule(pool, {
        course_slug: courseSlug,
        module_title: moduleTitle,
        module_description: moduleDescription,
        sort_order: sortOrder,
        is_active: isActive,
      });
      targetModuleId = Number(module && module.id || 0);
      if (targetModuleId > 0) {
        await pool.query(
          `UPDATE ${MODULES_TABLE}
           SET drip_enabled = ?, drip_at = ?, drip_batch_key = ?, drip_offset_seconds = ?, updated_at = ?
           WHERE id = ?
           LIMIT 1`,
          [
            dripEnabled,
            dripEnabled && primary ? primary.drip_at : null,
            dripEnabled && primary ? primary.batch_key : null,
            dripEnabled ? dripOffsetSeconds : null,
            nowSql(),
            targetModuleId,
          ]
        );
        await replaceModuleDripSchedules(pool, targetModuleId, dripEnabled ? schedules : []);
        if (hasCourseModuleMappings) {
          await upsertCourseModuleMapping(pool, {
            module_id: targetModuleId,
            course_slug: courseSlug,
            sort_order: sortOrder,
            is_active: isActive,
            drip_enabled: dripEnabled,
            drip_at: dripEnabled && primary ? primary.drip_at : null,
            drip_batch_key: dripEnabled && primary ? primary.batch_key : null,
            drip_offset_seconds: dripEnabled ? dripOffsetSeconds : null,
          });
        }
      }
    }

    const [rows] = await pool.query(
      `SELECT id, course_slug, module_slug, module_title, module_description, sort_order, is_active, drip_enabled,
              DATE_FORMAT(drip_at, '%Y-%m-%d %H:%i:%s') AS drip_at,
              drip_batch_key,
              drip_offset_seconds,
              DATE_FORMAT(drip_notified_at, '%Y-%m-%d %H:%i:%s') AS drip_notified_at,
              created_at, updated_at
       FROM ${MODULES_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [targetModuleId]
    );
    const moduleOut = rows && rows[0] ? rows[0] : null;
    const moduleSchedules = await fetchModuleDripSchedules(pool, targetModuleId);
    return json(200, {
      ok: true,
      module: moduleOut,
      module_drip_schedules: moduleSchedules,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not save module." });
  }
};
