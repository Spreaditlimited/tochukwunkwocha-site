const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { badMethod, json } = require("./_lib/http");
const { getLeadMagnetFileBySlug } = require("./_lib/blog-lead-magnets");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function safeFilename(value) {
  const name = clean(value, 180).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return name && name.toLowerCase().endsWith(".pdf") ? name : "lead-magnet.pdf";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const qs = event.queryStringParameters || {};
  const slug = clean(qs.slug, 255);
  if (!slug) return json(400, { ok: false, error: "slug is required" });

  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool); } catch (_error) {}
    const file = await getLeadMagnetFileBySlug(pool, slug);
    if (!file || !file.buffer || !file.buffer.length) {
      return json(404, { ok: false, error: "Lead magnet PDF not found" });
    }
    const filename = safeFilename(file.filename || `${file.slug}.pdf`);
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(file.buffer.length),
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
      body: file.buffer.toString("base64"),
    };
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not download lead magnet PDF." });
  }
};
