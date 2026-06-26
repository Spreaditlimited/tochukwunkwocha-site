const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { getPost } = require("./_lib/blog-cms");
const { generateLeadMagnetForPost } = require("../../scripts/blog-generate-lead-magnets.js");

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

  const pidBlog = clean(body.pidBlog, 80);
  if (!pidBlog) return json(400, { ok: false, error: "Blog ID is required. Save the post before generating a PDF lead magnet." });

  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool, { force: true }); } catch (_error) {}
    const post = await getPost(pool, { pidBlog });
    if (!post) return json(404, { ok: false, error: "Blog post not found." });

    const result = await generateLeadMagnetForPost(pool, post, {
      timeoutMs: Math.max(15000, Number(process.env.OPENAI_LEAD_MAGNET_TIMEOUT_MS || "120000") || 120000),
      chromePath: process.env.CHROME_PATH,
      model: process.env.OPENAI_LEAD_MAGNET_MODEL || process.env.OPENAI_MODEL,
    });

    return json(200, {
      ok: true,
      leadMagnet: result.leadMagnet,
      pdf: result.pdf,
    });
  } catch (error) {
    return json(error.statusCode || 500, { ok: false, error: error.message || "Could not generate blog PDF lead magnet." });
  }
};
