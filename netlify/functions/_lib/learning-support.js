const crypto = require("crypto");
const { nowSql } = require("./db");
const { runtimeSchemaChangesAllowed } = require("./schema-mode");

const COURSE_FEATURES_TABLE = "tochukwu_learning_course_features";
const ASSIGNMENTS_TABLE = "tochukwu_learning_assignments";
const ASSIGNMENT_ATTACHMENTS_TABLE = "tochukwu_learning_assignment_attachments";
const ASSIGNMENT_EVENTS_TABLE = "tochukwu_learning_assignment_events";
const COMMUNITY_THREADS_TABLE = "tochukwu_learning_community_threads";
const COMMUNITY_REPLIES_TABLE = "tochukwu_learning_community_replies";

let supportTablesEnsured = false;
let supportTablesAvailable = false;

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function normalizeCourseSlug(value) {
  return clean(value, 120).toLowerCase();
}

function normalizeEmail(value) {
  return clean(value, 220).toLowerCase();
}

function toFlag(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback ? 1 : 0;
  if (value === true) return 1;
  if (value === false) return 0;
  var raw = clean(value, 16).toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return 1;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return 0;
  return fallback ? 1 : 0;
}

function normalizeAlumniMode(value) {
  var raw = clean(value, 24).toLowerCase();
  if (raw === "none" || raw === "read_only" || raw === "full") return raw;
  return "none";
}

function normalizeCertificateProofType(value) {
  var raw = clean(value, 24).toLowerCase();
  if (raw === "website_link") return raw;
  return "website_link";
}

function normalizeAssignmentKind(value) {
  var raw = clean(value, 24).toLowerCase();
  if (raw === "text" || raw === "link" || raw === "screenshots") return raw;
  return "text";
}

function normalizeAssignmentStatus(value) {
  var raw = clean(value, 32).toLowerCase();
  if (raw === "submitted" || raw === "in_review" || raw === "needs_revision" || raw === "approved" || raw === "rejected") return raw;
  return "submitted";
}

function normalizeCommunityQuestionType(value, tutorQuestionsEnabled) {
  var raw = clean(value, 24).toLowerCase();
  if (raw !== "tutor" && raw !== "peer") raw = "peer";
  if (raw === "tutor" && !tutorQuestionsEnabled) return "peer";
  return raw;
}

function normalizeCommunityThreadStatus(value) {
  var raw = clean(value, 24).toLowerCase();
  if (raw === "open" || raw === "answered" || raw === "closed") return raw;
  return "open";
}

function normalizeUrl(value, max) {
  var raw = clean(value, max || 1500);
  if (!raw) return "";
  try {
    var u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString().slice(0, max || 1500);
  } catch (_error) {
    return "";
  }
}

function sanitizeScreenshotUrls(value) {
  var list = Array.isArray(value) ? value : [];
  return list
    .map(function (item) {
      return normalizeUrl(item, 1500);
    })
    .filter(Boolean)
    .slice(0, 5);
}

function isMissingTableError(error) {
  var code = String((error && error.code) || "").trim().toUpperCase();
  var msg = String((error && error.message) || "").toLowerCase();
  return code === "ER_NO_SUCH_TABLE" || msg.indexOf("doesn't exist") !== -1 || msg.indexOf("does not exist") !== -1;
}

