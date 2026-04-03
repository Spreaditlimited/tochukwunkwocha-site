const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession, updateStudentDomainAutoRenew } = require("./_lib/user-auth");

function normalizeBoolean(input, fallback) {
  if (input === undefined || input === null || input === "") return fallback;
  const raw = String(input).trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const enabled = normalizeBoolean(body.autoRenewEnabled, true);
    await updateStudentDomainAutoRenew(pool, {
      accountId: Number(session.account.id),
      enabled,
    });

    return json(200, { ok: true, autoRenewEnabled: enabled });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not save domain preferences" });
  }
};
