const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureAdminAccountsTable, createAdminAccount } = require("./_lib/admin-accounts");

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
    const created = await createAdminAccount(pool, {
      fullName: body.fullName,
      email: body.email,
      password: body.password,
      allowedPages: body.allowedPages,
      createdBy: auth.payload && auth.payload.email ? auth.payload.email : "owner",
    });

    return json(200, { ok: true, account: created });
  } catch (error) {
    if (String(error && error.code || "") === "ER_DUP_ENTRY") {
      return json(409, { ok: false, error: "An admin account with this email already exists" });
    }
    return json(500, { ok: false, error: error.message || "Could not create admin account" });
  }
};
