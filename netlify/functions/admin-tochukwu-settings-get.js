const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureAdminSettingsTable,
  listAdminSettings,
  listRecentAdminSettingsAudit,
  buildEffectiveSettings,
} = require("./_lib/admin-settings");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  try {
    await applyRuntimeSettings(getPool());
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();
  try {
    await ensureAdminSettingsTable(pool);
    const rows = await listAdminSettings(pool);
    const audit = await listRecentAdminSettingsAudit(pool, 80);
    return json(200, {
      ok: true,
      items: buildEffectiveSettings(rows),
      audit,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load settings" });
  }
};
