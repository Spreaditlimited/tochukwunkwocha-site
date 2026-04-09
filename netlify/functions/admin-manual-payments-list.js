const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureManualPaymentsTable,
  listPaymentsQueue,
  getPaymentsQueueSummary,
} = require("./_lib/manual-payments");
const { reconcileCoursePaystackOrders } = require("./_lib/orders");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug } = require("./_lib/course-config");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const qs = event.queryStringParameters || {};
  const status = String(qs.status || "pending_verification").trim();
  const search = String(qs.search || "").trim();
  const limit = Number(qs.limit || 80);
  const reconcile = String(qs.reconcile || "0").trim() !== "0";
  const includeSummary = String(qs.include_summary || "1").trim() !== "0";
  const batchKey = String(qs.batch_key || "").trim();
  const summaryBatchKey = String(qs.summary_batch_key || batchKey || "").trim();
  const courseSlug = normalizeCourseSlug(qs.course_slug, DEFAULT_COURSE_SLUG);
  const summaryCourseSlugRaw = String(qs.summary_course_slug || "").trim().toLowerCase();
  const summaryCourseSlug = summaryCourseSlugRaw === "all"
    ? "all"
    : normalizeCourseSlug(summaryCourseSlugRaw || courseSlug, DEFAULT_COURSE_SLUG);

  const allowedStatus = new Set(["pending_verification", "approved", "rejected", "all"]);
  if (!allowedStatus.has(status)) {
    return json(400, { ok: false, error: "Invalid status" });
  }

  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  try {
    await ensureManualPaymentsTable(pool);
    await ensureCourseOrdersBatchColumns(pool);
    let reconcileResult = null;
    if (reconcile) {
      reconcileResult = await reconcileCoursePaystackOrders(pool, { limit: 80, batchKey, courseSlug });
    }
    const rowsPromise = listPaymentsQueue(pool, {
      courseSlug,
      status: status === "all" ? "" : status,
      search,
      limit,
      batchKey,
    });
    const summaryPromise = includeSummary
      ? getPaymentsQueueSummary(pool, {
          courseSlug: summaryCourseSlug,
          batchKey: summaryBatchKey,
        })
      : Promise.resolve(null);
    const [rows, summary] = await Promise.all([rowsPromise, summaryPromise]);

    return json(200, { ok: true, items: rows || [], summary, reconcile: reconcileResult });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load manual payments" });
  }
};
