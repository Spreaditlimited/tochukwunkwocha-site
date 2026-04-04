const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const { ensureManualPaymentsTable } = require("./_lib/manual-payments");
const { ensureCourseBatchesTable } = require("./_lib/batch-store");
const { getCourseName } = require("./_lib/course-config");
const { ensureLearningProgressTables, LESSON_PROGRESS_TABLE } = require("./_lib/learning-progress");
const { MODULES_TABLE, LESSONS_TABLE } = require("./_lib/learning");
const { ensureSchoolTables } = require("./_lib/schools");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeKey(value) {
  return clean(value, 120)
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function normalizeLabel(value) {
  return clean(value, 180)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function deriveBatchKeyFromLabel(label) {
  const normalized = normalizeLabel(label);
  if (!normalized) return "";
  const m = normalized.match(/batch\s*([0-9]+)/i);
  if (!m) return "";
  const n = String(m[1] || "").trim();
  return n ? `batch-${n}` : "";
}

function extractBatchNumber(text) {
  const normalized = normalizeLabel(text);
  if (!normalized) return "";
  const m = normalized.match(/batch\s*([0-9]+)/i) || normalized.match(/\b([0-9]+)\b/);
  if (!m) return "";
  return String(m[1] || "").trim();
}

function normalizeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

async function loadResumeMetaByCourse(pool, accountId, courseSlugs) {
  const slugs = Array.from(new Set((courseSlugs || []).map(normalizeKey).filter(Boolean)));
  if (!Number.isFinite(Number(accountId)) || Number(accountId) <= 0 || !slugs.length) return new Map();

  const placeholders = slugs.map(function () {
    return "?";
  }).join(",");

  const resumeMap = new Map();

  const [lastWatchedRows] = await pool.query(
    `SELECT
       m.course_slug,
       p.lesson_id,
       COALESCE(p.last_watched_at, p.updated_at, p.completed_at) AS last_activity_at
     FROM ${LESSON_PROGRESS_TABLE} p
     JOIN ${LESSONS_TABLE} l ON l.id = p.lesson_id AND l.is_active = 1
     JOIN ${MODULES_TABLE} m ON m.id = l.module_id AND m.is_active = 1
     WHERE p.account_id = ?
       AND m.course_slug IN (${placeholders})
     ORDER BY COALESCE(p.last_watched_at, p.updated_at, p.completed_at) DESC, p.updated_at DESC, p.lesson_id DESC`,
    [Number(accountId)].concat(slugs)
  );

  (Array.isArray(lastWatchedRows) ? lastWatchedRows : []).forEach(function (row) {
    const slug = normalizeKey(row.course_slug);
    if (!slug || resumeMap.has(slug)) return;
    const lessonId = Number(row.lesson_id || 0);
    if (!Number.isFinite(lessonId) || lessonId <= 0) return;
    resumeMap.set(slug, {
      resume_lesson_id: lessonId,
      resume_source: "last_watched",
      last_activity_at: normalizeDate(row.last_activity_at),
    });
  });

  const needsFallback = slugs.filter(function (slug) {
    return !resumeMap.has(slug);
  });
  if (!needsFallback.length) return resumeMap;

  const fallbackPlaceholders = needsFallback.map(function () {
    return "?";
  }).join(",");

  const [firstIncompleteRows] = await pool.query(
    `SELECT
       m.course_slug,
       l.id AS lesson_id
     FROM ${MODULES_TABLE} m
     JOIN ${LESSONS_TABLE} l ON l.module_id = m.id AND l.is_active = 1
     LEFT JOIN ${LESSON_PROGRESS_TABLE} p ON p.lesson_id = l.id AND p.account_id = ?
     WHERE m.is_active = 1
       AND m.course_slug IN (${fallbackPlaceholders})
       AND COALESCE(p.is_completed, 0) = 0
     ORDER BY m.course_slug ASC, m.sort_order ASC, m.id ASC, l.lesson_order ASC, l.id ASC`,
    [Number(accountId)].concat(needsFallback)
  );

  (Array.isArray(firstIncompleteRows) ? firstIncompleteRows : []).forEach(function (row) {
    const slug = normalizeKey(row.course_slug);
    if (!slug || resumeMap.has(slug)) return;
    const lessonId = Number(row.lesson_id || 0);
    if (!Number.isFinite(lessonId) || lessonId <= 0) return;
    resumeMap.set(slug, {
      resume_lesson_id: lessonId,
      resume_source: "first_incomplete",
      last_activity_at: null,
    });
  });

  const needsFirstLesson = needsFallback.filter(function (slug) {
    return !resumeMap.has(slug);
  });
  if (!needsFirstLesson.length) return resumeMap;

  const firstLessonPlaceholders = needsFirstLesson.map(function () {
    return "?";
  }).join(",");
  const [firstLessonRows] = await pool.query(
    `SELECT
       m.course_slug,
       l.id AS lesson_id
     FROM ${MODULES_TABLE} m
     JOIN ${LESSONS_TABLE} l ON l.module_id = m.id AND l.is_active = 1
     WHERE m.is_active = 1
       AND m.course_slug IN (${firstLessonPlaceholders})
     ORDER BY m.course_slug ASC, m.sort_order ASC, m.id ASC, l.lesson_order ASC, l.id ASC`,
    needsFirstLesson
  );
  (Array.isArray(firstLessonRows) ? firstLessonRows : []).forEach(function (row) {
    const slug = normalizeKey(row.course_slug);
    if (!slug || resumeMap.has(slug)) return;
    const lessonId = Number(row.lesson_id || 0);
    if (!Number.isFinite(lessonId) || lessonId <= 0) return;
    resumeMap.set(slug, {
      resume_lesson_id: lessonId,
      resume_source: "first_lesson",
      last_activity_at: null,
    });
  });

  return resumeMap;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureCourseOrdersBatchColumns(pool);
    await ensureManualPaymentsTable(pool);
    await ensureCourseBatchesTable(pool);
    await ensureLearningProgressTables(pool);
    await ensureSchoolTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const email = String(session.account.email || "").trim().toLowerCase();

    const [autoRows] = await pool.query(
      `SELECT course_slug, batch_key, batch_label, MAX(paid_at) AS paid_at
       FROM course_orders
       WHERE email = ?
         AND status = 'paid'
       GROUP BY course_slug, batch_key, batch_label`,
      [email]
    );

    const [manualRows] = await pool.query(
      `SELECT course_slug, batch_key, batch_label, MAX(reviewed_at) AS paid_at
       FROM course_manual_payments
       WHERE email = ?
         AND status = 'approved'
       GROUP BY course_slug, batch_key, batch_label`,
      [email]
    );
    const [manualPendingRows] = await pool.query(
      `SELECT course_slug, batch_key, batch_label, MAX(created_at) AS submitted_at
       FROM course_manual_payments
       WHERE email = ?
         AND status = 'pending_verification'
       GROUP BY course_slug, batch_key, batch_label`,
      [email]
    );

    const map = new Map();
    function statusRank(status) {
      if (status === "paid" || status === "approved") return 2;
      if (status === "pending_verification") return 1;
      return 0;
    }

    function upsert(row, source, status, submittedAt) {
      const courseSlug = String(row.course_slug || "").trim();
      const batchKey = String(row.batch_key || "").trim();
      const batchLabel = String(row.batch_label || "").trim();
      const key = `${courseSlug}::${batchKey}`;
      const paidAt = row.paid_at || null;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          courseSlug,
          courseName: getCourseName(courseSlug),
          batchKey: batchKey || null,
          batchLabel: batchLabel || null,
          paidAt,
          submittedAt: submittedAt || null,
          source,
          status,
        });
        return;
      }
      const prevRank = statusRank(existing.status);
      const nextRank = statusRank(status);
      if (nextRank > prevRank) {
        existing.paidAt = paidAt;
        existing.submittedAt = submittedAt || existing.submittedAt || null;
        existing.source = source;
        existing.status = status;
        return;
      }
      if (nextRank === prevRank) {
        const prevTime = existing.paidAt ? new Date(existing.paidAt).getTime() : 0;
        const nextTime = paidAt ? new Date(paidAt).getTime() : 0;
        if (nextTime > prevTime) {
          existing.paidAt = paidAt;
          existing.source = source;
        }
      }
    }

    (autoRows || []).forEach(function (row) {
      upsert(row, "order", "paid", null);
    });
    (manualRows || []).forEach(function (row) {
      upsert(row, "manual_payment", "approved", null);
    });
    (manualPendingRows || []).forEach(function (row) {
      upsert(row, "manual_payment", "pending_verification", row.submitted_at || null);
    });

    const [schoolRows] = await pool.query(
      `SELECT
         sc.course_slug,
         sc.access_starts_at AS paid_at
       FROM school_students ss
       JOIN school_accounts sc ON sc.id = ss.school_id
       WHERE (LOWER(ss.email) = ? OR ss.account_id = ?)
         AND ss.status = 'active'
         AND sc.status = 'active'
         AND (sc.access_expires_at IS NULL OR sc.access_expires_at >= NOW())`,
      [email, Number(session.account.id || 0)]
    );
    (schoolRows || []).forEach(function (row) {
      upsert(
        {
          course_slug: row.course_slug,
          batch_key: "school",
          batch_label: "School Access",
          paid_at: row.paid_at,
        },
        "school",
        "paid",
        null
      );
    });

    const [batchRows] = await pool.query(
      `SELECT course_slug, batch_key, batch_label, status, is_active, DATE_FORMAT(batch_start_at, '%Y-%m-%d %H:%i:%s') AS batch_start_at
       FROM course_batches`
    );
    const batchMetaByKey = new Map();
    const batchMetaByLabel = new Map();
    const batchMetaByNumber = new Map();
    (batchRows || []).forEach(function (row) {
      const courseSlug = normalizeKey(row.course_slug);
      const batchKey = normalizeKey(row.batch_key);
      const batchLabel = normalizeLabel(row.batch_label);
      if (!courseSlug || !batchKey) return;
      const meta = {
        batchStartAt: row.batch_start_at || null,
        batchStatus: row.status || null,
        batchIsActive: Number(row.is_active || 0) === 1,
      };
      batchMetaByKey.set(`${courseSlug}::${batchKey}`, meta);
      if (batchLabel) {
        batchMetaByLabel.set(`${courseSlug}::${batchLabel}`, meta);
      }
      const keyNumber = extractBatchNumber(batchKey) || extractBatchNumber(batchLabel);
      if (keyNumber) {
        batchMetaByNumber.set(`${courseSlug}::${keyNumber}`, meta);
      }
    });

    const items = Array.from(map.values()).sort(function (a, b) {
      const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      return tb - ta;
    });

    const resumeByCourse = await loadResumeMetaByCourse(
      pool,
      Number(session.account.id || 0),
      items.map(function (item) {
        return item.courseSlug;
      })
    );

    const enrichedItems = items.map(function (item) {
      const courseSlug = normalizeKey(item.courseSlug);
      const rawBatchKey = normalizeKey(item.batchKey);
      const batchLabel = normalizeLabel(item.batchLabel);
      const derivedKey = rawBatchKey || deriveBatchKeyFromLabel(batchLabel);
      let meta = null;
      if (courseSlug && derivedKey) {
        meta = batchMetaByKey.get(`${courseSlug}::${derivedKey}`) || null;
      }
      if (!meta && courseSlug && batchLabel) {
        meta = batchMetaByLabel.get(`${courseSlug}::${batchLabel}`) || null;
      }
      if (!meta && courseSlug) {
        const number = extractBatchNumber(rawBatchKey) || extractBatchNumber(batchLabel);
        if (number) meta = batchMetaByNumber.get(`${courseSlug}::${number}`) || null;
      }
      const resume = resumeByCourse.get(courseSlug) || null;
      return {
        ...item,
        batchStartAt: meta ? meta.batchStartAt : null,
        batchStatus: meta ? meta.batchStatus : null,
        batchIsActive: meta ? meta.batchIsActive : false,
        resumeLessonId: resume ? Number(resume.resume_lesson_id || 0) : 0,
        resumeSource: resume ? String(resume.resume_source || "") : "",
        lastActivityAt: resume ? resume.last_activity_at : null,
      };
    });

    return json(200, {
      ok: true,
      account: {
        fullName: session.account.fullName,
        email: session.account.email,
      },
      items: enrichedItems,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load purchased courses" });
  }
};
