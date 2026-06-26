const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { getPost, getBlogImageUrl } = require("./_lib/blog-cms");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });
  const params = new URLSearchParams(String(event.rawQuery || ""));
  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool); } catch (_error) {}
    const post = await getPost(pool, { pidBlog: params.get("pidBlog"), slug: params.get("slug") });
    if (!post) return json(404, { ok: false, error: "Blog post not found." });
    return json(200, { ok: true, data: Object.assign({}, post, { imageUrl: getBlogImageUrl(post.blogImage) }) });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load blog post." });
  }
};
