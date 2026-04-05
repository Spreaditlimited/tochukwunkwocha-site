const { nowSql } = require("./db");
const { MODULES_TABLE, ensureLearningTables } = require("./learning");
const { sendEmail } = require("./email");
const { getCourseName } = require("./course-config");
const { SCHOOL_ACCOUNTS_TABLE, SCHOOL_STUDENTS_TABLE } = require("./schools");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

async function listDripDueModules(pool, courseSlug) {
  const [rows] = await pool.query(
    `SELECT id, module_title, DATE_FORMAT(drip_at, '%Y-%m-%d %H:%i:%s') AS drip_at
     FROM ${MODULES_TABLE}
     WHERE course_slug = ?
       AND is_active = 1
       AND COALESCE(drip_enabled, 0) = 1
       AND drip_at IS NOT NULL
       AND drip_at <= NOW()
       AND drip_notified_at IS NULL
     ORDER BY sort_order ASC, id ASC`,
    [courseSlug]
  );
  return Array.isArray(rows) ? rows : [];
}

async function listCourseRecipients(pool, courseSlug) {
  const [rows] = await pool.query(
    `SELECT DISTINCT email FROM (
       SELECT LOWER(email) AS email
       FROM course_orders
       WHERE course_slug = ?
         AND status = 'paid'

       UNION

       SELECT LOWER(email) AS email
       FROM course_manual_payments
       WHERE course_slug = ?
         AND status = 'approved'

       UNION

       SELECT LOWER(ss.email) AS email
       FROM ${SCHOOL_STUDENTS_TABLE} ss
       JOIN ${SCHOOL_ACCOUNTS_TABLE} sc ON sc.id = ss.school_id
       WHERE sc.course_slug = ?
         AND sc.status = 'active'
         AND ss.status = 'active'
         AND (sc.access_starts_at IS NULL OR sc.access_starts_at <= NOW())
         AND (sc.access_expires_at IS NULL OR sc.access_expires_at >= NOW())
     ) x
     WHERE email IS NOT NULL
       AND email <> ''`,
    [courseSlug, courseSlug, courseSlug]
  );
  return (rows || []).map(function (row) {
    return clean(row.email, 220).toLowerCase();
  }).filter(Boolean);
}

async function markModulesNotified(pool, moduleIds) {
  const ids = Array.isArray(moduleIds) ? moduleIds.filter(function (id) {
    return Number.isFinite(Number(id)) && Number(id) > 0;
  }) : [];
  if (!ids.length) return;
  const placeholders = ids.map(function () { return "?"; }).join(",");
  await pool.query(
    `UPDATE ${MODULES_TABLE}
     SET drip_notified_at = ?, updated_at = ?
     WHERE id IN (${placeholders})`,
    [nowSql(), nowSql()].concat(ids)
  );
}

async function notifyDueDripModules(pool, courseSlugInput) {
  await ensureLearningTables(pool);
  const courseSlug = clean(courseSlugInput, 120).toLowerCase();
  if (!courseSlug) return { sent: 0, modules: 0, recipients: 0 };

  const modules = await listDripDueModules(pool, courseSlug);
  if (!modules.length) return { sent: 0, modules: 0, recipients: 0 };
  const recipients = await listCourseRecipients(pool, courseSlug);
  if (!recipients.length) {
    await markModulesNotified(pool, modules.map(function (m) { return Number(m.id); }));
    return { sent: 0, modules: modules.length, recipients: 0 };
  }

  const courseName = clean(getCourseName(courseSlug), 180) || "Your Course";
  const moduleTitles = modules.map(function (m) {
    return clean(m.module_title, 220);
  }).filter(Boolean);
  const titleLine = moduleTitles.length === 1
    ? moduleTitles[0]
    : moduleTitles.slice(0, 3).join(", ");
  let sent = 0;
  for (let i = 0; i < recipients.length; i += 1) {
    const to = recipients[i];
    try {
      await sendEmail({
        to,
        subject: `${courseName}: New module is now available`,
        html: [
          `<p>Hello,</p>`,
          `<p>A new module is now available in <strong>${courseName}</strong>.</p>`,
          `<p><strong>Module:</strong> ${titleLine}</p>`,
          `<p>Sign in to your dashboard to continue learning.</p>`,
        ].join("\n"),
        text: [
          "Hello,",
          "",
          `A new module is now available in ${courseName}.`,
          `Module: ${titleLine}`,
          "",
          "Sign in to your dashboard to continue learning.",
        ].join("\n"),
      });
      sent += 1;
    } catch (_error) {}
  }

  await markModulesNotified(pool, modules.map(function (m) { return Number(m.id); }));
  return { sent, modules: modules.length, recipients: recipients.length };
}

async function listDueCourseSlugs(pool) {
  const [rows] = await pool.query(
    `SELECT DISTINCT course_slug
     FROM ${MODULES_TABLE}
     WHERE is_active = 1
       AND COALESCE(drip_enabled, 0) = 1
       AND drip_at IS NOT NULL
       AND drip_at <= NOW()
       AND drip_notified_at IS NULL`
  );
  return (rows || []).map(function (row) {
    return clean(row.course_slug, 120).toLowerCase();
  }).filter(Boolean);
}

async function notifyDueDripModulesAll(pool) {
  await ensureLearningTables(pool);
  const slugs = await listDueCourseSlugs(pool);
  if (!slugs.length) return { courses: 0, modules: 0, recipients: 0, sent: 0 };

  const out = { courses: slugs.length, modules: 0, recipients: 0, sent: 0 };
  for (let i = 0; i < slugs.length; i += 1) {
    const result = await notifyDueDripModules(pool, slugs[i]);
    out.modules += Number(result && result.modules || 0);
    out.recipients += Number(result && result.recipients || 0);
    out.sent += Number(result && result.sent || 0);
  }
  return out;
}

module.exports = {
  notifyDueDripModules,
  notifyDueDripModulesAll,
};
