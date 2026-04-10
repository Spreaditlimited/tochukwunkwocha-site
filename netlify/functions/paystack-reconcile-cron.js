const { json } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const { ensureCourseBatchesTable } = require("./_lib/batch-store");
const { reconcileCoursePaystackOrders } = require("./_lib/orders");
const { listCourseConfigs, normalizeCourseSlug, DEFAULT_COURSE_SLUG } = require("./_lib/course-config");

exports.handler = async function (event) {
  const method = String(event && event.httpMethod || "").toUpperCase();
  if (method && method !== "GET" && method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
    await ensureCourseOrdersBatchColumns(pool);
    await ensureCourseBatchesTable(pool);

    const slugs = Array.from(new Set(
      (listCourseConfigs() || [])
        .map((cfg) => normalizeCourseSlug(cfg && cfg.slug, DEFAULT_COURSE_SLUG))
        .filter(Boolean)
    ));
    if (!slugs.length) slugs.push(DEFAULT_COURSE_SLUG);

    const results = [];
    for (const slug of slugs) {
      const summary = await reconcileCoursePaystackOrders(pool, { limit: 120, courseSlug: slug, batchKey: "all" });
      results.push({ courseSlug: slug, ...summary });
    }

    return json(200, { ok: true, results });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Reconcile failed" });
  }
};
