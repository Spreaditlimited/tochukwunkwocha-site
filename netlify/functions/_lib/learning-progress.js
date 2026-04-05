const { nowSql } = require("./db");
const { MODULES_TABLE, LESSONS_TABLE, VIDEO_ASSETS_TABLE, ensureLearningTables } = require("./learning");
const { hasSchoolCourseAccess, getSchoolCourseAccessState, SCHOOL_ACCOUNTS_TABLE, SCHOOL_STUDENTS_TABLE } = require("./schools");

const LESSON_PROGRESS_TABLE = "tochukwu_learning_lesson_progress";

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number.isFinite(fallback) ? fallback : 0;
  return Math.trunc(n);
}

function normKey(value) {
  return clean(value, 300).toLowerCase().replace(/\s+/g, " ").trim();
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (error) {
    const msg = String((error && error.message) || "").toLowerCase();
    if (
      msg.indexOf("duplicate column") !== -1 ||
      msg.indexOf("duplicate key") !== -1 ||
      msg.indexOf("already exists") !== -1 ||
      msg.indexOf("can't drop") !== -1 ||
      msg.indexOf("check that column/key exists") !== -1 ||
      msg.indexOf("unknown column") !== -1
    ) {
      return;
    }
    throw error;
  }
}

async function ensureLearningProgressTables(pool) {
  await ensureLearningTables(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${LESSON_PROGRESS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      account_id BIGINT NOT NULL,
      lesson_id BIGINT NOT NULL,
      module_id BIGINT NOT NULL,
      is_completed TINYINT(1) NOT NULL DEFAULT 0,
      completed_at DATETIME NULL,
      last_watched_at DATETIME NULL,
      watch_seconds INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_learning_lesson_progress (account_id, lesson_id),
      KEY idx_tochukwu_learning_progress_account (account_id, updated_at),
      KEY idx_tochukwu_learning_progress_lesson (lesson_id),
      KEY idx_tochukwu_learning_progress_module (module_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE ${LESSON_PROGRESS_TABLE} ADD COLUMN account_id BIGINT NOT NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSON_PROGRESS_TABLE} ADD COLUMN lesson_id BIGINT NOT NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSON_PROGRESS_TABLE} ADD COLUMN module_id BIGINT NOT NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSON_PROGRESS_TABLE} ADD COLUMN is_completed TINYINT(1) NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE ${LESSON_PROGRESS_TABLE} ADD COLUMN completed_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSON_PROGRESS_TABLE} ADD COLUMN last_watched_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSON_PROGRESS_TABLE} ADD COLUMN watch_seconds INT NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE ${LESSON_PROGRESS_TABLE} ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  await safeAlter(pool, `ALTER TABLE ${LESSON_PROGRESS_TABLE} ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  await safeAlter(pool, `ALTER TABLE ${LESSON_PROGRESS_TABLE} ADD UNIQUE KEY uniq_tochukwu_learning_lesson_progress (account_id, lesson_id)`);
  await safeAlter(pool, `ALTER TABLE ${LESSON_PROGRESS_TABLE} ADD KEY idx_tochukwu_learning_progress_account (account_id, updated_at)`);
  await safeAlter(pool, `ALTER TABLE ${LESSON_PROGRESS_TABLE} ADD KEY idx_tochukwu_learning_progress_lesson (lesson_id)`);
  await safeAlter(pool, `ALTER TABLE ${LESSON_PROGRESS_TABLE} ADD KEY idx_tochukwu_learning_progress_module (module_id)`);
}

async function hasCourseAccess(pool, accountEmail, courseSlug) {
  const access = await getIndividualCourseAccessState(pool, accountEmail, courseSlug);
  if (access && access.allowed) return true;

  const email = clean(accountEmail, 220).toLowerCase();
  const slug = clean(courseSlug, 120).toLowerCase();
  if (!email || !slug) return false;

  try {
    return await hasSchoolCourseAccess(pool, {
      accountId: null,
      email,
      courseSlug: slug,
    });
  } catch (_error) {
    return false;
  }
}

async function getIndividualCourseAccessState(pool, accountEmail, courseSlug) {
  const email = clean(accountEmail, 220).toLowerCase();
  const slug = clean(courseSlug, 120).toLowerCase();
  if (!email || !slug) return { allowed: false, reason: "invalid_input" };

  const [orderRows] = await pool.query(
    `SELECT 1
     FROM course_orders o
     LEFT JOIN course_batches b
       ON b.course_slug COLLATE utf8mb4_general_ci = o.course_slug COLLATE utf8mb4_general_ci
      AND b.batch_key COLLATE utf8mb4_general_ci = o.batch_key COLLATE utf8mb4_general_ci
     WHERE LOWER(o.email) COLLATE utf8mb4_general_ci = ?
       AND o.course_slug = ?
       AND o.status = 'paid'
       AND (
         b.batch_start_at IS NULL
         OR b.batch_start_at <= NOW()
         OR b.id IS NULL
       )
     LIMIT 1`,
    [email, slug]
  );
  if (Array.isArray(orderRows) && orderRows.length > 0) {
    return { allowed: true, reason: "order_open" };
  }

  const [manualRows] = await pool.query(
    `SELECT 1
     FROM course_manual_payments m
     LEFT JOIN course_batches b
       ON b.course_slug COLLATE utf8mb4_general_ci = m.course_slug COLLATE utf8mb4_general_ci
      AND b.batch_key COLLATE utf8mb4_general_ci = m.batch_key COLLATE utf8mb4_general_ci
     WHERE LOWER(m.email) COLLATE utf8mb4_general_ci = ?
       AND m.course_slug = ?
       AND m.status = 'approved'
       AND (
         b.batch_start_at IS NULL
         OR b.batch_start_at <= NOW()
         OR b.id IS NULL
       )
     LIMIT 1`,
    [email, slug]
  );
  if (Array.isArray(manualRows) && manualRows.length > 0) {
    return { allowed: true, reason: "manual_open" };
  }

  const [futureOrderRows] = await pool.query(
    `SELECT DATE_FORMAT(MIN(b.batch_start_at), '%Y-%m-%d %H:%i:%s') AS next_start_at
     FROM course_orders o
     JOIN course_batches b
       ON b.course_slug COLLATE utf8mb4_general_ci = o.course_slug COLLATE utf8mb4_general_ci
      AND b.batch_key COLLATE utf8mb4_general_ci = o.batch_key COLLATE utf8mb4_general_ci
     WHERE LOWER(o.email) COLLATE utf8mb4_general_ci = ?
       AND o.course_slug = ?
       AND o.status = 'paid'
       AND b.batch_start_at > NOW()`,
    [email, slug]
  );
  const [futureManualRows] = await pool.query(
    `SELECT DATE_FORMAT(MIN(b.batch_start_at), '%Y-%m-%d %H:%i:%s') AS next_start_at
     FROM course_manual_payments m
     JOIN course_batches b
       ON b.course_slug COLLATE utf8mb4_general_ci = m.course_slug COLLATE utf8mb4_general_ci
      AND b.batch_key COLLATE utf8mb4_general_ci = m.batch_key COLLATE utf8mb4_general_ci
     WHERE LOWER(m.email) COLLATE utf8mb4_general_ci = ?
       AND m.course_slug = ?
       AND m.status = 'approved'
       AND b.batch_start_at > NOW()`,
    [email, slug]
  );

  const futureStarts = [];
  const orderStart = futureOrderRows && futureOrderRows[0] && futureOrderRows[0].next_start_at
    ? String(futureOrderRows[0].next_start_at)
    : "";
  const manualStart = futureManualRows && futureManualRows[0] && futureManualRows[0].next_start_at
    ? String(futureManualRows[0].next_start_at)
    : "";
  if (orderStart) futureStarts.push(orderStart);
  if (manualStart) futureStarts.push(manualStart);
  futureStarts.sort();
  if (futureStarts.length) {
    return {
      allowed: false,
      reason: "batch_not_started",
      next_start_at: futureStarts[0],
    };
  }

  return { allowed: false, reason: "not_enrolled" };
}

async function getCourseAccessState(pool, input) {
  const accountId = Number(input && input.account_id);
  const accountEmail = clean(input && input.account_email, 220).toLowerCase();
  const courseSlug = clean(input && input.course_slug, 120).toLowerCase();
  if (!accountEmail || !courseSlug) return { allowed: false, reason: "invalid_input" };

  const individual = await getIndividualCourseAccessState(pool, accountEmail, courseSlug);
  if (individual.allowed) return { allowed: true, reason: "individual_open" };

  const school = await getSchoolCourseAccessState(pool, {
    accountId: Number.isFinite(accountId) && accountId > 0 ? accountId : null,
    email: accountEmail,
    courseSlug,
  });
  if (school && school.allowed) return { allowed: true, reason: "school_open" };

  const futureStarts = [];
  if (individual && individual.next_start_at) futureStarts.push(String(individual.next_start_at));
  if (school && school.next_start_at) futureStarts.push(String(school.next_start_at));
  futureStarts.sort();
  if (futureStarts.length) {
    return {
      allowed: false,
      reason: "batch_not_started",
      next_start_at: futureStarts[0],
      error: `Course access begins on ${futureStarts[0]}.`,
    };
  }

  return { allowed: false, reason: "not_enrolled", error: "You do not currently have access to this course." };
}

async function getStudentCourseAccessAudit(pool, input) {
  const accountEmail = clean(input && input.account_email, 220).toLowerCase();
  const courseSlug = clean(input && input.course_slug, 120).toLowerCase();
  if (!accountEmail || !courseSlug) throw new Error("account_email and course_slug are required");

  const [accountRows] = await pool.query(
    `SELECT id, full_name, email
     FROM student_accounts
     WHERE LOWER(email) COLLATE utf8mb4_general_ci = ?
     LIMIT 1`,
    [accountEmail]
  );
  const account = Array.isArray(accountRows) && accountRows.length ? accountRows[0] : null;
  const accountId = account ? Number(account.id || 0) : null;
  const fullName = account ? clean(account.full_name, 180) : "";

  const [orderRows] = await pool.query(
    `SELECT o.batch_key, o.batch_label, DATE_FORMAT(b.batch_start_at, '%Y-%m-%d %H:%i:%s') AS batch_start_at
     FROM course_orders o
     LEFT JOIN course_batches b
       ON b.course_slug COLLATE utf8mb4_general_ci = o.course_slug COLLATE utf8mb4_general_ci
      AND b.batch_key COLLATE utf8mb4_general_ci = o.batch_key COLLATE utf8mb4_general_ci
     WHERE LOWER(o.email) COLLATE utf8mb4_general_ci = ?
       AND o.course_slug = ?
       AND o.status = 'paid'
     ORDER BY o.id DESC`,
    [accountEmail, courseSlug]
  );
  const [manualRows] = await pool.query(
    `SELECT m.batch_key, m.batch_label, DATE_FORMAT(b.batch_start_at, '%Y-%m-%d %H:%i:%s') AS batch_start_at
     FROM course_manual_payments m
     LEFT JOIN course_batches b
       ON b.course_slug COLLATE utf8mb4_general_ci = m.course_slug COLLATE utf8mb4_general_ci
      AND b.batch_key COLLATE utf8mb4_general_ci = m.batch_key COLLATE utf8mb4_general_ci
     WHERE LOWER(m.email) COLLATE utf8mb4_general_ci = ?
       AND m.course_slug = ?
       AND m.status = 'approved'
     ORDER BY m.id DESC`,
    [accountEmail, courseSlug]
  );
  const [schoolRows] = await pool.query(
    `SELECT sc.school_name,
            DATE_FORMAT(sc.access_starts_at, '%Y-%m-%d %H:%i:%s') AS access_starts_at,
            DATE_FORMAT(sc.access_expires_at, '%Y-%m-%d %H:%i:%s') AS access_expires_at
     FROM ${SCHOOL_STUDENTS_TABLE} ss
     JOIN ${SCHOOL_ACCOUNTS_TABLE} sc ON sc.id = ss.school_id
     WHERE (LOWER(ss.email) COLLATE utf8mb4_general_ci = ? OR (? IS NOT NULL AND ss.account_id = ?))
       AND ss.status = 'active'
       AND sc.status = 'active'
       AND sc.course_slug = ?
     ORDER BY sc.id DESC`,
    [accountEmail, accountId, accountId, courseSlug]
  );

  const access = await getCourseAccessState(pool, {
    account_id: accountId,
    account_email: accountEmail,
    course_slug: courseSlug,
  });

  return {
    email: accountEmail,
    course_slug: courseSlug,
    account: {
      id: accountId,
      full_name: fullName || null,
    },
    access: {
      allowed: !!(access && access.allowed),
      reason: access && access.reason ? access.reason : "unknown",
      message: access && access.error ? access.error : null,
      next_start_at: access && access.next_start_at ? access.next_start_at : null,
    },
    evidence: {
      orders_paid: Array.isArray(orderRows) ? orderRows.map(function (row) {
        return {
          batch_key: clean(row.batch_key, 120) || null,
          batch_label: clean(row.batch_label, 160) || null,
          batch_start_at: row.batch_start_at || null,
        };
      }) : [],
      manual_approved: Array.isArray(manualRows) ? manualRows.map(function (row) {
        return {
          batch_key: clean(row.batch_key, 120) || null,
          batch_label: clean(row.batch_label, 160) || null,
          batch_start_at: row.batch_start_at || null,
        };
      }) : [],
      school_access: Array.isArray(schoolRows) ? schoolRows.map(function (row) {
        return {
          school_name: clean(row.school_name, 220) || null,
          access_starts_at: row.access_starts_at || null,
          access_expires_at: row.access_expires_at || null,
        };
      }) : [],
    },
  };
}

function normalizeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function pickLatestIso(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function buildCanonicalCourseStructure(courseSlug, rows) {
  const moduleMap = new Map();
  const lessonBySourceLessonId = new Map();
  const safeRows = Array.isArray(rows) ? rows : [];

  safeRows.forEach(function (row) {
    const moduleId = Number(row.module_id || 0);
    if (!moduleId) return;
    const moduleSlug = clean(row.module_slug, 160);
    const moduleTitle = clean(row.module_title, 220) || "Module";
    const moduleSort = Number(row.sort_order || 0);
    const moduleKey = [normKey(courseSlug), normKey(moduleTitle) || normKey(moduleSlug) || String(moduleId)].join("::");
    if (!moduleMap.has(moduleKey)) {
      moduleMap.set(moduleKey, {
        module_key: moduleKey,
        module_id: moduleId,
        module_slug: moduleSlug,
        module_title: moduleTitle,
        sort_order: moduleSort,
        lessons_map: new Map(),
      });
    }
    const moduleBucket = moduleMap.get(moduleKey);
    if (moduleId < Number(moduleBucket.module_id || 0)) moduleBucket.module_id = moduleId;
    if (!moduleBucket.module_title && moduleTitle) moduleBucket.module_title = moduleTitle;
    if (!moduleBucket.module_slug && moduleSlug) moduleBucket.module_slug = moduleSlug;
    if (moduleSort < Number(moduleBucket.sort_order || 0)) moduleBucket.sort_order = moduleSort;

    const lessonId = Number(row.lesson_id || 0);
    if (!lessonId) return;
    const lessonSlug = clean(row.lesson_slug, 160);
    const lessonTitle = clean(row.lesson_title, 220) || "Lesson";
    const lessonOrder = Number(row.lesson_order || 0);
    const lessonKey = [
      moduleKey,
      normKey(lessonSlug) || normKey(lessonTitle) || String(lessonId),
      normKey(lessonTitle),
      normKey(row.video_uid),
    ].join("::");

    if (!moduleBucket.lessons_map.has(lessonKey)) {
      moduleBucket.lessons_map.set(lessonKey, {
        canonical_lesson_key: lessonKey,
        lesson_slug: lessonSlug,
        lesson_title: lessonTitle,
        lesson_order: lessonOrder,
        source_lesson_ids: new Set(),
      });
    }
    const lessonBucket = moduleBucket.lessons_map.get(lessonKey);
    if (!lessonBucket.lesson_title && lessonTitle) lessonBucket.lesson_title = lessonTitle;
    if (!lessonBucket.lesson_slug && lessonSlug) lessonBucket.lesson_slug = lessonSlug;
    if (lessonOrder < Number(lessonBucket.lesson_order || 0)) lessonBucket.lesson_order = lessonOrder;
    lessonBucket.source_lesson_ids.add(lessonId);
    lessonBySourceLessonId.set(lessonId, {
      module_key: moduleKey,
      canonical_lesson_key: lessonKey,
      lesson_title: lessonBucket.lesson_title,
    });
  });

  const modules = Array.from(moduleMap.values())
    .map(function (moduleBucket) {
      const lessons = Array.from(moduleBucket.lessons_map.values())
        .map(function (lessonBucket) {
          return {
            canonical_lesson_key: lessonBucket.canonical_lesson_key,
            lesson_slug: lessonBucket.lesson_slug,
            lesson_title: lessonBucket.lesson_title,
            lesson_order: Number(lessonBucket.lesson_order || 0),
            source_lesson_ids: Array.from(lessonBucket.source_lesson_ids.values()),
          };
        })
        .sort(function (a, b) {
          if (a.lesson_order !== b.lesson_order) return a.lesson_order - b.lesson_order;
          return String(a.lesson_title).localeCompare(String(b.lesson_title));
        });
      return {
        module_key: moduleBucket.module_key,
        module_id: Number(moduleBucket.module_id || 0),
        module_slug: moduleBucket.module_slug,
        module_title: moduleBucket.module_title,
        sort_order: Number(moduleBucket.sort_order || 0),
        lessons,
      };
    })
    .sort(function (a, b) {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.module_id - b.module_id;
    });

  const totalLessons = modules.reduce(function (sum, moduleRow) {
    return sum + Number(moduleRow.lessons.length || 0);
  }, 0);

  const moduleByKey = new Map();
  modules.forEach(function (moduleRow) {
    moduleByKey.set(moduleRow.module_key, moduleRow);
  });

  return {
    modules,
    module_by_key: moduleByKey,
    lesson_by_source_lesson_id: lessonBySourceLessonId,
    total_lessons: totalLessons,
  };
}

function toCoursePayload(courseSlug, modules, progressByLessonId) {
  const outModules = [];
  let totalLessons = 0;
  let completedLessons = 0;
  let lastActivityAt = null;

  modules.forEach(function (moduleRow) {
    const lessons = (moduleRow.lessons || []).map(function (lessonRow) {
      const progress = progressByLessonId.get(Number(lessonRow.lesson_id)) || null;
      const completed = !!(progress && Number(progress.is_completed || 0) === 1);
      if (completed) completedLessons += 1;
      totalLessons += 1;

      const watchedAt = progress ? normalizeDate(progress.last_watched_at) : null;
      const completedAt = progress ? normalizeDate(progress.completed_at) : null;
      const latest = watchedAt || completedAt;
      if (latest && (!lastActivityAt || new Date(latest).getTime() > new Date(lastActivityAt).getTime())) {
        lastActivityAt = latest;
      }

      return {
        id: Number(lessonRow.lesson_id),
        slug: clean(lessonRow.lesson_slug, 160),
        title: clean(lessonRow.lesson_title, 220),
        notes: clean(lessonRow.lesson_notes, 4000) || "",
        order: Number(lessonRow.lesson_order || 0),
        video: {
          has_video: !!clean(lessonRow.video_uid, 140),
          filename: clean(lessonRow.filename, 320) || null,
          duration_seconds: Number(lessonRow.duration_seconds || 0) || null,
        },
        progress: {
          is_completed: completed,
          completed_at: completedAt,
          last_watched_at: watchedAt,
          watch_seconds: progress ? Number(progress.watch_seconds || 0) : 0,
        },
      };
    });

    const moduleCompleted = lessons.filter(function (lesson) {
      return lesson.progress.is_completed;
    }).length;

    outModules.push({
      id: Number(moduleRow.module_id),
      slug: clean(moduleRow.module_slug, 160),
      title: clean(moduleRow.module_title, 220),
      description: clean(moduleRow.module_description, 4000) || "",
      sort_order: Number(moduleRow.sort_order || 0),
      progress: {
        completed_lessons: moduleCompleted,
        total_lessons: lessons.length,
        completion_percent: lessons.length ? Math.round((moduleCompleted / lessons.length) * 100) : 0,
      },
      lessons,
    });
  });

  return {
    course_slug: clean(courseSlug, 120),
    modules: outModules,
    progress: {
      completed_lessons: completedLessons,
      total_lessons: totalLessons,
      completion_percent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
      last_activity_at: lastActivityAt,
    },
  };
}

async function listCourseForLearner(pool, input) {
  const accountId = Number(input && input.account_id);
  const accountEmail = clean(input && input.account_email, 220).toLowerCase();
  const courseSlug = clean(input && input.course_slug, 120).toLowerCase();

  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error("Invalid account_id");
  if (!accountEmail) throw new Error("Invalid account_email");
  if (!courseSlug) throw new Error("course_slug is required");

  const accessState = await getCourseAccessState(pool, {
    account_id: accountId,
    account_email: accountEmail,
    course_slug: courseSlug,
  });
  if (!accessState.allowed) {
    return { ok: false, error: accessState.error || "You do not currently have access to this course." };
  }

  const [rows] = await pool.query(
    `SELECT
       m.id AS module_id,
       m.module_slug,
       m.module_title,
       m.module_description,
       m.sort_order,
       l.id AS lesson_id,
       l.lesson_slug,
       l.lesson_title,
       l.lesson_notes,
       l.lesson_order,
       l.video_asset_id,
       a.video_uid,
       a.hls_url,
       a.dash_url,
       a.filename,
       a.duration_seconds
     FROM ${MODULES_TABLE} m
     LEFT JOIN ${LESSONS_TABLE} l ON l.module_id = m.id AND l.is_active = 1
     LEFT JOIN ${VIDEO_ASSETS_TABLE} a ON a.id = l.video_asset_id
     WHERE m.course_slug = ?
       AND m.is_active = 1
       AND (
         COALESCE(m.drip_enabled, 0) = 0
         OR m.drip_at IS NULL
         OR m.drip_at <= NOW()
       )
     ORDER BY m.sort_order ASC, m.id ASC, l.lesson_order ASC, l.id ASC`,
    [courseSlug]
  );

  const byModule = new Map();
  const lessonIds = [];
  (Array.isArray(rows) ? rows : []).forEach(function (row) {
    const moduleId = Number(row.module_id || 0);
    if (!moduleId) return;
    const moduleKey = [
      normKey(courseSlug),
      normKey(row.module_title) || normKey(row.module_slug),
    ].join("::");
    if (!byModule.has(moduleKey)) {
      byModule.set(moduleKey, {
        module_id: moduleId,
        module_slug: row.module_slug,
        module_title: row.module_title,
        module_description: row.module_description,
        sort_order: Number(row.sort_order || 0),
        lessons: [],
        _lessonKeySet: new Set(),
      });
    }
    const moduleBucket = byModule.get(moduleKey);
    if (moduleId < Number(moduleBucket.module_id || 0)) moduleBucket.module_id = moduleId;
    if (row.lesson_id) {
      const lessonKey = [
        normKey(row.lesson_slug) || normKey(row.lesson_title),
        normKey(row.lesson_title),
        normKey(row.video_uid),
      ].join("::");
      if (!moduleBucket._lessonKeySet.has(lessonKey)) {
        moduleBucket._lessonKeySet.add(lessonKey);
        moduleBucket.lessons.push(row);
      }
      lessonIds.push(Number(row.lesson_id));
    }
  });

  let progressRows = [];
  if (lessonIds.length) {
    const uniqueIds = Array.from(new Set(lessonIds));
    const placeholders = uniqueIds.map(function () {
      return "?";
    }).join(",");
    const [pRows] = await pool.query(
      `SELECT lesson_id, is_completed, completed_at, last_watched_at, watch_seconds
       FROM ${LESSON_PROGRESS_TABLE}
       WHERE account_id = ?
         AND lesson_id IN (${placeholders})`,
      [accountId].concat(uniqueIds)
    );
    progressRows = Array.isArray(pRows) ? pRows : [];
  }

  const progressByLessonId = new Map();
  progressRows.forEach(function (row) {
    progressByLessonId.set(Number(row.lesson_id), row);
  });

  const modules = Array.from(byModule.values()).map(function (moduleRow) {
    delete moduleRow._lessonKeySet;
    return moduleRow;
  });
  const payload = toCoursePayload(courseSlug, modules, progressByLessonId);

  return {
    ok: true,
    access: true,
    course: payload,
  };
}

async function saveLessonProgress(pool, input) {
  const accountId = Number(input && input.account_id);
  const accountEmail = clean(input && input.account_email, 220).toLowerCase();
  const lessonId = Number(input && input.lesson_id);
  const markComplete = !!(input && input.mark_complete);
  const addWatchSeconds = Math.max(0, toInt(input && input.watch_seconds, 0));

  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error("Invalid account_id");
  if (!accountEmail) throw new Error("Invalid account_email");
  if (!Number.isFinite(lessonId) || lessonId <= 0) throw new Error("lesson_id is required");

  const [lessonRows] = await pool.query(
    `SELECT l.id AS lesson_id, l.module_id, m.course_slug
     FROM ${LESSONS_TABLE} l
     JOIN ${MODULES_TABLE} m ON m.id = l.module_id
     WHERE l.id = ?
       AND l.is_active = 1
       AND m.is_active = 1
     LIMIT 1`,
    [lessonId]
  );
  if (!Array.isArray(lessonRows) || !lessonRows.length) {
    throw new Error("Lesson not found");
  }

  const lesson = lessonRows[0];
  const courseSlug = clean(lesson.course_slug, 120).toLowerCase();
  const moduleId = Number(lesson.module_id || 0);

  const accessState = await getCourseAccessState(pool, {
    account_id: accountId,
    account_email: accountEmail,
    course_slug: courseSlug,
  });
  if (!accessState.allowed) {
    return {
      ok: false,
      statusCode: 403,
      error: accessState.error || "You do not currently have access to this course.",
    };
  }

  const now = nowSql();
  const completedAt = markComplete ? now : null;

  await pool.query(
    `INSERT INTO ${LESSON_PROGRESS_TABLE}
      (account_id, lesson_id, module_id, is_completed, completed_at, last_watched_at, watch_seconds, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      is_completed = GREATEST(is_completed, VALUES(is_completed)),
      completed_at = CASE
        WHEN completed_at IS NULL AND VALUES(is_completed) = 1 THEN VALUES(completed_at)
        ELSE completed_at
      END,
      last_watched_at = VALUES(last_watched_at),
      watch_seconds = GREATEST(0, COALESCE(watch_seconds, 0) + VALUES(watch_seconds)),
      updated_at = VALUES(updated_at)`,
    [
      accountId,
      lessonId,
      moduleId,
      markComplete ? 1 : 0,
      completedAt,
      now,
      addWatchSeconds,
      now,
      now,
    ]
  );

  const fresh = await listCourseForLearner(pool, {
    account_id: accountId,
    account_email: accountEmail,
    course_slug: courseSlug,
  });

  return {
    ok: true,
    course_slug: courseSlug,
    lesson_id: lessonId,
    mark_complete: markComplete,
    progress: fresh && fresh.course ? fresh.course.progress : null,
  };
}

async function listStudentsProgressByCourse(pool, input) {
  const courseSlug = clean(input && input.course_slug, 120).toLowerCase();
  const search = clean(input && input.search, 180).toLowerCase();
  const enrollmentTypeInput = clean(input && input.enrollment_type, 40).toLowerCase();
  const enrollmentType = ["all", "individual", "school"].includes(enrollmentTypeInput) ? enrollmentTypeInput : "all";
  const batchKeyInput = clean(input && input.batch_key, 120).toLowerCase();
  const batchKey = batchKeyInput || "all";
  const normalizedBatchKey = batchKey === "unspecified" ? "" : batchKey;
  if (!courseSlug) throw new Error("course_slug is required");

  const [courseRows] = await pool.query(
    `SELECT
       m.id AS module_id,
       m.module_slug,
       m.module_title,
       m.sort_order,
       l.id AS lesson_id,
       l.lesson_slug,
       l.lesson_title,
       l.lesson_order,
       a.video_uid
     FROM ${MODULES_TABLE} m
     LEFT JOIN ${LESSONS_TABLE} l ON l.module_id = m.id AND l.is_active = 1
     LEFT JOIN ${VIDEO_ASSETS_TABLE} a ON a.id = l.video_asset_id
     WHERE m.course_slug = ?
       AND m.is_active = 1
     ORDER BY m.sort_order ASC, m.id ASC, l.lesson_order ASC, l.id ASC`,
    [courseSlug]
  );
  const canonicalCourse = buildCanonicalCourseStructure(courseSlug, courseRows);
  const totalLessons = Number(canonicalCourse.total_lessons || 0);

  const [studentRows] = await pool.query(
    `SELECT
       COALESCE(sa.id, 0) AS account_id,
       COALESCE(NULLIF(sa.full_name, ''), enrolled.full_name, 'Student') AS full_name,
       enrolled.email,
       enrolled.enrollment_type,
       enrolled.batch_key,
       enrolled.batch_label,
       enrolled.school_name,
       enrolled.first_paid_at,
       COUNT(CASE WHEN m.id IS NOT NULL AND p.is_completed = 1 THEN 1 END) AS completed_lessons,
       MAX(CASE WHEN m.id IS NOT NULL THEN COALESCE(p.last_watched_at, p.completed_at) ELSE NULL END) AS last_activity_at
     FROM (
       SELECT
         x.email,
         x.enrollment_type,
         x.batch_key,
         x.batch_label,
         x.school_name,
         MIN(x.first_paid_at) AS first_paid_at,
         MAX(x.full_name) AS full_name
       FROM (
         SELECT
           LOWER(email) COLLATE utf8mb4_general_ci AS email,
           'individual' AS enrollment_type,
           LOWER(COALESCE(batch_key, '')) COLLATE utf8mb4_general_ci AS batch_key,
           COALESCE(batch_label, 'Unspecified Batch') COLLATE utf8mb4_general_ci AS batch_label,
           '' COLLATE utf8mb4_general_ci AS school_name,
           MIN(paid_at) AS first_paid_at,
           '' COLLATE utf8mb4_general_ci AS full_name
         FROM course_orders
         WHERE course_slug = ?
           AND status = 'paid'
         GROUP BY LOWER(email) COLLATE utf8mb4_general_ci, LOWER(COALESCE(batch_key, '')) COLLATE utf8mb4_general_ci, COALESCE(batch_label, 'Unspecified Batch') COLLATE utf8mb4_general_ci

         UNION ALL

         SELECT
           LOWER(email) COLLATE utf8mb4_general_ci AS email,
           'individual' AS enrollment_type,
           LOWER(COALESCE(batch_key, '')) COLLATE utf8mb4_general_ci AS batch_key,
           COALESCE(batch_label, 'Unspecified Batch') COLLATE utf8mb4_general_ci AS batch_label,
           '' COLLATE utf8mb4_general_ci AS school_name,
           MIN(reviewed_at) AS first_paid_at,
           '' COLLATE utf8mb4_general_ci AS full_name
         FROM course_manual_payments
         WHERE course_slug = ?
           AND status = 'approved'
         GROUP BY LOWER(email) COLLATE utf8mb4_general_ci, LOWER(COALESCE(batch_key, '')) COLLATE utf8mb4_general_ci, COALESCE(batch_label, 'Unspecified Batch') COLLATE utf8mb4_general_ci

         UNION ALL

         SELECT
           LOWER(ss.email) COLLATE utf8mb4_general_ci AS email,
           'school' AS enrollment_type,
           'school' COLLATE utf8mb4_general_ci AS batch_key,
           'School Registration' COLLATE utf8mb4_general_ci AS batch_label,
           COALESCE(sc.school_name, '') COLLATE utf8mb4_general_ci AS school_name,
           MIN(COALESCE(sc.paid_at, ss.created_at)) AS first_paid_at,
           MAX(COALESCE(ss.full_name, '')) COLLATE utf8mb4_general_ci AS full_name
         FROM ${SCHOOL_STUDENTS_TABLE} ss
         JOIN ${SCHOOL_ACCOUNTS_TABLE} sc ON sc.id = ss.school_id
         WHERE sc.course_slug = ?
           AND sc.status = 'active'
           AND ss.status = 'active'
           AND (sc.access_expires_at IS NULL OR sc.access_expires_at >= NOW())
         GROUP BY LOWER(ss.email) COLLATE utf8mb4_general_ci, COALESCE(sc.school_name, '') COLLATE utf8mb4_general_ci
       ) x
       WHERE (? = 'all' OR x.enrollment_type = ?)
         AND (
           ? = 'all'
           OR (? = 'school' AND x.enrollment_type = 'school')
           OR (x.enrollment_type = 'individual' AND COALESCE(x.batch_key, '') = ?)
         )
       GROUP BY x.email, x.enrollment_type, x.batch_key, x.batch_label, x.school_name
     ) enrolled
     LEFT JOIN student_accounts sa ON enrolled.email = LOWER(sa.email) COLLATE utf8mb4_general_ci
     LEFT JOIN ${LESSON_PROGRESS_TABLE} p ON p.account_id = sa.id
     LEFT JOIN ${LESSONS_TABLE} l ON l.id = p.lesson_id
     LEFT JOIN ${MODULES_TABLE} m ON m.id = l.module_id AND m.course_slug = ?
     WHERE (? = ''
       OR LOWER(COALESCE(sa.full_name, enrolled.full_name)) COLLATE utf8mb4_general_ci LIKE CONCAT('%', ?, '%')
       OR LOWER(enrolled.email) COLLATE utf8mb4_general_ci LIKE CONCAT('%', ?, '%')
       OR LOWER(enrolled.school_name) COLLATE utf8mb4_general_ci LIKE CONCAT('%', ?, '%'))
     GROUP BY
       sa.id, sa.full_name, enrolled.email, enrolled.enrollment_type, enrolled.batch_key,
       enrolled.batch_label, enrolled.school_name, enrolled.full_name, enrolled.first_paid_at
     ORDER BY COALESCE(MAX(COALESCE(p.last_watched_at, p.completed_at)), enrolled.first_paid_at) DESC, enrolled.email ASC`,
    [
      courseSlug,
      courseSlug,
      courseSlug,
      enrollmentType,
      enrollmentType,
      batchKey,
      batchKey,
      normalizedBatchKey,
      courseSlug,
      search,
      search,
      search,
      search,
    ]
  );

  const students = (Array.isArray(studentRows) ? studentRows : []).map(function (row) {
    const normalizedType = clean(row.enrollment_type, 30).toLowerCase() === "school" ? "school" : "individual";
    const normalizedBatch = clean(row.batch_key, 120).toLowerCase();
    return {
      account_id: Number(row.account_id || 0) || null,
      full_name: clean(row.full_name, 180),
      email: clean(row.email, 220),
      enrollment_type: normalizedType,
      batch_key: normalizedType === "school" ? "school" : (normalizedBatch || "unspecified"),
      batch_label: normalizedType === "school" ? "School Registration" : (clean(row.batch_label, 120) || "Unspecified Batch"),
      school_name: clean(row.school_name, 220),
      first_paid_at: normalizeDate(row.first_paid_at),
      completed_lessons: 0,
      total_lessons: totalLessons,
      completion_percent: 0,
      last_activity_at: normalizeDate(row.last_activity_at),
      last_watched_lesson_title: "",
      last_watched_at: null,
      module_breakdown: [],
    };
  });

  const accountIds = students.map(function (row) {
    return Number(row.account_id || 0);
  }).filter(function (id) {
    return Number.isFinite(id) && id > 0;
  });
  const canonicalModules = canonicalCourse.modules.map(function (moduleRow) {
    return {
      module_id: Number(moduleRow.module_id || 0),
      module_title: clean(moduleRow.module_title, 220),
      total_lessons: Number((moduleRow.lessons || []).length || 0),
    };
  });

  const completedLessonKeysByAccount = new Map();
  const completedLessonKeysByAccountModule = new Map();
  const lastWatchedByAccount = new Map();

  if (accountIds.length) {
    const placeholders = accountIds.map(function () {
      return "?";
    }).join(",");
    const [progressRows] = await pool.query(
      `SELECT
         p.account_id,
         p.lesson_id,
         p.is_completed,
         l.lesson_title,
         COALESCE(p.last_watched_at, p.completed_at, p.updated_at) AS watched_at
       FROM ${LESSON_PROGRESS_TABLE} p
       JOIN ${LESSONS_TABLE} l ON l.id = p.lesson_id AND l.is_active = 1
       JOIN ${MODULES_TABLE} m ON m.id = l.module_id AND m.is_active = 1
       WHERE m.course_slug = ?
         AND p.account_id IN (${placeholders})
       ORDER BY p.account_id ASC, COALESCE(p.last_watched_at, p.completed_at, p.updated_at) DESC, p.lesson_id DESC`,
      [courseSlug].concat(accountIds)
    );

    (Array.isArray(progressRows) ? progressRows : []).forEach(function (row) {
      const accountId = Number(row.account_id || 0);
      const sourceLessonId = Number(row.lesson_id || 0);
      if (!accountId || !sourceLessonId) return;
      const canonical = canonicalCourse.lesson_by_source_lesson_id.get(sourceLessonId);
      if (!canonical) return;

      const watchedAt = normalizeDate(row.watched_at);
      const existingLast = lastWatchedByAccount.get(accountId) || null;
      if (!existingLast || (watchedAt && new Date(watchedAt).getTime() > new Date(existingLast.watched_at || 0).getTime())) {
        lastWatchedByAccount.set(accountId, {
          lesson_title: clean(canonical.lesson_title || row.lesson_title, 220),
          watched_at: watchedAt,
        });
      }

      if (Number(row.is_completed || 0) !== 1) return;
      const accountKey = String(accountId);
      const moduleBucket = canonicalCourse.module_by_key.get(canonical.module_key);
      if (!moduleBucket) return;
      const accountModuleKey = accountKey + "::" + String(moduleBucket.module_id);

      if (!completedLessonKeysByAccount.has(accountKey)) completedLessonKeysByAccount.set(accountKey, new Set());
      completedLessonKeysByAccount.get(accountKey).add(canonical.canonical_lesson_key);

      if (!completedLessonKeysByAccountModule.has(accountModuleKey)) completedLessonKeysByAccountModule.set(accountModuleKey, new Set());
      completedLessonKeysByAccountModule.get(accountModuleKey).add(canonical.canonical_lesson_key);
    });
  }

  students.forEach(function (student) {
    const accountId = Number(student.account_id || 0);
    const accountKey = String(accountId);
    const last = lastWatchedByAccount.get(accountId) || null;
    const completedSet = completedLessonKeysByAccount.get(accountKey) || new Set();
    const completedLessons = Number(completedSet.size || 0);

    student.completed_lessons = completedLessons;
    student.total_lessons = totalLessons;
    student.completion_percent = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;
    student.last_watched_lesson_title = last ? clean(last.lesson_title, 220) : "";
    student.last_watched_at = last ? last.watched_at : null;
    student.module_breakdown = canonicalModules.map(function (moduleRow) {
      const key = String(accountId) + "::" + String(moduleRow.module_id);
      const completed = Number((completedLessonKeysByAccountModule.get(key) || new Set()).size || 0);
      const total = Number(moduleRow.total_lessons || 0);
      return {
        module_id: moduleRow.module_id,
        module_title: moduleRow.module_title,
        completed_lessons: completed,
        total_lessons: total,
        completion_percent: total ? Math.round((completed / total) * 100) : 0,
      };
    });
  });

  const [batchRows] = await pool.query(
    `SELECT DISTINCT batch_key, batch_label
     FROM (
       SELECT LOWER(COALESCE(batch_key, '')) COLLATE utf8mb4_general_ci AS batch_key,
              COALESCE(batch_label, 'Unspecified Batch') COLLATE utf8mb4_general_ci AS batch_label
       FROM course_orders
       WHERE course_slug = ?
         AND status = 'paid'
       UNION
       SELECT LOWER(COALESCE(batch_key, '')) COLLATE utf8mb4_general_ci AS batch_key,
              COALESCE(batch_label, 'Unspecified Batch') COLLATE utf8mb4_general_ci AS batch_label
       FROM course_manual_payments
       WHERE course_slug = ?
         AND status = 'approved'
     ) b
     ORDER BY batch_label ASC, batch_key ASC`,
    [courseSlug, courseSlug]
  );
  const [schoolRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM ${SCHOOL_STUDENTS_TABLE} ss
     JOIN ${SCHOOL_ACCOUNTS_TABLE} sc ON sc.id = ss.school_id
     WHERE sc.course_slug = ?
       AND sc.status = 'active'
       AND ss.status = 'active'
       AND (sc.access_expires_at IS NULL OR sc.access_expires_at >= NOW())`,
    [courseSlug]
  );
  const schoolCount = Number(schoolRows && schoolRows[0] && schoolRows[0].total || 0);
  const availableBatches = [{ key: "all", label: "All Batches" }];
  (Array.isArray(batchRows) ? batchRows : []).forEach(function (row) {
    const key = clean(row.batch_key, 120).toLowerCase() || "unspecified";
    if (key === "all") return;
    if (availableBatches.some(function (item) { return item.key === key; })) return;
    availableBatches.push({
      key,
      label: clean(row.batch_label, 120) || "Unspecified Batch",
    });
  });
  if (schoolCount > 0) {
    availableBatches.push({ key: "school", label: "School Registration" });
  }

  return {
    course_slug: courseSlug,
    total_lessons: totalLessons,
    filters: {
      enrollment_type: enrollmentType,
      batch_key: batchKey,
      available_enrollment_types: [
        { key: "all", label: "All Enrollments" },
        { key: "individual", label: "Individual" },
        { key: "school", label: "School Registration" },
      ],
      available_batches: availableBatches,
    },
    students,
  };
}