async function hasSupportTables(pool) {
  var [rows] = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN (?, ?, ?, ?)`,
    [COURSE_FEATURES_TABLE, ASSIGNMENTS_TABLE, ASSIGNMENT_ATTACHMENTS_TABLE, ASSIGNMENT_EVENTS_TABLE]
  );
  var set = new Set((Array.isArray(rows) ? rows : []).map(function (row) {
    return clean(row && row.table_name, 120).toLowerCase();
  }));
  return set.has(COURSE_FEATURES_TABLE) &&
    set.has(ASSIGNMENTS_TABLE) &&
    set.has(ASSIGNMENT_ATTACHMENTS_TABLE) &&
    set.has(ASSIGNMENT_EVENTS_TABLE);
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

async function ensureLearningSupportTables(pool, options) {
  var opts = options && typeof options === "object" ? options : {};
  var bootstrap = !!opts.bootstrap;
  if (supportTablesEnsured && !bootstrap) return supportTablesAvailable;

  if (!runtimeSchemaChangesAllowed() && !bootstrap) {
    supportTablesAvailable = await hasSupportTables(pool).catch(function () {
      return false;
    });
    supportTablesEnsured = true;
    return supportTablesAvailable;
  }

  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${COURSE_FEATURES_TABLE} (
        id BIGINT NOT NULL AUTO_INCREMENT,
        course_slug VARCHAR(120) NOT NULL,
        assignments_enabled TINYINT(1) NOT NULL DEFAULT 0,
        course_community_enabled TINYINT(1) NOT NULL DEFAULT 0,
        tutor_questions_enabled TINYINT(1) NOT NULL DEFAULT 0,
        alumni_participation_mode VARCHAR(24) NOT NULL DEFAULT 'none',
        certificate_proof_required TINYINT(1) NOT NULL DEFAULT 0,
        certificate_proof_type VARCHAR(24) NOT NULL DEFAULT 'website_link',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_learning_course_feature_slug (course_slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${ASSIGNMENTS_TABLE} (
        id BIGINT NOT NULL AUTO_INCREMENT,
        assignment_uuid VARCHAR(64) NOT NULL,
        course_slug VARCHAR(120) NOT NULL,
        account_id BIGINT NOT NULL,
        student_email VARCHAR(220) NOT NULL,
        student_name VARCHAR(180) NULL,
        lesson_id BIGINT NULL,
        module_id BIGINT NULL,
        submission_kind VARCHAR(24) NOT NULL,
        submission_text TEXT NULL,
        submission_link VARCHAR(1500) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'submitted',
        admin_feedback TEXT NULL,
        reviewed_by VARCHAR(120) NULL,
        reviewed_at DATETIME NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_learning_assignment_uuid (assignment_uuid),
        KEY idx_learning_assignment_course_status (course_slug, status, created_at),
        KEY idx_learning_assignment_student (student_email, course_slug, created_at),
        KEY idx_learning_assignment_account (account_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${ASSIGNMENT_ATTACHMENTS_TABLE} (
        id BIGINT NOT NULL AUTO_INCREMENT,
        assignment_id BIGINT NOT NULL,
        attachment_kind VARCHAR(24) NOT NULL,
        attachment_url VARCHAR(1500) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        KEY idx_learning_assignment_attachment (assignment_id, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${ASSIGNMENT_EVENTS_TABLE} (
        id BIGINT NOT NULL AUTO_INCREMENT,
        assignment_id BIGINT NOT NULL,
        actor_type VARCHAR(24) NOT NULL,
        actor_ref VARCHAR(220) NULL,
        event_type VARCHAR(32) NOT NULL,
        event_note VARCHAR(800) NULL,
        metadata_json TEXT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        KEY idx_learning_assignment_event (assignment_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${COMMUNITY_THREADS_TABLE} (
        id BIGINT NOT NULL AUTO_INCREMENT,
        thread_uuid VARCHAR(64) NOT NULL,
        course_slug VARCHAR(120) NOT NULL,
        account_id BIGINT NOT NULL,
        author_email VARCHAR(220) NOT NULL,
        author_name VARCHAR(180) NULL,
        lesson_id BIGINT NULL,
        module_id BIGINT NULL,
        question_type VARCHAR(24) NOT NULL DEFAULT 'peer',
        title VARCHAR(220) NOT NULL,
        body TEXT NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'open',
        replies_count INT NOT NULL DEFAULT 0,
        last_activity_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_learning_community_thread_uuid (thread_uuid),
        KEY idx_learning_community_course (course_slug, status, last_activity_at),
        KEY idx_learning_community_author (author_email, course_slug, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${COMMUNITY_REPLIES_TABLE} (
        id BIGINT NOT NULL AUTO_INCREMENT,
        reply_uuid VARCHAR(64) NOT NULL,
        thread_id BIGINT NOT NULL,
        course_slug VARCHAR(120) NOT NULL,
        account_id BIGINT NOT NULL,
        author_email VARCHAR(220) NOT NULL,
        author_name VARCHAR(180) NULL,
        body TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_learning_community_reply_uuid (reply_uuid),
        KEY idx_learning_community_reply_thread (thread_id, created_at),
        KEY idx_learning_community_reply_author (author_email, course_slug, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    await safeAlter(pool, `ALTER TABLE ${COURSE_FEATURES_TABLE} ADD COLUMN assignments_enabled TINYINT(1) NOT NULL DEFAULT 0`);
    await safeAlter(pool, `ALTER TABLE ${COURSE_FEATURES_TABLE} ADD COLUMN course_community_enabled TINYINT(1) NOT NULL DEFAULT 0`);
    await safeAlter(pool, `ALTER TABLE ${COURSE_FEATURES_TABLE} ADD COLUMN tutor_questions_enabled TINYINT(1) NOT NULL DEFAULT 0`);
    await safeAlter(pool, `ALTER TABLE ${COURSE_FEATURES_TABLE} ADD COLUMN alumni_participation_mode VARCHAR(24) NOT NULL DEFAULT 'none'`);
    await safeAlter(pool, `ALTER TABLE ${COURSE_FEATURES_TABLE} ADD COLUMN certificate_proof_required TINYINT(1) NOT NULL DEFAULT 0`);
    await safeAlter(pool, `ALTER TABLE ${COURSE_FEATURES_TABLE} ADD COLUMN certificate_proof_type VARCHAR(24) NOT NULL DEFAULT 'website_link'`);

    supportTablesAvailable = true;
  } catch (_error) {
    supportTablesAvailable = await hasSupportTables(pool).catch(function () {
      return false;
    });
  }

  supportTablesEnsured = true;
  return supportTablesAvailable;
}

function defaultCourseFeatures(courseSlug) {
  return {
    course_slug: normalizeCourseSlug(courseSlug),
    assignments_enabled: false,
    course_community_enabled: false,
    tutor_questions_enabled: false,
    alumni_participation_mode: "none",
    certificate_proof_required: false,
    certificate_proof_type: "website_link",
  };
}

async function getCourseLearningFeatures(pool, courseSlug) {
  var ok = await ensureLearningSupportTables(pool).catch(function () {
    return false;
  });
  var slug = normalizeCourseSlug(courseSlug);
  if (!slug) return defaultCourseFeatures("");
  if (!ok) return defaultCourseFeatures(slug);

  try {
    var [rows] = await pool.query(
      `SELECT course_slug, assignments_enabled, course_community_enabled, tutor_questions_enabled, alumni_participation_mode,
              certificate_proof_required, certificate_proof_type
       FROM ${COURSE_FEATURES_TABLE}
       WHERE course_slug = ?
       LIMIT 1`,
      [slug]
    );
    if (!Array.isArray(rows) || !rows.length) return defaultCourseFeatures(slug);
    var row = rows[0] || {};
    return {
      course_slug: slug,
      assignments_enabled: Number(row.assignments_enabled || 0) === 1,
      course_community_enabled: Number(row.course_community_enabled || 0) === 1,
      tutor_questions_enabled: Number(row.tutor_questions_enabled || 0) === 1,
      alumni_participation_mode: normalizeAlumniMode(row.alumni_participation_mode),
      certificate_proof_required: Number(row.certificate_proof_required || 0) === 1,
      certificate_proof_type: normalizeCertificateProofType(row.certificate_proof_type),
    };
  } catch (error) {
    if (isMissingTableError(error)) return defaultCourseFeatures(slug);
    throw error;
  }
}

async function saveCourseLearningFeatures(pool, input) {
  var ok = await ensureLearningSupportTables(pool, { bootstrap: true });
  if (!ok) throw new Error("Learning support storage is not provisioned yet.");

  var slug = normalizeCourseSlug(input && input.course_slug);
  if (!slug) throw new Error("course_slug is required");
  var now = nowSql();
  var assignmentsEnabled = toFlag(input && input.assignments_enabled, false);
  var communityEnabled = toFlag(input && input.course_community_enabled, false);
  var tutorQuestionsEnabled = toFlag(input && input.tutor_questions_enabled, false);
  var alumniMode = normalizeAlumniMode(input && input.alumni_participation_mode);
  var certificateProofRequired = toFlag(input && input.certificate_proof_required, false);
  var certificateProofType = normalizeCertificateProofType(input && input.certificate_proof_type);

  await pool.query(
    `INSERT INTO ${COURSE_FEATURES_TABLE}
      (course_slug, assignments_enabled, course_community_enabled, tutor_questions_enabled, alumni_participation_mode, certificate_proof_required, certificate_proof_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       assignments_enabled = VALUES(assignments_enabled),
       course_community_enabled = VALUES(course_community_enabled),
       tutor_questions_enabled = VALUES(tutor_questions_enabled),
       alumni_participation_mode = VALUES(alumni_participation_mode),
       certificate_proof_required = VALUES(certificate_proof_required),
       certificate_proof_type = VALUES(certificate_proof_type),
       updated_at = VALUES(updated_at)`,
    [slug, assignmentsEnabled, communityEnabled, tutorQuestionsEnabled, alumniMode, certificateProofRequired, certificateProofType, now, now]
  );

  return getCourseLearningFeatures(pool, slug);
}

async function createAssignmentEvent(pool, assignmentId, actorType, actorRef, eventType, note, metadata) {
  var id = Number(assignmentId || 0);
  if (!(id > 0)) return;
  var actor = clean(actorType, 24).toLowerCase() || "system";
  var event = clean(eventType, 32).toLowerCase() || "updated";
  var ref = clean(actorRef, 220) || null;
  var eventNote = clean(note, 800) || null;
  var rawMeta = metadata && typeof metadata === "object" ? metadata : null;
  var metaJson = rawMeta ? JSON.stringify(rawMeta).slice(0, 20000) : null;
  await pool.query(
    `INSERT INTO ${ASSIGNMENT_EVENTS_TABLE}
      (assignment_id, actor_type, actor_ref, event_type, event_note, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, actor, ref, event, eventNote, metaJson, nowSql()]
  );
}

