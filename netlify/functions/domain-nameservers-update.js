const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureDomainTables, findDomainForAccount, normalizeDomain } = require("./_lib/domains");
const { updateNameservers } = require("./_lib/domain-client");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const domainName = normalizeDomain(body.domainName || body.domain_name);
  const nameservers = Array.isArray(body.nameservers) ? body.nameservers.map((x) => clean(x, 190).toLowerCase()).filter(Boolean) : [];
  if (!domainName) return json(400, { ok: false, error: "domainName is required" });
  if (nameservers.length < 2) return json(400, { ok: false, error: "Enter at least two nameservers." });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureDomainTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const accountId = Number(session.account.id);
    const owned = await findDomainForAccount(pool, { accountId, domainName });
    if (!owned) return json(404, { ok: false, error: "Domain not found in your account." });

    const result = await updateNameservers({ domainName, nameservers });
    return json(200, {
      ok: true,
      provider: result.provider || owned.provider || "",
      domainName,
      nameservers: Array.isArray(result.nameservers) ? result.nameservers : nameservers,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: clean(error && error.message, 400) || "Could not update nameservers.",
    });
  }
};
