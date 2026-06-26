const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { listPosts, getBlogImageUrl } = require("./_lib/blog-cms");
const { listLeadMagnetsForPosts } = require("./_lib/blog-lead-magnets");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });
  const params = new URLSearchParams(String(event.rawQuery || ""));
  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool); } catch (_error) {}
    const result = await listPosts(pool, {
      page: params.get("page") || 1,
      limit: params.get("limit") || 20,
      search: params.get("search") || "",
      status: params.get("status") || "",
    });
    const leadMagnets = await listLeadMagnetsForPosts(pool, result.posts.map((post) => post.pidBlog)).catch(() => new Map());
    result.posts = result.posts.map((post) => {
      const leadMagnet = leadMagnets.get(post.pidBlog) || null;
      return Object.assign({}, post, {
        imageUrl: getBlogImageUrl(post.blogImage),
        leadMagnet: leadMagnet ? {
          active: Boolean(leadMagnet.active),
          title: leadMagnet.title,
          slug: leadMagnet.slug,
        } : null,
      });
    });
    return json(200, { ok: true, data: result.posts, pagination: result.pagination, stats: result.stats });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load blog posts." });
  }
};