async function createStudentAssignment(pool, input) {
  var ok = await ensureLearningSupportTables(pool, { bootstrap: true });
  if (!ok) throw new Error("Learning support storage is not provisioned yet.");

  var courseSlug = normalizeCourseSlug(input && input.course_slug);
  var accountId = Number(input && input.account_id || 0);
  var studentEmail = normalizeEmail(input && input.student_email);
  var studentName = clean(input && input.student_name, 180);
  var lessonId = Number(input && input.lesson_id || 0);
  var moduleId = Number(input && input.module_id || 0);
  var kind = normalizeAssignmentKind(input && input.submission_kind);
  var submissionText = clean(input && input.submission_text, 20000);
  var submissionLink = normalizeUrl(input && input.submission_link, 1500);
  var screenshotUrls = sanitizeScreenshotUrls(input && input.screenshot_urls);

  if (!courseSlug) throw new Error("course_slug is required");
  if (!(accountId > 0) || !studentEmail) throw new Error("student account is required");

  if (kind === "text" && !submissionText) throw new Error("Assignment text is required.");
  if (kind === "link" && !submissionLink) throw new Error("A valid assignment link is required.");
  if (kind === "screenshots" && !screenshotUrls.length) throw new Error("At least one screenshot is required.");

  var uuid = "asg_" + crypto.randomUUID().replace(/-/g, "");
  var now = nowSql();

  var [result] = await pool.query(
    `INSERT INTO ${ASSIGNMENTS_TABLE}
      (assignment_uuid, course_slug, account_id, student_email, student_name, lesson_id, module_id, submission_kind, submission_text, submission_link, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)`,
    [
      uuid,
      courseSlug,
      accountId,
      studentEmail,
      studentName || null,
      lessonId > 0 ? lessonId : null,
      moduleId > 0 ? moduleId : null,
      kind,
      submissionText || null,
      submissionLink || null,
      now,
      now,
    ]
  );

  var assignmentId = Number(result && result.insertId || 0);
  if (!(assignmentId > 0)) throw new Error("Could not save assignment.");

  if (screenshotUrls.length) {
    for (var i = 0; i < screenshotUrls.length; i += 1) {
      await pool.query(
        `INSERT INTO ${ASSIGNMENT_ATTACHMENTS_TABLE}
          (assignment_id, attachment_kind, attachment_url, sort_order, created_at)
         VALUES (?, 'screenshot', ?, ?, ?)`,
        [assignmentId, screenshotUrls[i], i, now]
      );
    }
  }

  await createAssignmentEvent(pool, assignmentId, "student", studentEmail, "submitted", "Assignment submitted", {
    kind: kind,
    screenshot_count: screenshotUrls.length,
  });

  return getStudentAssignmentById(pool, {
    assignment_id: assignmentId,
    account_id: accountId,
    student_email: studentEmail,
  });
}

