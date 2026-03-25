const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { setAdminCookieHeader, verifyAdminPassword } = require("./_lib/admin-auth");

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

  const password = String(body.password || "");
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
      "Set-Cookie": setAdminCookieHeader(event),
    },
    body: JSON.stringify({ ok: true }),
  };
};
