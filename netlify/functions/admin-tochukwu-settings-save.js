const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureAdminSettingsTable,
  upsertAdminSettings,
  listAdminSettings,
  listRecentAdminSettingsAudit,
  buildEffectiveSettings,
} = require("./_lib/admin-settings");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

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

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return json(400, { ok: false, error: "items is required" });
  }

  const entries = items.slice(0, 500).map((item) => ({
    key: clean(item && item.key, 120),
    value: clean(item && item.value, 5000),
  }));

  const pool = getPool();
  try {
    await ensureAdminSettingsTable(pool);
    await upsertAdminSettings(pool, {
      entries,
      updatedBy: "admin",
    });
    await applyRuntimeSettings(pool, { force: true });

    const rows = await listAdminSettings(pool);
    const audit = await listRecentAdminSettingsAudit(pool, 80);
    return json(200, {
      ok: true,
      message: "Settings saved",
      items: buildEffectiveSettings(rows),
      audit,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not save settings" });
  }
};
