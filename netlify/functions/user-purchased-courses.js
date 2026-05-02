const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireStudentSession } = require("./_lib/user-auth");
const { getCourseName, canonicalizeCourseSlug } = require("./_lib/course-config");
const { LESSON_PROGRESS_TABLE } = require("./_lib/learning-progress");
const { MODULES_TABLE, LESSONS_TABLE, COURSES_TABLE, ensureLearningTables } = require("./_lib/learning");
const { STUDENT_CERTIFICATES_TABLE, ensureStudentCertificatesTable } = require("./_lib/student-certificates");
const { ensureLearningAccessOverridesTable } = require("./_lib/learning-access-overrides");
const {
  COURSE_FEATURES_TABLE,
  ASSIGNMENTS_TABLE,
  ensureLearningSupportTables,
} = require("./_lib/learning-support");

const CERTIFICATE_PROOF_MARKER = "[CERTIFICATE_PROOF_WEBSITE]";

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

function resolveSchoolCourseSlug(value) {
  const raw = canonicalizeCourseSlug(clean(value, 120).toLowerCase());
  if (raw === "prompt-to-profit" || raw === "prompt-to-profit-schools") return "prompt-to-profit-schools";
  return raw || "prompt-to-profit-schools";
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

function addOneYearIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString();
}

function nowSqlDateTime() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function isUnknownColumnError(error) {
  const code = String(error && error.code || "").toUpperCase();
  const msg = String(error && error.message || "").toLowerCase();
  return code === "ER_BAD_FIELD_ERROR" || msg.indexOf("unknown column") !== -1;
}

