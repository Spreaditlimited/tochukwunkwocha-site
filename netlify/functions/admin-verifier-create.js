const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureVerifierAccountsTable, createVerifierAccount } = require("./_lib/verifier-accounts");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  try {
    await ensureVerifierAccountsTable(pool);
    const row = await createVerifierAccount(pool, {
      fullName: body.fullName,
      email: body.email,
      password: body.password,
      createdBy: "admin",
    });
    return json(200, {
      ok: true,
      item: row
        ? {
            verifierUuid: row.verifier_uuid,
            fullName: row.full_name,
            email: row.email,
            isActive: Number(row.is_active || 0) === 1,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastLoginAt: row.last_login_at,
          }
        : null,
    });
  } catch (error) {
    const message = String(error && error.message ? error.message : "Could not create verifier");
    const conflict = /duplicate|unique|email/i.test(message);
    return json(conflict ? 409 : 500, { ok: false, error: conflict ? "Verifier email already exists" : message });
  }
};