async function getStudentCourseProgressDetail(pool, input) {
  const courseSlug = clean(input && input.course_slug, 120).toLowerCase();
  const accountId = Number(input && input.account_id);
  const emailInput = clean(input && input.email, 220).toLowerCase();
  if (!courseSlug) throw new Error("course_slug is required");
  if ((!Number.isFinite(accountId) || accountId <= 0) && !emailInput) throw new Error("account_id or email is required");

  let student = null;
  let resolutionBranch = null;
  let notFoundReason = "unresolved";
  if (Number.isFinite(accountId) && accountId > 0) {
    const [studentRows] = await pool.query(
      `SELECT id, full_name, email
       FROM student_accounts
       WHERE id = ?
       LIMIT 1`,
      [accountId]
    );
    if (Array.isArray(studentRows) && studentRows.length) {
      student = {
        account_id: Number(studentRows[0].id || 0) || null,
        full_name: clean(studentRows[0].full_name, 180),
        email: clean(studentRows[0].email, 220).toLowerCase(),
        enrollment_type: "individual",
        school_name: "",
      };
      resolutionBranch = "account_id";
    } else {
      notFoundReason = "account_id_not_found";
    }
  }
  if (!student && emailInput) {
    const [studentRowsByEmail] = await pool.query(
      `SELECT id, full_name, email
       FROM student_accounts
       WHERE LOWER(email) = ?
       LIMIT 1`,
      [emailInput]
    );
    if (Array.isArray(studentRowsByEmail) && studentRowsByEmail.length) {
      student = {
        account_id: Number(studentRowsByEmail[0].id || 0) || null,
        full_name: clean(studentRowsByEmail[0].full_name, 180),
        email: clean(studentRowsByEmail[0].email, 220).toLowerCase(),
        enrollment_type: "individual",
        school_name: "",
      };
      resolutionBranch = "email_to_student_accounts";
    } else {
      notFoundReason = "email_not_in_student_accounts";
    }
  }
  if (!student && emailInput) {
    const [schoolRows] = await pool.query(
      `SELECT ss.full_name, ss.email, sc.school_name
       FROM ${SCHOOL_STUDENTS_TABLE} ss
       JOIN ${SCHOOL_ACCOUNTS_TABLE} sc ON sc.id = ss.school_id
       WHERE LOWER(ss.email) = ?
         AND sc.course_slug = ?
         AND sc.status = 'active'
         AND ss.status = 'active'
         AND (sc.access_expires_at IS NULL OR sc.access_expires_at >= NOW())
       ORDER BY ss.id DESC
       LIMIT 1`,
      [emailInput, courseSlug]
    );
    if (Array.isArray(schoolRows) && schoolRows.length) {
      student = {
        account_id: null,
        full_name: clean(schoolRows[0].full_name, 180),
        email: clean(schoolRows[0].email, 220).toLowerCase(),
        enrollment_type: "school",
        school_name: clean(schoolRows[0].school_name, 220),
      };
      resolutionBranch = "email_to_school_students";
    } else {
      notFoundReason = "email_not_in_school_students";
    }
  }
  if (!student && emailInput) {
    const [individualEnrollmentRows] = await pool.query(
      `SELECT full_name, email
       FROM (
         SELECT '' AS full_name, LOWER(email) AS email
         FROM course_orders
         WHERE course_slug = ?
           AND status = 'paid'
           AND LOWER(email) = ?
         UNION ALL
         SELECT COALESCE(first_name, '') AS full_name, LOWER(email) AS email
         FROM course_manual_payments
         WHERE course_slug = ?
           AND status = 'approved'
           AND LOWER(email) = ?
       ) enrolled
       ORDER BY CASE WHEN full_name <> '' THEN 0 ELSE 1 END
       LIMIT 1`,
      [courseSlug, emailInput, courseSlug, emailInput]
    );
    if (Array.isArray(individualEnrollmentRows) && individualEnrollmentRows.length) {
      student = {
        account_id: null,
        full_name: clean(individualEnrollmentRows[0].full_name, 180) || "Student",
        email: clean(individualEnrollmentRows[0].email, 220).toLowerCase(),
        enrollment_type: "individual",
        school_name: "",
      };
      resolutionBranch = "email_to_individual_enrollments";
    } else {
      notFoundReason = "email_not_in_individual_enrollments";
    }
  }
  if (!student) {
    const error = new Error("Student not found");
    error.code = "NOT_FOUND";
    error.reason = notFoundReason;
    throw error;
  }

  const progressAccountId = Number(student.account_id || 0);

  const [rows] = await pool.query(
    `SELECT
       m.id AS module_id,
       m.module_slug,
       m.module_title,
       m.sort_order,
       l.id AS lesson_id,
       l.lesson_slug,
       l.lesson_title,
       l.lesson_order,
       a.video_uid,
       p.is_completed,
       p.completed_at,
       p.last_watched_at,
       p.watch_seconds
     FROM ${MODULES_TABLE} m
     LEFT JOIN ${LESSONS_TABLE} l ON l.module_id = m.id AND l.is_active = 1
     LEFT JOIN ${VIDEO_ASSETS_TABLE} a ON a.id = l.video_asset_id
     LEFT JOIN ${LESSON_PROGRESS_TABLE} p ON p.lesson_id = l.id AND p.account_id = ?
     WHERE m.course_slug = ?
       AND m.is_active = 1
     ORDER BY m.sort_order ASC, m.id ASC, l.lesson_order ASC, l.id ASC`,
    [progressAccountId > 0 ? progressAccountId : 0, courseSlug]
  );

  const canonicalCourse = buildCanonicalCourseStructure(courseSlug, rows);
  const lessonProgressByCanonicalKey = new Map();

  (Array.isArray(rows) ? rows : []).forEach(function (row) {
    const sourceLessonId = Number(row.lesson_id || 0);
    if (!sourceLessonId) return;
    const canonical = canonicalCourse.lesson_by_source_lesson_id.get(sourceLessonId);
    if (!canonical) return;
    const key = canonical.canonical_lesson_key;
    const prev = lessonProgressByCanonicalKey.get(key) || {
      is_completed: false,
      completed_at: null,
      last_watched_at: null,
      watch_seconds: 0,
    };
    const completedAt = normalizeDate(row.completed_at);
    const watchedAt = normalizeDate(row.last_watched_at);
    lessonProgressByCanonicalKey.set(key, {
      is_completed: prev.is_completed || Number(row.is_completed || 0) === 1,
      completed_at: pickLatestIso(prev.completed_at, completedAt),
      last_watched_at: pickLatestIso(prev.last_watched_at, watchedAt),
      watch_seconds: Math.max(Number(prev.watch_seconds || 0), Number(row.watch_seconds || 0)),
    });
  });

  const modules = canonicalCourse.modules.map(function (moduleRow) {
    const lessons = (moduleRow.lessons || []).map(function (canonicalLesson, lessonIndex) {
      const progress = lessonProgressByCanonicalKey.get(canonicalLesson.canonical_lesson_key) || null;
      return {
        lesson_id: Number((canonicalLesson.source_lesson_ids && canonicalLesson.source_lesson_ids[0]) || 0),
        lesson_title: clean(canonicalLesson.lesson_title, 220),
        lesson_order: Number(canonicalLesson.lesson_order || lessonIndex + 1),
        is_completed: !!(progress && progress.is_completed),
        completed_at: progress ? progress.completed_at : null,
        last_watched_at: progress ? progress.last_watched_at : null,
        watch_seconds: progress ? Number(progress.watch_seconds || 0) : 0,
      };
    });

    const completed = lessons.filter(function (lesson) {
      return lesson.is_completed;
    }).length;
    return {
      module_id: Number(moduleRow.module_id || 0),
      module_slug: clean(moduleRow.module_slug, 160),
      module_title: clean(moduleRow.module_title, 220),
      sort_order: Number(moduleRow.sort_order || 0),
      progress: {
        completed_lessons: completed,
        total_lessons: lessons.length,
        completion_percent: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
      },
      lessons,
    };
  });

  const totalLessons = modules.reduce(function (sum, moduleRow) {
    return sum + Number(moduleRow.progress.total_lessons || 0);
  }, 0);
  const completedLessons = modules.reduce(function (sum, moduleRow) {
    return sum + Number(moduleRow.progress.completed_lessons || 0);
  }, 0);
  const lastActivity = modules
    .flatMap(function (moduleRow) {
      return moduleRow.lessons.map(function (lesson) {
        return lesson.last_watched_at || lesson.completed_at || null;
      });
    })
    .filter(Boolean)
    .sort()
    .pop() || null;
  const lastWatchedLesson = modules
    .flatMap(function (moduleRow) {
      return moduleRow.lessons.map(function (lesson) {
        return {
          title: lesson.lesson_title,
          watched_at: lesson.last_watched_at || lesson.completed_at || null,
        };
      });
    })
    .filter(function (row) {
      return !!row.watched_at;
    })
    .sort(function (a, b) {
      return new Date(a.watched_at).getTime() - new Date(b.watched_at).getTime();
    })
    .pop() || null;

  return {
    course_slug: courseSlug,
    student,
    _resolution_branch: resolutionBranch,
    progress: {
      completed_lessons: completedLessons,
      total_lessons: totalLessons,
      completion_percent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
      last_activity_at: lastActivity,
      last_watched_lesson_title: lastWatchedLesson ? clean(lastWatchedLesson.title, 220) : "",
      last_watched_at: lastWatchedLesson ? lastWatchedLesson.watched_at : null,
    },
    modules,
  };
}

module.exports = {
  LESSON_PROGRESS_TABLE,
  ensureLearningProgressTables,
  hasCourseAccess,
  listCourseForLearner,
  saveLessonProgress,
  getStudentCourseAccessAudit,
  listStudentsProgressByCourse,
  getStudentCourseProgressDetail,
};
