const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureLeadpageTables, listLeadpageJobs, VALID_STATUSES } = require("./_lib/leadpage-jobs");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const qs = event.queryStringParameters || {};
  const statusRaw = String(qs.status || "all").trim().toLowerCase();
  const search = String(qs.search || "").trim();
  const limit = Number(qs.limit || 80);

  if (statusRaw !== "all" && !VALID_STATUSES.has(statusRaw)) {
    return json(400, { ok: false, error: "Invalid status" });
  }

  const pool = getPool();

  try {
    await ensureLeadpageTables(pool);
    const items = await listLeadpageJobs(pool, {
      status: statusRaw === "all" ? "" : statusRaw,
      search,
      limit,
    });
    return json(200, { ok: true, items: items || [] });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load leadpage jobs" });
  }
};
