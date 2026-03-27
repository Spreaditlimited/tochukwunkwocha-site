const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureCourseBatchesTable, getActiveCourseBatch, getCourseBatchByKey } = require("./_lib/batch-store");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug, getCourseConfig, listCourseConfigs } = require("./_lib/course-config");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const courseSlug = normalizeCourseSlug(
    event.queryStringParameters && event.queryStringParameters.course_slug,
    DEFAULT_COURSE_SLUG
  );

  const pool = getPool();
  try {
    await ensureCourseBatchesTable(pool);
    let active = await getActiveCourseBatch(pool, courseSlug);
    const cfg = getCourseConfig(courseSlug);
    const defaultKey = cfg && cfg.defaultBatchKey ? String(cfg.defaultBatchKey) : "";
    if (active && defaultKey) {
      const activeKey = String(active.batch_key || "");
      const currentPrefix = defaultKey.split("-")[0];
      const expectedPrefix = currentPrefix ? `${currentPrefix}-` : "";
      const otherPrefixes = (listCourseConfigs() || [])
        .map((item) => String(item && item.defaultBatchKey ? item.defaultBatchKey : "").split("-")[0])
        .filter((p) => p && p !== currentPrefix)
        .map((p) => `${p}-`);

      const looksLikeOtherCourse = otherPrefixes.some((p) => activeKey.startsWith(p));
      if (looksLikeOtherCourse && expectedPrefix && !activeKey.startsWith(expectedPrefix)) {
        const fallback = await getCourseBatchByKey(pool, courseSlug, defaultKey);
        if (fallback) active = fallback;
      }
    }
    return json(200, {
      ok: true,
      courseSlug,
      activeBatch: active
        ? {
            batchKey: active.batch_key,
            batchLabel: active.batch_label,
            status: active.status,
            batchStartAt: active.batch_start_at || null,
            paystackReferencePrefix: active.paystack_reference_prefix,
            paystackAmountMinor: Number(active.paystack_amount_minor || 0),
            paypalAmountMinor: Number(active.paypal_amount_minor || 0),
          }
        : null,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load active batch" });
  }
};
