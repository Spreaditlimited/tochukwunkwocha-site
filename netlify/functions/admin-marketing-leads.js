const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { getMarketingLeadDashboard } = require("./_lib/marketing-leads");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const params = new URLSearchParams(String(event.rawQuery || ""));
  const days = Number(params.get("days") || 30);
  const limit = Number(params.get("limit") || 100);

  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool); } catch (_error) {}
    const dashboard = await getMarketingLeadDashboard(pool, { days, limit });
    return json(200, { ok: true, dashboard });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load marketing leads." });
  }
};
