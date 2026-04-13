const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const { ensureSchoolTables, requireSchoolAdminSession, parseCsv, addSchoolStudents } = require("./_lib/schools");
const { createPasswordResetToken } = require("./_lib/student-auth");
const { sendEmail } = require("./_lib/email");
const { ensureAffiliateTables, createAffiliateCommissionForSchoolStudentOnboard } = require("./_lib/affiliates");

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function humanCourseName(slug) {
  const course = clean(slug, 120).toLowerCase();
  if (course === "prompt-to-profit") return "Prompt to Profit";
  if (course === "prompt-to-production") return "Prompt to Profit Advanced";
  return course || "Course";
}

function siteBaseUrl() {
  return clean(process.env.SITE_BASE_URL || "https://tochukwunkwocha.com", 1000).replace(/\/$/, "");
}

async function sendStudentInviteEmails(pool, session, invites) {
  const raw = Array.isArray(invites) ? invites : [];
  const dedupedMap = new Map();
  raw.forEach(function (item) {
    const emailKey = clean(item && item.email, 220).toLowerCase();
    if (!emailKey) return;
    if (!dedupedMap.has(emailKey)) dedupedMap.set(emailKey, item);
  });
  const list = Array.prototype.slice.call(dedupedMap.values());
  if (!list.length) return { sent: 0, failed: 0, errors: [] };
  const loginUrl = `${siteBaseUrl()}/dashboard/`;
  const resetRequestUrl = `${siteBaseUrl()}/dashboard/`;
  const courseName = humanCourseName(session && session.admin && session.admin.courseSlug);
  let sent = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < list.length; i += 1) {
    const invite = list[i] || {};
    const email = clean(invite.email, 220).toLowerCase();
    const fullName = clean(invite.full_name, 180) || "Student";
    if (!email) continue;
    try {
      const reset = await createPasswordResetToken(pool, email, { neverExpires: true });
      const resetLink = reset && reset.token
        ? `${siteBaseUrl()}/dashboard/reset-password/?token=${encodeURIComponent(reset.token)}`
        : "";
      const html = [
        `<p>Hello ${fullName},</p>`,
        `<p>Your school has enrolled you in <strong>${courseName}</strong> on Tochukwu Tech and AI Academy.</p>`,
        `<p>Sign in here: <a href="${loginUrl}">${loginUrl}</a></p>`,
        resetLink
          ? `<p>Set your password here: <a href="${resetLink}">${resetLink}</a></p>`
          : `<p>If you don't know your password yet, use "Forgot password?" on <a href="${resetRequestUrl}">${resetRequestUrl}</a>.</p>`,
        "<p>Welcome and all the best.</p>",
      ].join("\n");
      const text = [
        `Hello ${fullName},`,
        "",
        `Your school has enrolled you in ${courseName} on Tochukwu Tech and AI Academy.`,
        `Sign in: ${loginUrl}`,
        resetLink
          ? `Set your password: ${resetLink}`
          : `If you don't know your password yet, use "Forgot password?" on ${resetRequestUrl}`,
      ].join("\n");
      await sendEmail({
        to: email,
        subject: `You have been enrolled in ${courseName}`,
        html,
        text,
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      errors.push(`Invite failed for ${email}: ${error && error.message ? error.message : "unknown error"}`);
    }
  }
  return { sent, failed, errors };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    await ensureAffiliateTables(pool);
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const csv = String(body.csv || "").trim();
    if (!csv) return json(400, { ok: false, error: "CSV content is required" });
    const parsed = parseCsv(csv);
    if (!parsed.length) return json(400, { ok: false, error: "CSV is empty" });

    const header = parsed[0].map((col) => String(col || "").trim().toLowerCase());
    const fullNameIndex = header.findIndex((col) => col === "full_name" || col === "name");
    const emailIndex = header.findIndex((col) => col === "email");
    if (fullNameIndex === -1 || emailIndex === -1) {
      return json(400, { ok: false, error: "CSV header must include full_name and email columns" });
    }

    const rows = parsed.slice(1).map((cols) => ({
      full_name: cols[fullNameIndex],
      email: cols[emailIndex],
    }));
    const result = await addSchoolStudents(pool, {
      schoolId: session.admin.schoolId,
      courseSlug: session.admin.courseSlug,
      rows,
    });
    const createdIds = Array.isArray(result && result.createdStudentIds) ? result.createdStudentIds : [];
    for (let i = 0; i < createdIds.length; i += 1) {
      await createAffiliateCommissionForSchoolStudentOnboard(pool, {
        schoolStudentId: Number(createdIds[i]),
      }).catch(function () {
        return null;
      });
    }
    const invites = await sendStudentInviteEmails(pool, session, result && result.invites);
    result.invites_sent = Number(invites.sent || 0);
    result.invites_failed = Number(invites.failed || 0);
    result.invite_errors = Array.isArray(invites.errors) ? invites.errors : [];
    delete result.invites;
    delete result.createdStudentIds;
    return json(200, { ok: true, result });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not upload students." });
  }
};
