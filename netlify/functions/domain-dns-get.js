const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureDomainTables, findDomainForAccount, normalizeDomain } = require("./_lib/domains");
const { getDnsZone } = require("./_lib/domain-client");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function registrarUnavailable(error) {
  const message = clean(error && error.message, 400).toLowerCase();
  if (!message) return false;
  return (
    message.includes("registrar") ||
    message.includes("resellerclub") ||
    message.includes("namecheap") ||
    message.includes("lookup_failed")
  );
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
  if (!domainName) return json(400, { ok: false, error: "domainName is required" });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureDomainTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const accountId = Number(session.account.id);
    const owned = await findDomainForAccount(pool, { accountId, domainName });
    if (!owned) return json(404, { ok: false, error: "Domain not found in your account." });

    const zone = await getDnsZone({ domainName });
    return json(200, {
      ok: true,
      provider: zone.provider || owned.provider || "",
      domainName,
      nameservers: Array.isArray(zone.nameservers) ? zone.nameservers : [],
      records: Array.isArray(zone.records) ? zone.records : [],
    });
  } catch (error) {
    if (registrarUnavailable(error)) {
      return json(503, {
        ok: false,
        error: "DNS service is temporarily unavailable. Please try again shortly.",
      });
    }
    return json(500, { ok: false, error: clean(error && error.message, 400) || "Could not load DNS zone." });
  }
};
