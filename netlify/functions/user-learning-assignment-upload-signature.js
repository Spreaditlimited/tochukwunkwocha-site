const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireStudentSession } = require("./_lib/user-auth");
const { hasCourseAccess } = require("./_lib/learning-progress");
const {
  ensureLearningSupportTables,
  getCourseLearningFeatures,
  normalizeCourseSlug,
} = require("./_lib/learning-support");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const pool = getPool();
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();

  if (!cloudName || !apiKey || !apiSecret) {
    return json(500, { ok: false, error: "Cloudinary not configured" });
  }

  try {
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    let body = {};
    try {
      body = event && event.body ? JSON.parse(event.body) : {};
    } catch (_error) {
      body = {};
    }

    const courseSlug = normalizeCourseSlug(body && body.course_slug);
    if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });

    await ensureLearningSupportTables(pool, { bootstrap: true });
    const access = await hasCourseAccess(pool, session.account.email, courseSlug);
    if (!access) return json(403, { ok: false, error: "You do not currently have access to this course." });

    const features = await getCourseLearningFeatures(pool, courseSlug);
    if (!features.assignments_enabled) {
      return json(403, { ok: false, error: "Assignment submission is currently disabled for this course." });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = [
      "tochukwunkwocha-site",
      "learning-assignments",
      courseSlug,
      "acct-" + String(Number(session.account.id || 0)),
    ].join("/");
    const source = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash("sha1").update(source).digest("hex");

    return json(200, {
      ok: true,
      cloudName,
      apiKey,
      timestamp,
      folder,
      signature,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not prepare upload." });
  }
};
