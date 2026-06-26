async function triggerBlogBuildHook() {
  const hookUrl = String(process.env.NETLIFY_BLOG_BUILD_HOOK_URL || process.env.NETLIFY_BUILD_HOOK_URL || "").trim();
  if (!hookUrl) return { triggered: false, reason: "missing_build_hook" };
  const response = await fetch(hookUrl, { method: "POST" });
  if (!response.ok) {
    const error = new Error(`Build hook failed with status ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  return { triggered: true };
}

module.exports = { triggerBlogBuildHook };
