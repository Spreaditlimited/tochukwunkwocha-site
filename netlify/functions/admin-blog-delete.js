const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { destroyCloudinaryAsset } = require("./_lib/cloudinary");
const { deletePost, normalizeBlogImagePublicId } = require("./_lib/blog-cms");
const { triggerBlogBuildHook } = require("./_lib/build-hooks");

exports.handler = async function (event) {
  if (event.httpMethod !== "DELETE") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });
  const params = new URLSearchParams(String(event.rawQuery || ""));
  const pidBlog = String(params.get("pidBlog") || "").trim();
  if (!pidBlog) return json(400, { ok: false, error: "Blog ID is required." });
  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool); } catch (_error) {}
    const deleted = await deletePost(pool, pidBlog);
    if (!deleted) return json(404, { ok: false, error: "Blog post not found." });
    if (deleted.blogImage) {
      destroyCloudinaryAsset(normalizeBlogImagePublicId(deleted.blogImage)).catch((error) => {
        console.error("blog_image_delete_failed", error && error.message ? error.message : error);
      });
    }
    let buildHook = { triggered: false };
    try {
      buildHook = await triggerBlogBuildHook();
    } catch (error) {
      console.error("blog_build_hook_failed", error && error.message ? error.message : error);
      buildHook = { triggered: false, error: error.message || "Build hook failed" };
    }
    return json(200, { ok: true, buildHook });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not delete blog post." });
  }
};
