const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureVerifierAccountsTable, updateVerifierPassword } = require("./_lib/verifier-accounts");

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
    await updateVerifierPassword(pool, {
      verifierUuid: body.verifierUuid,
      password: body.password,
    });
    return json(200, { ok: true, message: "Verifier password updated" });
  } catch (error) {
    return json(400, { ok: false, error: error.message || "Could not update verifier password" });
  }
};
