const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { listPosts, getBlogImageUrl } = require("./_lib/blog-cms");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const params = new URLSearchParams(String(event.rawQuery || ""));
  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool); } catch (_error) {}
    const result = await listPosts(pool, {
      page: params.get("page") || 1,
      limit: params.get("limit") || 12,
      search: params.get("search") || "",
      status: "published",
    });
    const posts = result.posts.map((post) => Object.assign({}, post, { imageUrl: getBlogImageUrl(post.blogImage) }));
    return json(200, { ok: true, data: posts, pagination: result.pagination });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load blog posts." });
  }
};
