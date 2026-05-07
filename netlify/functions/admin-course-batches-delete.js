const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureCourseBatchesTable, deleteCourseBatch } = require("./_lib/batch-store");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug } = require("./_lib/course-config");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  try {
    await applyRuntimeSettings(getPool());
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const courseSlug = normalizeCourseSlug(body.courseSlug, DEFAULT_COURSE_SLUG);
  const batchKey = String(body.batchKey || "").trim();
  if (!batchKey) return json(400, { ok: false, error: "batchKey is required" });

  const pool = getPool();
  try {
    await ensureCourseBatchesTable(pool);
    const removed = await deleteCourseBatch(pool, { courseSlug, batchKey });
    return json(200, { ok: true, courseSlug, removed: !!removed });
  } catch (error) {
    return json(400, { ok: false, error: error.message || "Could not delete batch" });
  }
};
