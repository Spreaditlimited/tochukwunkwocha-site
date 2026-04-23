const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureAdminAccountsTable, updateAdminAccount } = require("./_lib/admin-accounts");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });
  if (!(auth.payload && auth.payload.isOwner === true)) {
    return json(403, { ok: false, error: "Only owner can manage admin accounts" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}

    await ensureAdminAccountsTable(pool);
    const payload = { adminUuid: body.adminUuid };
    if (Object.prototype.hasOwnProperty.call(body || {}, "isActive")) payload.isActive = body.isActive;
    if (Object.prototype.hasOwnProperty.call(body || {}, "allowedPages")) payload.allowedPages = body.allowedPages;
    if (Object.prototype.hasOwnProperty.call(body || {}, "password")) payload.password = body.password;

    await updateAdminAccount(pool, payload);

    return json(200, { ok: true });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not update admin account" });
  }
};
