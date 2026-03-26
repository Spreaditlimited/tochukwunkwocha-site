const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { setInternalCookieHeader } = require("./_lib/admin-auth");
const { ensureVerifierAccountsTable, verifyVerifierCredentials } = require("./_lib/verifier-accounts");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  try {
    await applyRuntimeSettings(getPool());
  } catch (_error) {}

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) {
    return json(400, { ok: false, error: "Email and password are required" });
  }

  const pool = getPool();
  await ensureVerifierAccountsTable(pool);
  const account = await verifyVerifierCredentials(pool, { email, password });
  if (!account) return json(401, { ok: false, error: "Invalid credentials" });

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": setInternalCookieHeader(event, "verifier"),
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({
      ok: true,
      role: "verifier",
      account: {
        verifierUuid: account.verifierUuid,
        fullName: account.fullName,
        email: account.email,
      },
    }),
  };
};
