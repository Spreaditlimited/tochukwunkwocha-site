const { nowSql } = require("./db");
const { MODULES_TABLE, LESSONS_TABLE, VIDEO_ASSETS_TABLE, ensureLearningTables } = require("./learning");
const { hasSchoolCourseAccess } = require("./schools");

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
  const email = clean(accountEmail, 220).toLowerCase();
  const slug = clean(courseSlug, 120).toLowerCase();
  if (!email || !slug) return false;

  const [orderRows] = await pool.query(
    `SELECT 1
     FROM course_orders
     WHERE email = ?
       AND course_slug = ?
       AND status = 'paid'
     LIMIT 1`,
    [email, slug]
  );
  if (Array.isArray(orderRows) && orderRows.length) return true;

  const [manualRows] = await pool.query(
    `SELECT 1
     FROM course_manual_payments
     WHERE email = ?
       AND course_slug = ?
       AND status = 'approved'
     LIMIT 1`,
    [email, slug]
  );

  if (Array.isArray(manualRows) && manualRows.length > 0) return true;

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

function normalizeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
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
        order: Number(lessonRow.lesson_order || 0),
        video: {
          uid: clean(lessonRow.video_uid, 140) || null,
          hls_url: clean(lessonRow.hls_url, 1200) || null,
          dash_url: clean(lessonRow.dash_url, 1200) || null,
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

  const access =
    (await hasCourseAccess(pool, accountEmail, courseSlug)) ||
    (await hasSchoolCourseAccess(pool, {
      accountId,
      email: accountEmail,
      courseSlug,
    }));
  if (!access) {
    return { ok: false, error: "You do not currently have access to this course." };
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

  const access = await hasCourseAccess(pool, accountEmail, courseSlug);
  if (!access) {
    return { ok: false, statusCode: 403, error: "You do not currently have access to this course." };
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
  if (!courseSlug) throw new Error("course_slug is required");

  const [totalRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM ${LESSONS_TABLE} l
     JOIN ${MODULES_TABLE} m ON m.id = l.module_id
     WHERE m.course_slug = ?
       AND m.is_active = 1
       AND l.is_active = 1`,
    [courseSlug]
  );
  const totalLessons = Number(totalRows && totalRows[0] && totalRows[0].total ? totalRows[0].total : 0);

  const [studentRows] = await pool.query(
    `SELECT
       sa.id AS account_id,
       sa.full_name,
       sa.email,
       enrolled.first_paid_at,
       COUNT(CASE WHEN m.id IS NOT NULL AND p.is_completed = 1 THEN 1 END) AS completed_lessons,
       MAX(CASE WHEN m.id IS NOT NULL THEN COALESCE(p.last_watched_at, p.completed_at) ELSE NULL END) AS last_activity_at
     FROM student_accounts sa
     JOIN (
       SELECT email, MIN(first_paid_at) AS first_paid_at
       FROM (
         SELECT LOWER(email) AS email, MIN(paid_at) AS first_paid_at
         FROM course_orders
         WHERE course_slug = ?
           AND status = 'paid'
         GROUP BY LOWER(email)

         UNION ALL

         SELECT LOWER(email) AS email, MIN(reviewed_at) AS first_paid_at
         FROM course_manual_payments
         WHERE course_slug = ?
           AND status = 'approved'
         GROUP BY LOWER(email)
       ) x
       GROUP BY email
     ) enrolled ON enrolled.email = LOWER(sa.email)
     LEFT JOIN ${LESSON_PROGRESS_TABLE} p ON p.account_id = sa.id
     LEFT JOIN ${LESSONS_TABLE} l ON l.id = p.lesson_id
     LEFT JOIN ${MODULES_TABLE} m ON m.id = l.module_id AND m.course_slug = ?
     WHERE (? = '' OR LOWER(sa.full_name) LIKE CONCAT('%', ?, '%') OR LOWER(sa.email) LIKE CONCAT('%', ?, '%'))
     GROUP BY sa.id, sa.full_name, sa.email, enrolled.first_paid_at
     ORDER BY COALESCE(MAX(COALESCE(p.last_watched_at, p.completed_at)), enrolled.first_paid_at) DESC, sa.id DESC`,
    [courseSlug, courseSlug, courseSlug, search, search, search]
  );

  const students = (Array.isArray(studentRows) ? studentRows : []).map(function (row) {
    const completed = Number(row.completed_lessons || 0);
    return {
      account_id: Number(row.account_id),
      full_name: clean(row.full_name, 180),
      email: clean(row.email, 220),
      first_paid_at: normalizeDate(row.first_paid_at),
      completed_lessons: completed,
      total_lessons: totalLessons,
      completion_percent: totalLessons ? Math.round((completed / totalLessons) * 100) : 0,
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
  if (!accountIds.length) {
    return { course_slug: courseSlug, total_lessons: totalLessons, students };
  }

  const placeholders = accountIds.map(function () {
    return "?";
  }).join(",");

  const [lastWatchedRows] = await pool.query(
    `SELECT
       p.account_id,
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
  const lastWatchedByAccount = new Map();
  (Array.isArray(lastWatchedRows) ? lastWatchedRows : []).forEach(function (row) {
    const accountId = Number(row.account_id || 0);
    if (!accountId || lastWatchedByAccount.has(accountId)) return;
    lastWatchedByAccount.set(accountId, {
      lesson_title: clean(row.lesson_title, 220),
      watched_at: normalizeDate(row.watched_at),
    });
  });

  const [moduleRows] = await pool.query(
    `SELECT
       m.id AS module_id,
       m.module_title,
       COUNT(l.id) AS total_lessons
     FROM ${MODULES_TABLE} m
     JOIN ${LESSONS_TABLE} l ON l.module_id = m.id AND l.is_active = 1
     WHERE m.course_slug = ?
       AND m.is_active = 1
     GROUP BY m.id, m.module_title
     ORDER BY m.sort_order ASC, m.id ASC`,
    [courseSlug]
  );
  const modules = (Array.isArray(moduleRows) ? moduleRows : []).map(function (row) {
    return {
      module_id: Number(row.module_id || 0),
      module_title: clean(row.module_title, 220),
      total_lessons: Number(row.total_lessons || 0),
    };
  });

  const [completedByModuleRows] = await pool.query(
    `SELECT
       p.account_id,
       l.module_id,
       SUM(CASE WHEN p.is_completed = 1 THEN 1 ELSE 0 END) AS completed_lessons
     FROM ${LESSON_PROGRESS_TABLE} p
     JOIN ${LESSONS_TABLE} l ON l.id = p.lesson_id AND l.is_active = 1
     JOIN ${MODULES_TABLE} m ON m.id = l.module_id AND m.is_active = 1
     WHERE m.course_slug = ?
       AND p.account_id IN (${placeholders})
     GROUP BY p.account_id, l.module_id`,
    [courseSlug].concat(accountIds)
  );

  const completedByKey = new Map();
  (Array.isArray(completedByModuleRows) ? completedByModuleRows : []).forEach(function (row) {
    const key = String(Number(row.account_id || 0)) + "::" + String(Number(row.module_id || 0));
    completedByKey.set(key, Number(row.completed_lessons || 0));
  });

  students.forEach(function (student) {
    const accountId = Number(student.account_id || 0);
    const last = lastWatchedByAccount.get(accountId) || null;
    student.last_watched_lesson_title = last ? clean(last.lesson_title, 220) : "";
    student.last_watched_at = last ? last.watched_at : null;
    student.module_breakdown = modules.map(function (moduleRow) {
      const key = String(accountId) + "::" + String(moduleRow.module_id);
      const completed = Number(completedByKey.get(key) || 0);
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

  return { course_slug: courseSlug, total_lessons: totalLessons, students };
}

async function getStudentCourseProgressDetail(pool, input) {
  const courseSlug = clean(input && input.course_slug, 120).toLowerCase();
  const accountId = Number(input && input.account_id);
  if (!courseSlug) throw new Error("course_slug is required");
  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error("account_id is required");

  const [studentRows] = await pool.query(
    `SELECT id, full_name, email
     FROM student_accounts
     WHERE id = ?
     LIMIT 1`,
    [accountId]
  );
  if (!Array.isArray(studentRows) || !studentRows.length) throw new Error("Student not found");

  const [rows] = await pool.query(
    `SELECT
       m.id AS module_id,
       m.module_slug,
       m.module_title,
       m.sort_order,
       l.id AS lesson_id,
       l.lesson_title,
       l.lesson_order,
       p.is_completed,
       p.completed_at,
       p.last_watched_at,
       p.watch_seconds
     FROM ${MODULES_TABLE} m
     LEFT JOIN ${LESSONS_TABLE} l ON l.module_id = m.id AND l.is_active = 1
     LEFT JOIN ${LESSON_PROGRESS_TABLE} p ON p.lesson_id = l.id AND p.account_id = ?
     WHERE m.course_slug = ?
       AND m.is_active = 1
     ORDER BY m.sort_order ASC, m.id ASC, l.lesson_order ASC, l.id ASC`,
    [accountId, courseSlug]
  );

  const modulesMap = new Map();
  (Array.isArray(rows) ? rows : []).forEach(function (row) {
    const moduleId = Number(row.module_id || 0);
    if (!moduleId) return;
    if (!modulesMap.has(moduleId)) {
      modulesMap.set(moduleId, {
        module_id: moduleId,
        module_slug: clean(row.module_slug, 160),
        module_title: clean(row.module_title, 220),
        sort_order: Number(row.sort_order || 0),
        lessons: [],
      });
    }
    if (row.lesson_id) {
      modulesMap.get(moduleId).lessons.push({
        lesson_id: Number(row.lesson_id),
        lesson_title: clean(row.lesson_title, 220),
        lesson_order: Number(row.lesson_order || 0),
        is_completed: Number(row.is_completed || 0) === 1,
        completed_at: normalizeDate(row.completed_at),
        last_watched_at: normalizeDate(row.last_watched_at),
        watch_seconds: Number(row.watch_seconds || 0),
      });
    }
  });

  const modules = Array.from(modulesMap.values()).map(function (moduleRow) {
    const completed = moduleRow.lessons.filter(function (lesson) {
      return lesson.is_completed;
    }).length;
    return {
      module_id: moduleRow.module_id,
      module_slug: moduleRow.module_slug,
      module_title: moduleRow.module_title,
      sort_order: moduleRow.sort_order,
      progress: {
        completed_lessons: completed,
        total_lessons: moduleRow.lessons.length,
        completion_percent: moduleRow.lessons.length ? Math.round((completed / moduleRow.lessons.length) * 100) : 0,
      },
      lessons: moduleRow.lessons,
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
    student: {
      account_id: Number(studentRows[0].id),
      full_name: clean(studentRows[0].full_name, 180),
      email: clean(studentRows[0].email, 220),
    },
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
  listStudentsProgressByCourse,
  getStudentCourseProgressDetail,
};
