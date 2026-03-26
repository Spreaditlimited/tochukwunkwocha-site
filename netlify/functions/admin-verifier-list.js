const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureVerifierAccountsTable, listVerifierAccounts } = require("./_lib/verifier-accounts");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  try {
    await ensureVerifierAccountsTable(pool);
    const rows = await listVerifierAccounts(pool);
    return json(200, {
      ok: true,
      items: (rows || []).map((row) => ({
        verifierUuid: row.verifier_uuid,
        fullName: row.full_name,
        email: row.email,
        isActive: Number(row.is_active || 0) === 1,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastLoginAt: row.last_login_at,
      })),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load verifiers" });
  }
};
