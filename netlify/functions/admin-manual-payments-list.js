const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureManualPaymentsTable,
  listPaymentsQueue,
  getPaymentsQueueSummary,
} = require("./_lib/manual-payments");
const { reconcilePromptToProfitPaystackOrders } = require("./_lib/orders");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const qs = event.queryStringParameters || {};
  const status = String(qs.status || "pending_verification").trim();
  const search = String(qs.search || "").trim();
  const limit = Number(qs.limit || 80);
  const reconcile = String(qs.reconcile || "1").trim() !== "0";
  const batchKey = String(qs.batch_key || "").trim();

  const allowedStatus = new Set(["pending_verification", "approved", "rejected", "all"]);
  if (!allowedStatus.has(status)) {
    return json(400, { ok: false, error: "Invalid status" });
  }

  const pool = getPool();

  try {
    await ensureManualPaymentsTable(pool);
    await ensureCourseOrdersBatchColumns(pool);
    let reconcileResult = null;
    if (reconcile) {
      reconcileResult = await reconcilePromptToProfitPaystackOrders(pool, { limit: 80, batchKey });
    }
    const rows = await listPaymentsQueue(pool, {
      status: status === "all" ? "" : status,
      search,
      limit,
      batchKey,
    });
    const summary = await getPaymentsQueueSummary(pool, { batchKey });

    return json(200, { ok: true, items: rows || [], summary, reconcile: reconcileResult });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load manual payments" });
  }
};
