const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { setAdminCookieHeader, verifyAdminPassword } = require("./_lib/admin-auth");
const { ALL_INTERNAL_PAGE_PATHS } = require("./_lib/admin-permissions");
const { ensureAdminAccountsTable, verifyAdminCredentials } = require("./_lib/admin-accounts");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  try {
    const pool = getPool();
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "").trim();
  if (!password) {
    return json(400, { ok: false, error: "Password is required" });
  }

  if (email) {
    const pool = getPool();
    await ensureAdminAccountsTable(pool);
    const account = await verifyAdminCredentials(pool, { email, password });
    if (!account) return json(401, { ok: false, error: "Invalid credentials" });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie": setAdminCookieHeader(event, {
          adminUuid: account.adminUuid,
          email: account.email,
          fullName: account.fullName,
          isOwner: account.isOwner === true,
          allowedPages: account.isOwner ? ALL_INTERNAL_PAGE_PATHS : account.allowedPages,
        }),
      },
      body: JSON.stringify({
        ok: true,
        role: "admin",
        account: {
          adminUuid: account.adminUuid,
          email: account.email,
          fullName: account.fullName,
          isOwner: account.isOwner === true,
          allowedPages: account.isOwner ? ALL_INTERNAL_PAGE_PATHS : account.allowedPages,
        },
      }),
    };
  }

  const auth = verifyAdminPassword(password);
  if (!auth.ok) {
    const status = auth.error === "Missing ADMIN_DASHBOARD_PASSWORD" ? 500 : 401;
    return json(status, { ok: false, error: auth.error });
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": setAdminCookieHeader(event, {
        adminUuid: "owner",
        email: "owner@local",
        fullName: "Owner",
        isOwner: true,
        allowedPages: ALL_INTERNAL_PAGE_PATHS,
      }),
    },
    body: JSON.stringify({
      ok: true,
      role: "admin",
      account: {
        adminUuid: "owner",
        email: "owner@local",
        fullName: "Owner",
        isOwner: true,
        allowedPages: ALL_INTERNAL_PAGE_PATHS,
      },
    }),
  };
};