async function loadAssignmentAttachments(pool, assignmentIds) {
  var ids = Array.from(new Set((Array.isArray(assignmentIds) ? assignmentIds : []).map(function (n) {
    return Number(n || 0);
  }).filter(function (n) {
    return n > 0;
  })));
  if (!ids.length) return new Map();
  var placeholders = ids.map(function () { return "?"; }).join(",");
  var [rows] = await pool.query(
    `SELECT assignment_id, attachment_kind, attachment_url, sort_order
     FROM ${ASSIGNMENT_ATTACHMENTS_TABLE}
     WHERE assignment_id IN (${placeholders})
     ORDER BY assignment_id ASC, sort_order ASC, id ASC`,
    ids
  );
  var map = new Map();
  (Array.isArray(rows) ? rows : []).forEach(function (row) {
    var id = Number(row && row.assignment_id || 0);
    if (!(id > 0)) return;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push({
      kind: clean(row && row.attachment_kind, 24).toLowerCase() || "file",
      url: normalizeUrl(row && row.attachment_url, 1500),
      sort_order: Number(row && row.sort_order || 0),
    });
  });
  return map;
}

function mapAssignmentRow(row, attachmentsMap) {
  var id = Number(row && row.id || 0);
  var attachments = attachmentsMap && attachmentsMap.get(id) ? attachmentsMap.get(id) : [];
  return {
    id: id,
    assignment_uuid: clean(row && row.assignment_uuid, 64),
    course_slug: normalizeCourseSlug(row && row.course_slug),
    account_id: Number(row && row.account_id || 0),
    student_email: normalizeEmail(row && row.student_email),
    student_name: clean(row && row.student_name, 180) || null,
    lesson_id: Number(row && row.lesson_id || 0) || null,
    module_id: Number(row && row.module_id || 0) || null,
    submission_kind: normalizeAssignmentKind(row && row.submission_kind),
    submission_text: clean(row && row.submission_text, 20000) || "",
    submission_link: normalizeUrl(row && row.submission_link, 1500) || "",
    status: normalizeAssignmentStatus(row && row.status),
    admin_feedback: clean(row && row.admin_feedback, 8000) || "",
    reviewed_by: clean(row && row.reviewed_by, 120) || "",
    reviewed_at: row && row.reviewed_at ? String(row.reviewed_at) : null,
    created_at: row && row.created_at ? String(row.created_at) : null,
    updated_at: row && row.updated_at ? String(row.updated_at) : null,
    attachments: attachments,
  };
}

function mapCommunityThreadRow(row) {
  return {
    id: Number(row && row.id || 0),
    thread_uuid: clean(row && row.thread_uuid, 64),
    course_slug: normalizeCourseSlug(row && row.course_slug),
    account_id: Number(row && row.account_id || 0),
    author_email: normalizeEmail(row && row.author_email),
    author_name: clean(row && row.author_name, 180) || null,
    lesson_id: Number(row && row.lesson_id || 0) || null,
    module_id: Number(row && row.module_id || 0) || null,
    question_type: normalizeCommunityQuestionType(row && row.question_type, true),
    title: clean(row && row.title, 220),
    body: clean(row && row.body, 20000),
    status: normalizeCommunityThreadStatus(row && row.status),
    replies_count: Number(row && row.replies_count || 0),
    last_activity_at: row && row.last_activity_at ? String(row.last_activity_at) : null,
    created_at: row && row.created_at ? String(row.created_at) : null,
    updated_at: row && row.updated_at ? String(row.updated_at) : null,
  };
}

function mapCommunityReplyRow(row) {
  return {
    id: Number(row && row.id || 0),
    reply_uuid: clean(row && row.reply_uuid, 64),
    thread_id: Number(row && row.thread_id || 0),
    course_slug: normalizeCourseSlug(row && row.course_slug),
    account_id: Number(row && row.account_id || 0),
    author_email: normalizeEmail(row && row.author_email),
    author_name: clean(row && row.author_name, 180) || null,
    body: clean(row && row.body, 20000),
    created_at: row && row.created_at ? String(row.created_at) : null,
    updated_at: row && row.updated_at ? String(row.updated_at) : null,
  };
}

