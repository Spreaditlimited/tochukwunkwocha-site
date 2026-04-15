const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { getStudentCourseAccessAudit } = require("./_lib/learning-progress");
const { getTranscriptAccessByEmail, ensureTranscriptAccessTables } = require("./_lib/transcript-access");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const email = clean(event.queryStringParameters && event.queryStringParameters.email, 220).toLowerCase();
  const courseSlug = clean(event.queryStringParameters && event.queryStringParameters.course_slug, 120).toLowerCase() || "prompt-to-profit";
  if (!email) return json(400, { ok: false, error: "email is required" });

  const pool = getPool();
  try {
    await ensureTranscriptAccessTables(pool);
    const audit = await getStudentCourseAccessAudit(pool, {
      account_email: email,
      course_slug: courseSlug,
    });
    const transcript = await getTranscriptAccessByEmail(pool, {
      email,
      course_slug: courseSlug,
    }).catch(function () {
      return { account: null, access: null };
    });
    return json(200, {
      ok: true,
      audit,
      transcript_access: transcript && transcript.access
        ? {
            status: clean(transcript.access.status, 32) || "pending",
            requested_at: transcript.access.requested_at || null,
            approved_at: transcript.access.approved_at || null,
            expires_at: transcript.access.expires_at || null,
          }
        : {
            status: "none",
            requested_at: null,
            approved_at: null,
            expires_at: null,
          },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not check access." });
  }
};
