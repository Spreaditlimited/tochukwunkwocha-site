const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureManualPaymentsTable, listManualPayments } = require("./_lib/manual-payments");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const qs = event.queryStringParameters || {};
  const status = String(qs.status || "pending_verification").trim();
  const search = String(qs.search || "").trim();
  const limit = Number(qs.limit || 80);

  const allowedStatus = new Set(["pending_verification", "approved", "rejected", "all"]);
  if (!allowedStatus.has(status)) {
    return json(400, { ok: false, error: "Invalid status" });
  }

  const pool = getPool();

  try {
    await ensureManualPaymentsTable(pool);
    const rows = await listManualPayments(pool, {
      status: status === "all" ? "" : status,
      search,
      limit,
    });

    return json(200, { ok: true, items: rows || [] });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load manual payments" });
  }
};
