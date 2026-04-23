const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ALL_INTERNAL_PAGE_PATHS, ensureAdminAccountsTable, listAdminAccounts } = require("./_lib/admin-accounts");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });
  if (!(auth.payload && auth.payload.isOwner === true)) {
    return json(403, { ok: false, error: "Only owner can manage admin accounts" });
  }

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}

    await ensureAdminAccountsTable(pool);
    const accounts = await listAdminAccounts(pool);
    return json(200, {
      ok: true,
      pageOptions: ALL_INTERNAL_PAGE_PATHS,
      accounts,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load admin accounts" });
  }
};