async function getStudentAssignmentById(pool, input) {
  var assignmentId = Number(input && input.assignment_id || 0);
  var accountId = Number(input && input.account_id || 0);
  var studentEmail = normalizeEmail(input && input.student_email);
  if (!(assignmentId > 0)) return null;
  var [rows] = await pool.query(
    `SELECT id, assignment_uuid, course_slug, account_id, student_email, student_name, lesson_id, module_id,
            submission_kind, submission_text, submission_link, status, admin_feedback, reviewed_by,
            DATE_FORMAT(reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM ${ASSIGNMENTS_TABLE}
     WHERE id = ?
       AND account_id = ?
       AND LOWER(student_email) COLLATE utf8mb4_general_ci = ?
     LIMIT 1`,
    [assignmentId, accountId, studentEmail]
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  var map = await loadAssignmentAttachments(pool, [assignmentId]);
  return mapAssignmentRow(rows[0], map);
}

async function listStudentAssignments(pool, input) {
  var ok = await ensureLearningSupportTables(pool).catch(function () {
    return false;
  });
  if (!ok) return [];
  var courseSlug = normalizeCourseSlug(input && input.course_slug);
  var accountId = Number(input && input.account_id || 0);
  var studentEmail = normalizeEmail(input && input.student_email);
  var limit = Number(input && input.limit || 20);
  if (!(limit > 0)) limit = 20;
  if (limit > 100) limit = 100;
  if (!(accountId > 0) || !studentEmail || !courseSlug) return [];
  var [rows] = await pool.query(
    `SELECT id, assignment_uuid, course_slug, account_id, student_email, student_name, lesson_id, module_id,
            submission_kind, submission_text, submission_link, status, admin_feedback, reviewed_by,
            DATE_FORMAT(reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM ${ASSIGNMENTS_TABLE}
     WHERE course_slug = ?
       AND account_id = ?
       AND LOWER(student_email) COLLATE utf8mb4_general_ci = ?
     ORDER BY id DESC
     LIMIT ?`,
    [courseSlug, accountId, studentEmail, limit]
  );
  var ids = (Array.isArray(rows) ? rows : []).map(function (row) {
    return Number(row && row.id || 0);
  }).filter(function (n) {
    return n > 0;
  });
  var map = await loadAssignmentAttachments(pool, ids);
  return (Array.isArray(rows) ? rows : []).map(function (row) {
    return mapAssignmentRow(row, map);
  });
}

async function listAssignmentsForAdmin(pool, input) {
  var ok = await ensureLearningSupportTables(pool, { bootstrap: true });
  if (!ok) return { items: [], total: 0 };

  var courseSlug = normalizeCourseSlug(input && input.course_slug);
  var status = normalizeAssignmentStatus(input && input.status);
  var rawStatus = clean(input && input.status, 32).toLowerCase();
  var search = clean(input && input.search, 220).toLowerCase();
  var limit = Number(input && input.limit || 50);
  if (!(limit > 0)) limit = 50;
  if (limit > 200) limit = 200;

  var where = ["1=1"];
  var params = [];

  if (courseSlug && courseSlug !== "all") {
    where.push("course_slug = ?");
    params.push(courseSlug);
  }
  if (rawStatus && rawStatus !== "all") {
    where.push("status = ?");
    params.push(status);
  }
  if (search) {
    where.push("(LOWER(student_email) LIKE ? OR LOWER(student_name) LIKE ? OR LOWER(submission_text) LIKE ?)");
    var like = "%" + search + "%";
    params.push(like, like, like);
  }

  var [rows] = await pool.query(
    `SELECT id, assignment_uuid, course_slug, account_id, student_email, student_name, lesson_id, module_id,
            submission_kind, submission_text, submission_link, status, admin_feedback, reviewed_by,
            DATE_FORMAT(reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM ${ASSIGNMENTS_TABLE}
     WHERE ${where.join(" AND ")}
     ORDER BY id DESC
     LIMIT ?`,
    params.concat([limit])
  );

  var ids = (Array.isArray(rows) ? rows : []).map(function (row) {
    return Number(row && row.id || 0);
  }).filter(function (n) {
    return n > 0;
  });
  var map = await loadAssignmentAttachments(pool, ids);

  var [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM ${ASSIGNMENTS_TABLE}
     WHERE ${where.join(" AND ")}`,
    params
  );
  var total = Number(countRows && countRows[0] && countRows[0].total || 0);

  return {
    total: total,
    items: (Array.isArray(rows) ? rows : []).map(function (row) {
      return mapAssignmentRow(row, map);
    }),
  };
}

async function updateAssignmentByAdmin(pool, input) {
  var ok = await ensureLearningSupportTables(pool, { bootstrap: true });
  if (!ok) throw new Error("Learning support storage is not provisioned yet.");

  var assignmentId = Number(input && input.assignment_id || 0);
  var status = normalizeAssignmentStatus(input && input.status);
  var adminFeedback = clean(input && input.admin_feedback, 8000);
  var adminActor = clean(input && input.admin_actor, 120) || "admin";

  if (!(assignmentId > 0)) throw new Error("assignment_id is required");

  var now = nowSql();
  await pool.query(
    `UPDATE ${ASSIGNMENTS_TABLE}
     SET status = ?,
         admin_feedback = ?,
         reviewed_by = ?,
         reviewed_at = ?,
         updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [status, adminFeedback || null, adminActor, now, now, assignmentId]
  );

  await createAssignmentEvent(pool, assignmentId, "admin", adminActor, "status_updated", adminFeedback || "Status updated", {
    status: status,
  });

  var [rows] = await pool.query(
    `SELECT id, assignment_uuid, course_slug, account_id, student_email, student_name, lesson_id, module_id,
            submission_kind, submission_text, submission_link, status, admin_feedback, reviewed_by,
            DATE_FORMAT(reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM ${ASSIGNMENTS_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [assignmentId]
  );
  if (!Array.isArray(rows) || !rows.length) throw new Error("Assignment not found");
  var map = await loadAssignmentAttachments(pool, [assignmentId]);
  return mapAssignmentRow(rows[0], map);
}

async function createCommunityThread(pool, input) {
  var ok = await ensureLearningSupportTables(pool, { bootstrap: true });
  if (!ok) throw new Error("Learning support storage is not provisioned yet.");

  var courseSlug = normalizeCourseSlug(input && input.course_slug);
  var accountId = Number(input && input.account_id || 0);
  var authorEmail = normalizeEmail(input && input.author_email);
  var authorName = clean(input && input.author_name, 180);
  var lessonId = Number(input && input.lesson_id || 0);
  var moduleId = Number(input && input.module_id || 0);
  var title = clean(input && input.title, 220);
  var body = clean(input && input.body, 20000);
  var tutorQuestionsEnabled = !!(input && input.tutor_questions_enabled);
  var questionType = normalizeCommunityQuestionType(input && input.question_type, tutorQuestionsEnabled);
  var status = normalizeCommunityThreadStatus(input && input.status);
  if (!courseSlug) throw new Error("course_slug is required");
  if (!(accountId > 0) || !authorEmail) throw new Error("author account is required");
  if (!title) throw new Error("Thread title is required.");
  if (title.length < 4) throw new Error("Thread title must be at least 4 characters.");
  if (!body) throw new Error("Thread body is required.");
  if (body.length < 8) throw new Error("Thread body must be at least 8 characters.");

  var now = nowSql();
  var threadUuid = "comt_" + crypto.randomUUID().replace(/-/g, "");
  var [result] = await pool.query(
    `INSERT INTO ${COMMUNITY_THREADS_TABLE}
      (thread_uuid, course_slug, account_id, author_email, author_name, lesson_id, module_id, question_type, title, body, status, replies_count, last_activity_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      threadUuid,
      courseSlug,
      accountId,
      authorEmail,
      authorName || null,
      lessonId > 0 ? lessonId : null,
      moduleId > 0 ? moduleId : null,
      questionType,
      title,
      body,
      status,
      now,
      now,
      now,
    ]
  );
  var threadId = Number(result && result.insertId || 0);
  if (!(threadId > 0)) throw new Error("Could not create thread.");
  var [rows] = await pool.query(
    `SELECT id, thread_uuid, course_slug, account_id, author_email, author_name, lesson_id, module_id,
            question_type, title, body, status, replies_count,
            DATE_FORMAT(last_activity_at, '%Y-%m-%d %H:%i:%s') AS last_activity_at,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM ${COMMUNITY_THREADS_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [threadId]
  );
  if (!Array.isArray(rows) || !rows.length) throw new Error("Could not load created thread.");
  return mapCommunityThreadRow(rows[0]);
}

async function listCommunityThreads(pool, input) {
  var ok = await ensureLearningSupportTables(pool).catch(function () { return false; });
  if (!ok) return [];
  var courseSlug = normalizeCourseSlug(input && input.course_slug);
  var status = clean(input && input.status, 24).toLowerCase();
  var search = clean(input && input.search, 220).toLowerCase();
  var limit = Number(input && input.limit || 40);
  if (!(limit > 0)) limit = 40;
  if (limit > 150) limit = 150;
  if (!courseSlug) return [];

  var where = ["course_slug = ?"];
  var params = [courseSlug];
  if (status && status !== "all") {
    where.push("status = ?");
    params.push(normalizeCommunityThreadStatus(status));
  }
  if (search) {
    where.push("(LOWER(title) LIKE ? OR LOWER(body) LIKE ? OR LOWER(author_email) LIKE ? OR LOWER(author_name) LIKE ?)");
    var like = "%" + search + "%";
    params.push(like, like, like, like);
  }
  var [rows] = await pool.query(
    `SELECT id, thread_uuid, course_slug, account_id, author_email, author_name, lesson_id, module_id,
            question_type, title, body, status, replies_count,
            DATE_FORMAT(last_activity_at, '%Y-%m-%d %H:%i:%s') AS last_activity_at,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM ${COMMUNITY_THREADS_TABLE}
     WHERE ${where.join(" AND ")}
     ORDER BY last_activity_at DESC, id DESC
     LIMIT ?`,
    params.concat([limit])
  );
  return (Array.isArray(rows) ? rows : []).map(function (row) {
    return mapCommunityThreadRow(row);
  });
}

async function listCommunityReplies(pool, input) {
  var ok = await ensureLearningSupportTables(pool).catch(function () { return false; });
  if (!ok) return [];
  var courseSlug = normalizeCourseSlug(input && input.course_slug);
  var threadId = Number(input && input.thread_id || 0);
  var limit = Number(input && input.limit || 80);
  if (!(limit > 0)) limit = 80;
  if (limit > 250) limit = 250;
  if (!(threadId > 0) || !courseSlug) return [];

  var [rows] = await pool.query(
    `SELECT id, reply_uuid, thread_id, course_slug, account_id, author_email, author_name, body,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM ${COMMUNITY_REPLIES_TABLE}
     WHERE thread_id = ?
       AND course_slug = ?
     ORDER BY id ASC
     LIMIT ?`,
    [threadId, courseSlug, limit]
  );
  return (Array.isArray(rows) ? rows : []).map(function (row) {
    return mapCommunityReplyRow(row);
  });
}

async function createCommunityReply(pool, input) {
  var ok = await ensureLearningSupportTables(pool, { bootstrap: true });
  if (!ok) throw new Error("Learning support storage is not provisioned yet.");

  var courseSlug = normalizeCourseSlug(input && input.course_slug);
  var threadId = Number(input && input.thread_id || 0);
  var accountId = Number(input && input.account_id || 0);
  var authorEmail = normalizeEmail(input && input.author_email);
  var authorName = clean(input && input.author_name, 180);
  var body = clean(input && input.body, 20000);
  if (!courseSlug) throw new Error("course_slug is required");
  if (!(threadId > 0)) throw new Error("thread_id is required");
  if (!(accountId > 0) || !authorEmail) throw new Error("author account is required");
  if (!body) throw new Error("Reply body is required.");
  if (body.length < 2) throw new Error("Reply is too short.");

  var [threadRows] = await pool.query(
    `SELECT id, status
     FROM ${COMMUNITY_THREADS_TABLE}
     WHERE id = ?
       AND course_slug = ?
     LIMIT 1`,
    [threadId, courseSlug]
  );
  if (!Array.isArray(threadRows) || !threadRows.length) throw new Error("Thread not found.");
  var thread = threadRows[0] || {};
  if (normalizeCommunityThreadStatus(thread.status) === "closed") throw new Error("This thread is closed.");

  var now = nowSql();
  var replyUuid = "comr_" + crypto.randomUUID().replace(/-/g, "");
  var [result] = await pool.query(
    `INSERT INTO ${COMMUNITY_REPLIES_TABLE}
      (reply_uuid, thread_id, course_slug, account_id, author_email, author_name, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [replyUuid, threadId, courseSlug, accountId, authorEmail, authorName || null, body, now, now]
  );
  var replyId = Number(result && result.insertId || 0);
  if (!(replyId > 0)) throw new Error("Could not create reply.");

  await pool.query(
    `UPDATE ${COMMUNITY_THREADS_TABLE}
     SET replies_count = replies_count + 1,
         last_activity_at = ?,
         updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [now, now, threadId]
  );

  var [rows] = await pool.query(
    `SELECT id, reply_uuid, thread_id, course_slug, account_id, author_email, author_name, body,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM ${COMMUNITY_REPLIES_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [replyId]
  );
  if (!Array.isArray(rows) || !rows.length) throw new Error("Could not load created reply.");
  return mapCommunityReplyRow(rows[0]);
}

async function updateCommunityThreadByOwner(pool, input) {
  var ok = await ensureLearningSupportTables(pool, { bootstrap: true });
  if (!ok) throw new Error("Learning support storage is not provisioned yet.");
  var threadId = Number(input && input.thread_id || 0);
  var courseSlug = normalizeCourseSlug(input && input.course_slug);
  var accountId = Number(input && input.account_id || 0);
  var authorEmail = normalizeEmail(input && input.author_email);
  var title = clean(input && input.title, 220);
  var body = clean(input && input.body, 20000);
  if (!(threadId > 0)) throw new Error("thread_id is required");
  if (!courseSlug) throw new Error("course_slug is required");
  if (!(accountId > 0) || !authorEmail) throw new Error("author account is required");
  if (!title) throw new Error("Thread title is required.");
  if (title.length < 4) throw new Error("Thread title must be at least 4 characters.");
  if (!body) throw new Error("Thread body is required.");
  if (body.length < 8) throw new Error("Thread body must be at least 8 characters.");

  var now = nowSql();
  var [result] = await pool.query(
    `UPDATE ${COMMUNITY_THREADS_TABLE}
     SET title = ?,
         body = ?,
         updated_at = ?,
         last_activity_at = ?
     WHERE id = ?
       AND course_slug = ?
       AND account_id = ?
       AND LOWER(author_email) COLLATE utf8mb4_general_ci = ?
     LIMIT 1`,
    [title, body, now, now, threadId, courseSlug, accountId, authorEmail]
  );
  if (!result || !Number(result.affectedRows || 0)) {
    throw new Error("Thread not found or you do not have permission to edit it.");
  }
  var [rows] = await pool.query(
    `SELECT id, thread_uuid, course_slug, account_id, author_email, author_name, lesson_id, module_id,
            question_type, title, body, status, replies_count,
            DATE_FORMAT(last_activity_at, '%Y-%m-%d %H:%i:%s') AS last_activity_at,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM ${COMMUNITY_THREADS_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [threadId]
  );
  if (!Array.isArray(rows) || !rows.length) throw new Error("Thread not found.");
  return mapCommunityThreadRow(rows[0]);
}

async function deleteCommunityThreadByOwner(pool, input) {
  var ok = await ensureLearningSupportTables(pool, { bootstrap: true });
  if (!ok) throw new Error("Learning support storage is not provisioned yet.");
  var threadId = Number(input && input.thread_id || 0);
  var courseSlug = normalizeCourseSlug(input && input.course_slug);
  var accountId = Number(input && input.account_id || 0);
  var authorEmail = normalizeEmail(input && input.author_email);
  if (!(threadId > 0)) throw new Error("thread_id is required");
  if (!courseSlug) throw new Error("course_slug is required");
  if (!(accountId > 0) || !authorEmail) throw new Error("author account is required");

  var [result] = await pool.query(
    `DELETE FROM ${COMMUNITY_THREADS_TABLE}
     WHERE id = ?
       AND course_slug = ?
       AND account_id = ?
       AND LOWER(author_email) COLLATE utf8mb4_general_ci = ?
     LIMIT 1`,
    [threadId, courseSlug, accountId, authorEmail]
  );
  if (!result || !Number(result.affectedRows || 0)) {
    throw new Error("Thread not found or you do not have permission to delete it.");
  }
  await pool.query(
    `DELETE FROM ${COMMUNITY_REPLIES_TABLE}
     WHERE thread_id = ?
       AND course_slug = ?`,
    [threadId, courseSlug]
  );
  return { deleted: true, thread_id: threadId };
}

async function updateCommunityReplyByOwner(pool, input) {
  var ok = await ensureLearningSupportTables(pool, { bootstrap: true });
  if (!ok) throw new Error("Learning support storage is not provisioned yet.");
  var replyId = Number(input && input.reply_id || 0);
  var courseSlug = normalizeCourseSlug(input && input.course_slug);
  var accountId = Number(input && input.account_id || 0);
  var authorEmail = normalizeEmail(input && input.author_email);
  var body = clean(input && input.body, 20000);
  if (!(replyId > 0)) throw new Error("reply_id is required");
  if (!courseSlug) throw new Error("course_slug is required");
  if (!(accountId > 0) || !authorEmail) throw new Error("author account is required");
  if (!body) throw new Error("Reply body is required.");
  if (body.length < 2) throw new Error("Reply is too short.");

  var now = nowSql();
  var [result] = await pool.query(
    `UPDATE ${COMMUNITY_REPLIES_TABLE}
     SET body = ?,
         updated_at = ?
     WHERE id = ?
       AND course_slug = ?
       AND account_id = ?
       AND LOWER(author_email) COLLATE utf8mb4_general_ci = ?
     LIMIT 1`,
    [body, now, replyId, courseSlug, accountId, authorEmail]
  );
  if (!result || !Number(result.affectedRows || 0)) {
    throw new Error("Reply not found or you do not have permission to edit it.");
  }

  var [rows] = await pool.query(
    `SELECT id, reply_uuid, thread_id, course_slug, account_id, author_email, author_name, body,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM ${COMMUNITY_REPLIES_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [replyId]
  );
  if (!Array.isArray(rows) || !rows.length) throw new Error("Reply not found.");
  var item = mapCommunityReplyRow(rows[0]);
  await pool.query(
    `UPDATE ${COMMUNITY_THREADS_TABLE}
     SET last_activity_at = ?,
         updated_at = ?
     WHERE id = ?
       AND course_slug = ?
     LIMIT 1`,
    [now, now, Number(item.thread_id || 0), courseSlug]
  );
  return item;
}

async function deleteCommunityReplyByOwner(pool, input) {
  var ok = await ensureLearningSupportTables(pool, { bootstrap: true });
  if (!ok) throw new Error("Learning support storage is not provisioned yet.");
  var replyId = Number(input && input.reply_id || 0);
  var courseSlug = normalizeCourseSlug(input && input.course_slug);
  var accountId = Number(input && input.account_id || 0);
  var authorEmail = normalizeEmail(input && input.author_email);
  if (!(replyId > 0)) throw new Error("reply_id is required");
  if (!courseSlug) throw new Error("course_slug is required");
  if (!(accountId > 0) || !authorEmail) throw new Error("author account is required");

  var [replyRows] = await pool.query(
    `SELECT id, thread_id
     FROM ${COMMUNITY_REPLIES_TABLE}
     WHERE id = ?
       AND course_slug = ?
       AND account_id = ?
       AND LOWER(author_email) COLLATE utf8mb4_general_ci = ?
     LIMIT 1`,
    [replyId, courseSlug, accountId, authorEmail]
  );
  if (!Array.isArray(replyRows) || !replyRows.length) {
    throw new Error("Reply not found or you do not have permission to delete it.");
  }
  var threadId = Number(replyRows[0].thread_id || 0);
  await pool.query(
    `DELETE FROM ${COMMUNITY_REPLIES_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [replyId]
  );
  var now = nowSql();
  await pool.query(
    `UPDATE ${COMMUNITY_THREADS_TABLE}
     SET replies_count = GREATEST(replies_count - 1, 0),
         last_activity_at = ?,
         updated_at = ?
     WHERE id = ?
       AND course_slug = ?
     LIMIT 1`,
    [now, now, threadId, courseSlug]
  );
  return { deleted: true, reply_id: replyId, thread_id: threadId };
}

module.exports = {
  COURSE_FEATURES_TABLE,
  ASSIGNMENTS_TABLE,
  ASSIGNMENT_ATTACHMENTS_TABLE,
  ASSIGNMENT_EVENTS_TABLE,
  COMMUNITY_THREADS_TABLE,
  COMMUNITY_REPLIES_TABLE,
  ensureLearningSupportTables,
  getCourseLearningFeatures,
  saveCourseLearningFeatures,
  createStudentAssignment,
  listStudentAssignments,
  listAssignmentsForAdmin,
  updateAssignmentByAdmin,
  createCommunityThread,
  listCommunityThreads,
  listCommunityReplies,
  createCommunityReply,
  updateCommunityThreadByOwner,
  deleteCommunityThreadByOwner,
  updateCommunityReplyByOwner,
  deleteCommunityReplyByOwner,
  normalizeCourseSlug,
  normalizeAssignmentStatus,
  normalizeAssignmentKind,
  normalizeCommunityQuestionType,
  normalizeAlumniMode,
  normalizeCertificateProofType,
  normalizeUrl,
  sanitizeScreenshotUrls,
};
