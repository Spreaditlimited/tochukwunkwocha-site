const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { ensureVerifierAccountsTable, resetVerifierPasswordByEmail } = require("./_lib/verifier-accounts");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  try {
    await ensureVerifierAccountsTable(pool);
    await resetVerifierPasswordByEmail(pool, {
      email: body.email,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });
    return json(200, { ok: true });
  } catch (error) {
    const message = String(error && error.message ? error.message : "Could not reset password");
    const badRequest = /required|invalid credentials/i.test(message);
    return json(badRequest ? 400 : 500, { ok: false, error: message });
  }
};