function certificateNo() {
  return `TN-IND-${crypto.randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
}

async function loadCertificateProofRequirements(pool, courseSlugs) {
  const slugs = Array.from(new Set((courseSlugs || []).map(normalizeKey).filter(Boolean)));
  const map = new Map();
  slugs.forEach(function (slug) {
    map.set(slug, { required: false, type: "website_link" });
  });
  if (!slugs.length) return map;

  await ensureLearningSupportTables(pool).catch(function () {
    return false;
  });
  const placeholders = slugs.map(function () {
    return "?";
  }).join(",");
  try {
    const [rows] = await pool.query(
      `SELECT course_slug, certificate_proof_required, certificate_proof_type
       FROM ${COURSE_FEATURES_TABLE}
       WHERE course_slug IN (${placeholders})`,
      slugs
    );
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      const slug = normalizeKey(row && row.course_slug);
      if (!slug || !map.has(slug)) return;
      map.set(slug, {
        required: Number(row && row.certificate_proof_required || 0) === 1,
        type: clean(row && row.certificate_proof_type, 24).toLowerCase() || "website_link",
      });
    });
  } catch (error) {
    if (!isUnknownColumnError(error)) throw error;
  }
  return map;
}

async function loadEnrollmentModeByCourse(pool, courseSlugs) {
  const slugs = Array.from(new Set((courseSlugs || []).map(normalizeKey).filter(Boolean)));
  const map = new Map();
  slugs.forEach(function (slug) {
    map.set(slug, "batch");
  });
  if (!slugs.length) return map;
  await ensureLearningTables(pool).catch(function () {
    return false;
  });
  const placeholders = slugs.map(function () {
    return "?";
  }).join(",");
  try {
    const [rows] = await pool.query(
      `SELECT course_slug, enrollment_mode
       FROM ${COURSES_TABLE}
       WHERE course_slug IN (${placeholders})`,
      slugs
    );
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      const slug = normalizeKey(row && row.course_slug);
      if (!slug || !map.has(slug)) return;
      const mode = clean(row && row.enrollment_mode, 24).toLowerCase() === "immediate" ? "immediate" : "batch";
      map.set(slug, mode);
    });
  } catch (_error) {}
  return map;
}

async function loadCertificateProofStatusByCourse(pool, accountId, email, courseSlugs) {
  const slugs = Array.from(new Set((courseSlugs || []).map(normalizeKey).filter(Boolean)));
  const map = new Map();
  slugs.forEach(function (slug) {
    map.set(slug, { status: "missing", submittedAt: null, link: "" });
  });
  if (!Number.isFinite(Number(accountId)) || Number(accountId) <= 0 || !slugs.length) return map;

  await ensureLearningSupportTables(pool).catch(function () {
    return false;
  });
  const placeholders = slugs.map(function () {
    return "?";
  }).join(",");
  try {
    const [rows] = await pool.query(
      `SELECT course_slug, status, submission_link,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM ${ASSIGNMENTS_TABLE}
       WHERE account_id = ?
         AND LOWER(student_email) COLLATE utf8mb4_general_ci = ?
         AND submission_kind = 'link'
         AND submission_text = ?
         AND course_slug IN (${placeholders})
       ORDER BY id DESC`,
      [Number(accountId), String(email || "").toLowerCase(), CERTIFICATE_PROOF_MARKER].concat(slugs)
    );
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      const slug = normalizeKey(row && row.course_slug);
      if (!slug || !map.has(slug)) return;
      if (map.get(slug).status !== "missing") return;
      const status = clean(row && row.status, 32).toLowerCase() || "submitted";
      map.set(slug, {
        status: status === "approved" ? "approved" : (status === "rejected" ? "rejected" : "pending"),
        submittedAt: row && row.created_at ? normalizeDate(row.created_at) : null,
        link: clean(row && row.submission_link, 1500),
      });
    });
  } catch (error) {
    if (!isUnknownColumnError(error)) throw error;
  }
  return map;
}

async function loadCourseCompletionMap(pool, accountId, courseSlugs) {
  const slugs = Array.from(new Set((courseSlugs || []).map(normalizeKey).filter(Boolean)));
  const map = new Map();
  if (!Number.isFinite(Number(accountId)) || Number(accountId) <= 0 || !slugs.length) return map;

  const placeholders = slugs.map(function () {
    return "?";
  }).join(",");

  const [totalRows] = await pool.query(
    `SELECT m.course_slug, COUNT(*) AS total_lessons
     FROM ${LESSONS_TABLE} l
     JOIN ${MODULES_TABLE} m ON m.id = l.module_id
     WHERE m.is_active = 1
       AND l.is_active = 1
       AND m.course_slug IN (${placeholders})
     GROUP BY m.course_slug`,
    slugs
  );
  (Array.isArray(totalRows) ? totalRows : []).forEach(function (row) {
    const slug = normalizeKey(row.course_slug);
    if (!slug) return;
    map.set(slug, {
      totalLessons: Number(row.total_lessons || 0),
      completedLessons: 0,
      completionPercent: 0,
    });
  });

  const [doneRows] = await pool.query(
    `SELECT m.course_slug, COUNT(*) AS completed_lessons
     FROM ${LESSON_PROGRESS_TABLE} p
     JOIN ${LESSONS_TABLE} l ON l.id = p.lesson_id
     JOIN ${MODULES_TABLE} m ON m.id = l.module_id
     WHERE p.account_id = ?
       AND p.is_completed = 1
       AND m.is_active = 1
       AND l.is_active = 1
       AND m.course_slug IN (${placeholders})
     GROUP BY m.course_slug`,
    [Number(accountId)].concat(slugs)
  );
  (Array.isArray(doneRows) ? doneRows : []).forEach(function (row) {
    const slug = normalizeKey(row.course_slug);
    if (!slug) return;
    const existing = map.get(slug) || {
      totalLessons: 0,
      completedLessons: 0,
      completionPercent: 0,
    };
    existing.completedLessons = Number(row.completed_lessons || 0);
    map.set(slug, existing);
  });

  map.forEach(function (value) {
    const total = Number(value.totalLessons || 0);
    const done = Number(value.completedLessons || 0);
    value.completionPercent = total > 0 ? Math.round((done / total) * 100) : 0;
  });

  return map;
}

async function issueAndLoadStudentCertificates(pool, accountId, courseSlugs, completionMap, options) {
  const slugs = Array.from(new Set((courseSlugs || []).map(normalizeKey).filter(Boolean)));
  const certMap = new Map();
  if (!Number.isFinite(Number(accountId)) || Number(accountId) <= 0 || !slugs.length) return certMap;

  await ensureStudentCertificatesTable(pool);
  const cfg = options && typeof options === "object" ? options : {};
  const allowIssue = cfg.allowIssue === true;
  const recipientName = clean(cfg.recipientName, 180);
  const proofRequirementByCourse = cfg.proofRequirementByCourse instanceof Map ? cfg.proofRequirementByCourse : new Map();
  const proofStatusByCourse = cfg.proofStatusByCourse instanceof Map ? cfg.proofStatusByCourse : new Map();
  const now = nowSqlDateTime();
  if (allowIssue && recipientName) {
    for (let i = 0; i < slugs.length; i += 1) {
      const slug = slugs[i];
      const progress = completionMap.get(slug);
      if (!progress) continue;
      const totalLessons = Number(progress.totalLessons || 0);
      const completedLessons = Number(progress.completedLessons || 0);
      if (totalLessons <= 0 || completedLessons < totalLessons) continue;
      const proofCfg = proofRequirementByCourse.get(slug) || { required: false, type: "website_link" };
      const proofStatus = proofStatusByCourse.get(slug) || { status: "missing" };
      if (proofCfg.required && proofStatus.status !== "approved") continue;
      try {
        await pool.query(
          `INSERT INTO ${STUDENT_CERTIFICATES_TABLE}
            (account_id, course_slug, certificate_no, recipient_name, status, issued_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'issued', ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             certificate_no = certificate_no,
             recipient_name = recipient_name,
             status = 'issued',
             issued_at = issued_at,
             updated_at = VALUES(updated_at)`,
          [Number(accountId), slug, certificateNo(), recipientName, now, now, now]
        );
      } catch (error) {
        if (!isUnknownColumnError(error)) throw error;
        await pool.query(
          `INSERT INTO ${STUDENT_CERTIFICATES_TABLE}
            (account_id, course_slug, certificate_no, status, issued_at, created_at, updated_at)
           VALUES (?, ?, ?, 'issued', ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             certificate_no = certificate_no,
             status = 'issued',
             issued_at = issued_at,
             updated_at = VALUES(updated_at)`,
          [Number(accountId), slug, certificateNo(), now, now, now]
        );
      }
    }
  }

  const placeholders = slugs.map(function () {
    return "?";
  }).join(",");
  let rows = [];
  try {
    const [primaryRows] = await pool.query(
      `SELECT course_slug, certificate_no, recipient_name, issued_at
       FROM ${STUDENT_CERTIFICATES_TABLE}
       WHERE account_id = ?
         AND status = 'issued'
         AND course_slug IN (${placeholders})`,
      [Number(accountId)].concat(slugs)
    );
    rows = primaryRows;
  } catch (error) {
    if (!isUnknownColumnError(error)) throw error;
    const [fallbackRows] = await pool.query(
      `SELECT course_slug, certificate_no, issued_at
       FROM ${STUDENT_CERTIFICATES_TABLE}
       WHERE account_id = ?
         AND status = 'issued'
         AND course_slug IN (${placeholders})`,
      [Number(accountId)].concat(slugs)
    );
    rows = fallbackRows;
  }
  (Array.isArray(rows) ? rows : []).forEach(function (row) {
    const slug = normalizeKey(row.course_slug);
    if (!slug) return;
    const certNo = clean(row.certificate_no, 140);
    certMap.set(slug, {
      certificateNo: certNo,
      recipientName: clean(row.recipient_name, 180),
      issuedAt: row.issued_at ? new Date(row.issued_at).toISOString() : null,
      certificateUrl: certNo
        ? `/dashboard/certificate/?certificate_no=${encodeURIComponent(certNo)}`
        : "",
    });
  });

  return certMap;
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
       CAST(SUBSTRING_INDEX(
         GROUP_CONCAT(
           p.lesson_id
           ORDER BY COALESCE(p.last_watched_at, p.updated_at, p.completed_at) DESC, p.updated_at DESC, p.lesson_id DESC
         ),
         ',',
         1
       ) AS UNSIGNED) AS lesson_id,
       SUBSTRING_INDEX(
         GROUP_CONCAT(
           DATE_FORMAT(COALESCE(p.last_watched_at, p.updated_at, p.completed_at), '%Y-%m-%d %H:%i:%s')
           ORDER BY COALESCE(p.last_watched_at, p.updated_at, p.completed_at) DESC, p.updated_at DESC, p.lesson_id DESC
         ),
         ',',
         1
       ) AS last_activity_at
     FROM ${LESSON_PROGRESS_TABLE} p
     JOIN ${LESSONS_TABLE} l ON l.id = p.lesson_id AND l.is_active = 1
     JOIN ${MODULES_TABLE} m ON m.id = l.module_id AND m.is_active = 1
     WHERE p.account_id = ?
       AND m.course_slug IN (${placeholders})
     GROUP BY m.course_slug`,
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
       CAST(SUBSTRING_INDEX(
         GROUP_CONCAT(l.id ORDER BY m.sort_order ASC, m.id ASC, l.lesson_order ASC, l.id ASC),
         ',',
         1
       ) AS UNSIGNED) AS lesson_id
     FROM ${MODULES_TABLE} m
     JOIN ${LESSONS_TABLE} l ON l.module_id = m.id AND l.is_active = 1
     LEFT JOIN ${LESSON_PROGRESS_TABLE} p ON p.lesson_id = l.id AND p.account_id = ?
     WHERE m.is_active = 1
       AND m.course_slug IN (${fallbackPlaceholders})
       AND COALESCE(p.is_completed, 0) = 0
     GROUP BY m.course_slug`,
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
       CAST(SUBSTRING_INDEX(
         GROUP_CONCAT(l.id ORDER BY m.sort_order ASC, m.id ASC, l.lesson_order ASC, l.id ASC),
         ',',
         1
       ) AS UNSIGNED) AS lesson_id
     FROM ${MODULES_TABLE} m
     JOIN ${LESSONS_TABLE} l ON l.module_id = m.id AND l.is_active = 1
     WHERE m.is_active = 1
       AND m.course_slug IN (${firstLessonPlaceholders})
     GROUP BY m.course_slug`,
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
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const email = String(session.account.email || "").trim().toLowerCase();

    const orderWindowStartSql = `CASE
      WHEN COALESCE(TRIM(o.batch_key), '') <> '' AND b.batch_start_at IS NOT NULL THEN b.batch_start_at
      ELSE COALESCE(o.paid_at, o.updated_at, o.created_at)
    END`;
    const [autoRows] = await pool.query(
      `SELECT o.course_slug,
              o.batch_key,
              o.batch_label,
              DATE_FORMAT(MAX(CASE
                WHEN COALESCE(TRIM(o.batch_key), '') <> '' THEN b.batch_start_at
                ELSE NULL
              END), '%Y-%m-%d %H:%i:%s') AS batch_start_at,
              DATE_FORMAT(MAX(COALESCE(o.paid_at, o.updated_at, o.created_at)), '%Y-%m-%d %H:%i:%s') AS paid_at,
              DATE_FORMAT(MAX(DATE_ADD(${orderWindowStartSql}, INTERVAL 1 YEAR)), '%Y-%m-%d %H:%i:%s') AS access_expires_at
       FROM course_orders o
       LEFT JOIN course_batches b
         ON b.course_slug COLLATE utf8mb4_general_ci = o.course_slug COLLATE utf8mb4_general_ci
        AND b.batch_key COLLATE utf8mb4_general_ci = o.batch_key COLLATE utf8mb4_general_ci
       WHERE o.email = ?
         AND o.status = 'paid'
       GROUP BY o.course_slug, o.batch_key, o.batch_label`,
      [email]
    );

    const manualWindowStartSql = `CASE
      WHEN COALESCE(TRIM(m.batch_key), '') <> '' AND b.batch_start_at IS NOT NULL THEN b.batch_start_at
      ELSE COALESCE(m.reviewed_at, m.updated_at, m.created_at)
    END`;
    const [manualRows] = await pool.query(
      `SELECT m.course_slug,
              m.batch_key,
              m.batch_label,
              DATE_FORMAT(MAX(CASE
                WHEN COALESCE(TRIM(m.batch_key), '') <> '' THEN b.batch_start_at
                ELSE NULL
              END), '%Y-%m-%d %H:%i:%s') AS batch_start_at,
              DATE_FORMAT(MAX(COALESCE(m.reviewed_at, m.updated_at, m.created_at)), '%Y-%m-%d %H:%i:%s') AS paid_at,
              DATE_FORMAT(MAX(DATE_ADD(${manualWindowStartSql}, INTERVAL 1 YEAR)), '%Y-%m-%d %H:%i:%s') AS access_expires_at
       FROM course_manual_payments m
       LEFT JOIN course_batches b
         ON b.course_slug COLLATE utf8mb4_general_ci = m.course_slug COLLATE utf8mb4_general_ci
        AND b.batch_key COLLATE utf8mb4_general_ci = m.batch_key COLLATE utf8mb4_general_ci
       WHERE m.email = ?
         AND m.status = 'approved'
       GROUP BY m.course_slug, m.batch_key, m.batch_label`,
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
    await ensureLearningAccessOverridesTable(pool).catch(function () {
      return null;
    });
    let overrideRows = [];
    try {
      const [rows] = await pool.query(
        `SELECT course_slug,
                DATE_FORMAT(MAX(updated_at), '%Y-%m-%d %H:%i:%s') AS paid_at,
                DATE_FORMAT(MAX(expires_at), '%Y-%m-%d %H:%i:%s') AS access_expires_at
         FROM tochukwu_learning_access_overrides
         WHERE LOWER(email) COLLATE utf8mb4_general_ci = ?
           AND status = 'active'
           AND (expires_at IS NULL OR expires_at > NOW())
         GROUP BY course_slug`,
        [email]
      );
      overrideRows = Array.isArray(rows) ? rows : [];
    } catch (_error) {
      overrideRows = [];
    }

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
      const accessExpiresAt = row.access_expires_at || null;
      const batchStartAt = row.batch_start_at || null;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          courseSlug,
          courseName: getCourseName(courseSlug),
          batchKey: batchKey || null,
          batchLabel: batchLabel || null,
          batchStartAt,
          paidAt,
          accessExpiresAt,
          submittedAt: submittedAt || null,
          source,
          status,
        });
        return;
      }
      const prevRank = statusRank(existing.status);
      const nextRank = statusRank(status);
      if (nextRank > prevRank) {
        existing.batchStartAt = batchStartAt;
        existing.paidAt = paidAt;
        existing.accessExpiresAt = accessExpiresAt;
        existing.submittedAt = submittedAt || existing.submittedAt || null;
        existing.source = source;
        existing.status = status;
        return;
      }
      if (nextRank === prevRank) {
        const prevTime = existing.paidAt ? new Date(existing.paidAt).getTime() : 0;
        const nextTime = paidAt ? new Date(paidAt).getTime() : 0;
        if (nextTime > prevTime) {
          existing.batchStartAt = batchStartAt;
          existing.paidAt = paidAt;
          existing.accessExpiresAt = accessExpiresAt;
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
    (overrideRows || []).forEach(function (row) {
      upsert(
        {
          course_slug: row.course_slug,
          batch_key: "admin-override",
          batch_label: "Admin Early Access",
          batch_start_at: null,
          paid_at: row.paid_at || null,
          access_expires_at: row.access_expires_at || null,
        },
        "admin_override",
        "paid",
        null
      );
    });

    const [schoolRows] = await pool.query(
      `SELECT
         sc.course_slug,
         DATE_FORMAT(COALESCE(sc.paid_at, sc.created_at), '%Y-%m-%d %H:%i:%s') AS paid_at,
         DATE_FORMAT(DATE_ADD(COALESCE(sc.paid_at, sc.created_at), INTERVAL 1 YEAR), '%Y-%m-%d %H:%i:%s') AS access_expires_at,
         ss.website_url,
         DATE_FORMAT(ss.website_submitted_at, '%Y-%m-%d %H:%i:%s') AS website_submitted_at,
         cert.certificate_no,
         DATE_FORMAT(cert.issued_at, '%Y-%m-%d %H:%i:%s') AS certificate_issued_at
       FROM school_students ss
       JOIN school_accounts sc ON sc.id = ss.school_id
       LEFT JOIN school_certificates cert ON cert.student_id = ss.id
         AND cert.course_slug = sc.course_slug
         AND cert.status = 'issued'
       WHERE (LOWER(ss.email) = ? OR ss.account_id = ?)
         AND ss.status = 'active'
         AND sc.status = 'active'
         AND DATE_ADD(COALESCE(sc.paid_at, sc.created_at), INTERVAL 1 YEAR) >= NOW()`,
      [email, Number(session.account.id || 0)]
    );
    (schoolRows || []).forEach(function (row) {
      const schoolCourseSlug = resolveSchoolCourseSlug(row && row.course_slug);
      upsert(
        {
          course_slug: schoolCourseSlug,
          batch_key: "school",
          batch_label: "School Access",
          batch_start_at: null,
          paid_at: row.paid_at,
          access_expires_at: row.access_expires_at || null,
        },
        "school",
        "paid",
        null
      );
      const key = `${schoolCourseSlug}::school`;
      const existing = map.get(key);
      if (existing) {
        existing.schoolWebsiteUrl = clean(row.website_url, 1000) || "";
        existing.schoolWebsiteSubmittedAt = row.website_submitted_at || null;
        const certificateNo = clean(row.certificate_no, 140);
        existing.schoolCertificateNo = certificateNo || "";
        existing.schoolCertificateIssuedAt = row.certificate_issued_at || null;
        existing.schoolCertificateUrl = certificateNo
          ? `/schools/certificate/?certificate_no=${encodeURIComponent(certificateNo)}`
          : "";
      }
    });

    const [schoolAccessRows] = await pool.query(
      `SELECT
         sa.course_slug,
         DATE_FORMAT(sa.granted_at, '%Y-%m-%d %H:%i:%s') AS granted_at
       FROM school_students ss
       JOIN school_accounts sc ON sc.id = ss.school_id
       JOIN school_student_course_access sa
         ON sa.student_id = ss.id
        AND sa.status = 'active'
       WHERE (LOWER(ss.email) = ? OR ss.account_id = ?)
         AND ss.status = 'active'
         AND sc.status = 'active'
         AND DATE_ADD(COALESCE(sc.paid_at, sc.created_at), INTERVAL 1 YEAR) >= NOW()`,
      [email, Number(session.account.id || 0)]
    );
    (schoolAccessRows || []).forEach(function (row) {
      const schoolCourseSlug = resolveSchoolCourseSlug(row && row.course_slug);
      upsert(
        {
          course_slug: schoolCourseSlug,
          batch_key: "school",
          batch_label: "School Access",
          batch_start_at: null,
          paid_at: row.granted_at || null,
          access_expires_at: null,
        },
        "school_upgrade",
        "paid",
        null
      );
    });

    const distinctOwnedSlugs = Array.from(
      new Set(
        Array.from(map.values())
          .map(function (item) {
            return normalizeKey(item.courseSlug);
          })
          .filter(Boolean)
      )
    );
    let batchRows = [];
    if (distinctOwnedSlugs.length) {
      const batchPlaceholders = distinctOwnedSlugs.map(function () {
        return "?";
      }).join(",");
      const [rows] = await pool.query(
        `SELECT course_slug, batch_key, batch_label, status, is_active, DATE_FORMAT(batch_start_at, '%Y-%m-%d %H:%i:%s') AS batch_start_at
         FROM course_batches
         WHERE course_slug IN (${batchPlaceholders})`,
        distinctOwnedSlugs
      );
      batchRows = rows || [];
    }
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
    const completionEligibleCourseSlugs = Array.from(
      new Set(
        items
          .filter(function (item) {
            const status = normalizeKey(item.status);
            return status === "paid" || status === "approved";
          })
          .map(function (item) {
            return normalizeKey(item.courseSlug);
          })
          .filter(Boolean)
      )
    );
    const individualEligibleCourseSlugs = Array.from(
      new Set(
        items
          .filter(function (item) {
            const source = normalizeKey(item.source);
            const status = normalizeKey(item.status);
            return source !== "school" && (status === "paid" || status === "approved");
          })
          .map(function (item) {
            return normalizeKey(item.courseSlug);
          })
          .filter(Boolean)
      )
    );
    const completionByCourse = await loadCourseCompletionMap(
      pool,
      Number(session.account.id || 0),
      completionEligibleCourseSlugs
    );
    const proofRequirementByCourse = await loadCertificateProofRequirements(pool, individualEligibleCourseSlugs);
    const enrollmentModeByCourse = await loadEnrollmentModeByCourse(pool, completionEligibleCourseSlugs);
    const proofStatusByCourse = await loadCertificateProofStatusByCourse(
      pool,
      Number(session.account.id || 0),
      email,
      individualEligibleCourseSlugs
    );
    const individualCertificatesByCourse = await issueAndLoadStudentCertificates(
      pool,
      Number(session.account.id || 0),
      individualEligibleCourseSlugs,
      completionByCourse,
      {
        allowIssue: session.account.certificateNameNeedsConfirmation !== true,
        recipientName: session.account.fullName,
        proofRequirementByCourse,
        proofStatusByCourse,
      }
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
      const isSchool = normalizeKey(item.source) === "school";
      const source = normalizeKey(item.source);
      const isOrderOrManual = source === "order" || source === "manual-payment";
      const itemBatchStartAt = normalizeDate(item.batchStartAt);
      const metaBatchStartAt = meta && meta.batchStartAt ? normalizeDate(meta.batchStartAt) : null;
      const effectiveBatchStartAt = metaBatchStartAt || itemBatchStartAt;
      const completion = completionByCourse.get(courseSlug) || null;
      const certificate = individualCertificatesByCourse.get(courseSlug) || null;
      const proofCfg = proofRequirementByCourse.get(courseSlug) || { required: false, type: "website_link" };
      const enrollmentMode = enrollmentModeByCourse.get(courseSlug) || "batch";
      const proof = proofStatusByCourse.get(courseSlug) || { status: "missing", submittedAt: null, link: "" };
      const derivedAccessExpiresAt = isSchool
        ? addOneYearIso(item.paidAt)
        : (
          isOrderOrManual && effectiveBatchStartAt
            ? addOneYearIso(effectiveBatchStartAt)
            : (isOrderOrManual ? addOneYearIso(item.paidAt) : normalizeDate(item.accessExpiresAt))
        );
      return {
        ...item,
        batchStartAt: meta ? meta.batchStartAt : (item.batchStartAt || null),
        batchStatus: meta ? meta.batchStatus : null,
        batchIsActive: meta ? meta.batchIsActive : false,
        accessExpiresAt: derivedAccessExpiresAt,
        resumeLessonId: resume ? Number(resume.resume_lesson_id || 0) : 0,
        resumeSource: resume ? String(resume.resume_source || "") : "",
        lastActivityAt: resume ? resume.last_activity_at : null,
        individualCompletedLessons: completion ? Number(completion.completedLessons || 0) : 0,
        individualTotalLessons: completion ? Number(completion.totalLessons || 0) : 0,
        individualCompletionPercent: completion ? Number(completion.completionPercent || 0) : 0,
        individualCertificateNo: !isSchool && certificate ? String(certificate.certificateNo || "") : "",
        individualCertificateRecipientName: !isSchool && certificate ? String(certificate.recipientName || "") : "",
        individualCertificateIssuedAt: !isSchool && certificate ? certificate.issuedAt : null,
        individualCertificateUrl: !isSchool && certificate ? String(certificate.certificateUrl || "") : "",
        certificateProofRequired: !isSchool && proofCfg.required === true,
        certificateProofType: !isSchool ? String(proofCfg.type || "website_link") : "",
        enrollmentMode: String(enrollmentMode || "batch"),
        certificateProofStatus: !isSchool ? String(proof.status || "missing") : "missing",
        certificateProofSubmittedAt: !isSchool ? proof.submittedAt : null,
        certificateProofLink: !isSchool ? String(proof.link || "") : "",
      };
    });

    return json(200, {
      ok: true,
      account: {
        fullName: session.account.fullName,
        email: session.account.email,
        certificateNameConfirmedAt: session.account.certificateNameConfirmedAt || null,
        certificateNameNeedsConfirmation: session.account.certificateNameNeedsConfirmation === true,
      },
      items: enrichedItems,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load purchased courses" });
  }
};
