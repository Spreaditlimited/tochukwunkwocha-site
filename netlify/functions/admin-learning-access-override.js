const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLearningAccessOverridesTable,
  getActiveLearningAccessOverride,
  setLearningAccessOverride,
} = require("./_lib/learning-access-overrides");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();
  await ensureLearningAccessOverridesTable(pool, { bootstrap: true });

  try {
    if (event.httpMethod === "GET") {
      const email = clean(event.queryStringParameters && event.queryStringParameters.email, 220).toLowerCase();
      const courseSlug = clean(event.queryStringParameters && event.queryStringParameters.course_slug, 120).toLowerCase();
      if (!email || !courseSlug) return json(400, { ok: false, error: "email and course_slug are required" });
      const override = await getActiveLearningAccessOverride(pool, {
        email: email,
        course_slug: courseSlug,
      });
      return json(200, {
        ok: true,
        override: override
          ? {
              status: override.status,
              allow_before_release: !!override.allow_before_release,
              allow_before_batch_start: !!override.allow_before_batch_start,
              expires_at: override.expires_at || null,
              note: clean(override.note, 500),
              updated_at: override.updated_at || null,
            }
          : null,
      });
    }

    const body = JSON.parse(event.body || "{}");
    const email = clean(body && body.email, 220).toLowerCase();
    const courseSlug = clean(body && body.course_slug, 120).toLowerCase();
    const action = clean(body && body.action, 24).toLowerCase();
    if (!email || !courseSlug) return json(400, { ok: false, error: "email and course_slug are required" });
    if (action !== "grant" && action !== "revoke") return json(400, { ok: false, error: "action must be grant or revoke" });

    const override = await setLearningAccessOverride(pool, {
      email: email,
      course_slug: courseSlug,
      status: action === "grant" ? "active" : "revoked",
      allow_before_release: body && body.allow_before_release,
      allow_before_batch_start: body && body.allow_before_batch_start,
      expires_at: body && body.expires_at,
      note: body && body.note,
      created_by: clean(auth.payload && auth.payload.role, 64) || "admin",
    });

    return json(200, {
      ok: true,
      action: action,
      email: email,
      course_slug: courseSlug,
      override: override
        ? {
            status: override.status,
            allow_before_release: !!override.allow_before_release,
            allow_before_batch_start: !!override.allow_before_batch_start,
            expires_at: override.expires_at || null,
            note: clean(override.note, 500),
            updated_at: override.updated_at || null,
          }
        : null,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not manage access override." });
  }
};
