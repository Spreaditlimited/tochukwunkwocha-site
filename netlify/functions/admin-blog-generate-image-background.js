const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { processBlogImageJob } = require("./_lib/blog-image-generation");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 1000);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const jobUuid = clean(body.jobUuid, 80);
  if (!jobUuid) return json(400, { ok: false, error: "jobUuid is required." });

  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool, { force: true }); } catch (_error) {}
    const job = await processBlogImageJob(pool, jobUuid);
    return json(200, { ok: true, job });
  } catch (error) {
    return json(error.statusCode || 500, { ok: false, error: error.message || "Could not generate blog image." });
  }
};
