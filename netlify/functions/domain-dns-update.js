const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureDomainTables, findDomainForAccount, normalizeDomain } = require("./_lib/domains");
const { updateDnsRecords } = require("./_lib/domain-client");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeRecord(item) {
  return {
    host: clean(item && item.host, 190),
    type: clean(item && item.type, 20).toUpperCase(),
    value: clean(item && item.value, 500),
    ttl: Math.max(60, Math.min(Number(item && item.ttl) || 3600, 86400)),
  };
}

async function resolveDomainAccess(pool, input) {
  const accountId = Number(input && input.accountId);
  const domainName = normalizeDomain(input && input.domainName);
  if (!Number.isFinite(accountId) || accountId <= 0 || !domainName) {
    return { ok: false, statusCode: 400, error: "Invalid domain request." };
  }

  const owned = await findDomainForAccount(pool, { accountId, domainName });
  if (owned) return { ok: true, domain: owned };

  const [orderRows] = await pool.query(
    `SELECT provider, status
     FROM domain_orders
     WHERE account_id = ? AND domain_name = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [accountId, domainName]
  );
  const order = orderRows && orderRows.length ? orderRows[0] : null;
  if (!order) {
    return { ok: false, statusCode: 404, error: "Domain not found in your account." };
  }
  const orderStatus = clean(order.status, 40).toLowerCase();
  if (orderStatus !== "registered") {
    return {
      ok: false,
      statusCode: 409,
      error: "Domain registration is not complete yet. DNS management will be available after registration is completed.",
    };
  }
  return {
    ok: true,
    domain: {
      domain_name: domainName,
      provider: clean(order.provider, 40),
      status: orderStatus,
    },
  };
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
  const recordsIn = Array.isArray(body.records) ? body.records : [];
  const records = recordsIn.map(normalizeRecord).filter((x) => x.host && x.type && x.value).slice(0, 60);
  if (!domainName) return json(400, { ok: false, error: "domainName is required" });
  if (!records.length) return json(400, { ok: false, error: "Provide at least one DNS record." });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureDomainTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const access = await resolveDomainAccess(pool, { accountId: Number(session.account.id), domainName });
    if (!access.ok) return json(access.statusCode || 404, { ok: false, error: access.error || "Domain access denied." });
    const owned = access.domain;
    if (clean(owned && owned.provider, 40).toLowerCase() === "mock") {
      return json(409, {
        ok: false,
        error: "This domain was created in mock mode and was not registered with a live registrar. DNS records cannot be updated.",
      });
    }

    const result = await updateDnsRecords({ domainName, records });
    return json(200, {
      ok: true,
      provider: result.provider || owned.provider || "",
      domainName,
      records: Array.isArray(result.records) ? result.records : records,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: clean(error && error.message, 400) || "Could not update DNS records.",
    });
  }
};
