const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { getPost, getBlogImageUrl } = require("./_lib/blog-cms");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const params = new URLSearchParams(String(event.rawQuery || ""));
  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool); } catch (_error) {}
    const post = await getPost(pool, { pidBlog: params.get("pidBlog"), slug: params.get("slug") });
    if (!post || !post.blogPublished) return json(404, { ok: false, error: "Blog post not found." });
    const publishedAt = post.createdAt ? new Date(String(post.createdAt).replace(" ", "T")) : null;
    if (publishedAt && Number.isFinite(publishedAt.getTime()) && publishedAt.getTime() > Date.now()) {
      return json(404, { ok: false, error: "Blog post not found." });
    }
    return json(200, { ok: true, data: Object.assign({}, post, { imageUrl: getBlogImageUrl(post.blogImage) }) });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load blog post." });
  }
};
