const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { getBlogImageJob } = require("./_lib/blog-image-generation");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const params = new URLSearchParams(String(event.rawQuery || ""));
  const jobUuid = String(params.get("jobUuid") || "").trim();
  if (!jobUuid) return json(400, { ok: false, error: "jobUuid is required." });

  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool); } catch (_error) {}
    const job = await getBlogImageJob(pool, jobUuid);
    if (!job) return json(404, { ok: false, error: "Image generation job not found." });
    return json(200, { ok: true, job });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load image generation job." });
  }
};
