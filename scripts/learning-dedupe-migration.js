#!/usr/bin/env node
const { getPool } = require("../netlify/functions/_lib/db");
const { ensureLearningTables, MODULES_TABLE, LESSONS_TABLE } = require("../netlify/functions/_lib/learning");
const { ensureLearningProgressTables, LESSON_PROGRESS_TABLE } = require("../netlify/functions/_lib/learning-progress");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function norm(value) {
  return clean(value, 220).toLowerCase().replace(/\s+/g, " ").trim();
}

function moduleGroupKey(row) {
  return [norm(row.course_slug), norm(row.module_slug) || norm(row.module_title)].join("::");
}

function uniqueLessonSlug(existing, baseSlug, lessonId) {
  const start = clean(baseSlug, 140) || "lesson-" + String(lessonId || 0);
  let candidate = start;
  let i = 1;
  while (existing.has(candidate)) {
    candidate = start + "-dup-" + String(i);
    i += 1;
  }
  return candidate;
}

async function loadModules(pool) {
  const [rows] = await pool.query(
    `SELECT id, course_slug, module_slug, module_title, sort_order, is_active
     FROM ${MODULES_TABLE}
     ORDER BY course_slug ASC, sort_order ASC, id ASC`
  );
  return Array.isArray(rows) ? rows : [];
}

async function loadLessonsByModuleIds(pool, moduleIds) {
  if (!moduleIds.length) return [];
  const placeholders = moduleIds.map(function () {
    return "?";
  }).join(",");
  const [rows] = await pool.query(
    `SELECT id, module_id, lesson_slug, lesson_title, lesson_order, video_asset_id, is_active
     FROM ${LESSONS_TABLE}
     WHERE module_id IN (${placeholders})
     ORDER BY module_id ASC, lesson_order ASC, id ASC`,
    moduleIds
  );
  return Array.isArray(rows) ? rows : [];
}

function buildPlan(modules, lessons) {
  const lessonByModule = new Map();
  lessons.forEach(function (lesson) {
    const moduleId = Number(lesson.module_id || 0);
    if (!lessonByModule.has(moduleId)) lessonByModule.set(moduleId, []);
    lessonByModule.get(moduleId).push(lesson);
  });

  const groups = new Map();
  modules.forEach(function (moduleRow) {
    const key = moduleGroupKey(moduleRow);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(moduleRow);
  });

  const actions = [];
  groups.forEach(function (group) {
    if (!Array.isArray(group) || group.length < 2) return;
    const sorted = group.slice().sort(function (a, b) {
      return Number(a.id || 0) - Number(b.id || 0);
    });
    const canonical = sorted[0];
    const duplicates = sorted.slice(1);

    const canonicalLessons = (lessonByModule.get(Number(canonical.id)) || []).slice();
    const usedSlugs = new Set(
      canonicalLessons.map(function (lesson) {
        return clean(lesson.lesson_slug, 160);
      }).filter(Boolean)
    );

    duplicates.forEach(function (dupModule) {
      const duplicateLessons = lessonByModule.get(Number(dupModule.id)) || [];
      duplicateLessons.forEach(function (lesson) {
        const oldSlug = clean(lesson.lesson_slug, 160);
        const targetSlug = uniqueLessonSlug(usedSlugs, oldSlug, Number(lesson.id || 0));
        usedSlugs.add(targetSlug);
        actions.push({
          type: "move_lesson",
          lesson_id: Number(lesson.id),
          from_module_id: Number(dupModule.id),
          to_module_id: Number(canonical.id),
          old_slug: oldSlug,
          new_slug: targetSlug,
          rename_slug: oldSlug !== targetSlug,
        });
      });

      actions.push({
        type: "deactivate_module",
        module_id: Number(dupModule.id),
        canonical_module_id: Number(canonical.id),
        module_title: clean(dupModule.module_title, 220),
      });
    });
  });

  const moveActions = actions.filter(function (a) {
    return a.type === "move_lesson";
  });
  const moduleActions = actions.filter(function (a) {
    return a.type === "deactivate_module";
  });

  return {
    actions,
    summary: {
      duplicate_module_count: moduleActions.length,
      moved_lesson_count: moveActions.length,
      renamed_lesson_slug_count: moveActions.filter(function (a) {
        return !!a.rename_slug;
      }).length,
    },
  };
}

async function applyPlan(pool, plan) {
  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  if (!actions.length) return { applied: 0 };

  const conn = await pool.getConnection();
  let applied = 0;
  try {
    await conn.beginTransaction();

    for (const action of actions) {
      if (action.type === "move_lesson") {
        await conn.query(
          `UPDATE ${LESSONS_TABLE}
           SET module_id = ?, lesson_slug = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?
           LIMIT 1`,
          [Number(action.to_module_id), clean(action.new_slug, 160), Number(action.lesson_id)]
        );
        await conn.query(
          `UPDATE ${LESSON_PROGRESS_TABLE}
           SET module_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE lesson_id = ?`,
          [Number(action.to_module_id), Number(action.lesson_id)]
        );
        applied += 1;
        continue;
      }

      if (action.type === "deactivate_module") {
        const suffix = " [merged into #" + String(Number(action.canonical_module_id)) + "]";
        await conn.query(
          `UPDATE ${MODULES_TABLE}
           SET is_active = 0,
               module_title = LEFT(CONCAT(TRIM(module_title), ?), 220),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?
           LIMIT 1`,
          [suffix, Number(action.module_id)]
        );
        applied += 1;
      }
    }

    await conn.commit();
    return { applied };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function main() {
  const applyMode = process.argv.includes("--apply");
  const pool = getPool();
  try {
    await ensureLearningTables(pool);
    await ensureLearningProgressTables(pool);

    const modules = await loadModules(pool);
    const moduleIds = modules.map(function (row) {
      return Number(row.id || 0);
    }).filter(function (id) {
      return id > 0;
    });
    const lessons = await loadLessonsByModuleIds(pool, moduleIds);
    const plan = buildPlan(modules, lessons);

    console.log(JSON.stringify({
      mode: applyMode ? "apply" : "dry-run",
      summary: plan.summary,
      preview: plan.actions.slice(0, 25),
      remaining_actions: Math.max(0, Number(plan.actions.length || 0) - 25),
    }, null, 2));

    if (!applyMode) {
      console.log("Dry run only. Re-run with --apply to execute this migration plan.");
      return;
    }

    const result = await applyPlan(pool, plan);
    console.log(JSON.stringify({ ok: true, applied_actions: result.applied }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch(function (error) {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});
