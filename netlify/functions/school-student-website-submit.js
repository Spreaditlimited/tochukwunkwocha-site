const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureSchoolTables, submitSchoolStudentWebsite } = require("./_lib/schools");
const { sendEmail } = require("./_lib/email");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const courseSlug = clean(body.course_slug, 120).toLowerCase();
  const websiteUrl = clean(body.website_url, 1000);
  if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });
  if (!websiteUrl) return json(400, { ok: false, error: "website_url is required" });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureSchoolTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const result = await submitSchoolStudentWebsite(pool, {
      accountId: Number(session.account.id || 0),
      email: String(session.account.email || "").toLowerCase(),
      courseSlug,
      websiteUrl,
    });

    const recipients = Array.isArray(result.adminRecipients) ? result.adminRecipients : [];
    for (let i = 0; i < recipients.length; i += 1) {
      const admin = recipients[i];
      try {
        await sendEmail({
          to: admin.email,
          subject: "Student Website Submission Received",
          html: [
            `<p>Hello ${clean(admin.fullName || "Admin", 180)},</p>`,
            `<p>A student has submitted their website for review.</p>`,
            `<p><strong>Student:</strong> ${clean(result.studentName, 180)} (${clean(result.studentEmail, 220)})</p>`,
            `<p><strong>School:</strong> ${clean(result.schoolName, 220)}</p>`,
            `<p><strong>Website:</strong> <a href="${clean(result.websiteUrl, 1000)}">${clean(result.websiteUrl, 1000)}</a></p>`,
          ].join("\n"),
          text: [
            `Hello ${clean(admin.fullName || "Admin", 180)},`,
            "",
            "A student has submitted their website for review.",
            `Student: ${clean(result.studentName, 180)} (${clean(result.studentEmail, 220)})`,
            `School: ${clean(result.schoolName, 220)}`,
            `Website: ${clean(result.websiteUrl, 1000)}`,
          ].join("\n"),
        });
      } catch (_error) {}
    }

    return json(200, {
      ok: true,
      website_url: result.websiteUrl,
      submitted_at: new Date().toISOString(),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not submit website URL." });
  }
};

