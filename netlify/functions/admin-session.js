const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession, setAdminCookieHeader, clearAdminCookieHeader } = require("./_lib/admin-auth");
const { ALL_INTERNAL_PAGE_PATHS } = require("./_lib/admin-permissions");
const { ensureAdminAccountsTable, getAdminAccountByUuid } = require("./_lib/admin-accounts");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  try {
    const pool = getPool();
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });
  const payload = auth.payload || {};

  let account = {
    adminUuid: String(payload.adminUuid || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    fullName: String(payload.fullName || "").trim(),
    isOwner: payload.isOwner === true,
    allowedPages: Array.isArray(payload.allowedPages) ? payload.allowedPages : [],
  };

  if (account.isOwner) {
    account.allowedPages = ALL_INTERNAL_PAGE_PATHS.slice();
  } else if (account.adminUuid) {
    const pool = getPool();
    await ensureAdminAccountsTable(pool);
    const dbAccount = await getAdminAccountByUuid(pool, account.adminUuid);
    if (!dbAccount || !dbAccount.isActive) {
      return {
        statusCode: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Set-Cookie": clearAdminCookieHeader(event),
        },
        body: JSON.stringify({ ok: false, error: "Account inactive or not found" }),
      };
    }
    account = {
      adminUuid: String(dbAccount.adminUuid || "").trim(),
      email: String(dbAccount.email || "").trim().toLowerCase(),
      fullName: String(dbAccount.fullName || "").trim(),
      isOwner: dbAccount.isOwner === true,
      allowedPages: dbAccount.isOwner === true ? ALL_INTERNAL_PAGE_PATHS.slice() : (Array.isArray(dbAccount.allowedPages) ? dbAccount.allowedPages : []),
    };
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": setAdminCookieHeader(event, account),
    },
    body: JSON.stringify({
      ok: true,
      role: "admin",
      account,
    }),
  };
};
