const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureDomainTables, normalizeDomain } = require("./_lib/domains");
const { updateDnsRecords, getDnsZone } = require("./_lib/domain-client");

const NETLIFY_TABLE = "tochukwu_user_domain_netlify_access";

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

async function ensureNetlifyTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${NETLIFY_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      account_id BIGINT NOT NULL,
      email VARCHAR(190) NOT NULL,
      domain_name VARCHAR(190) NOT NULL,
      netlify_email VARCHAR(190) NULL,
      netlify_workspace VARCHAR(190) NULL,
      netlify_site_name VARCHAR(190) NULL,
      connection_method VARCHAR(40) NOT NULL DEFAULT 'collaborator_invite',
      access_details TEXT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'submitted',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_domain_netlify (account_id, domain_name),
      KEY idx_tochukwu_domain_netlify_email (email),
      KEY idx_tochukwu_domain_netlify_status (status, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (auth.ok !== true) {
    return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const accountId = Number(body.accountId || body.account_id);
  const domainName = normalizeDomain(body.domainName || body.domain_name);
  const recordsIn = Array.isArray(body.records) ? body.records : [];
  const records = recordsIn
    .map(normalizeRecord)
    .filter((item) => item.host && item.type && item.value)
    .slice(0, 60);

  if (Number.isFinite(accountId) !== true || accountId <= 0) return json(400, { ok: false, error: "accountId is required" });
  if (domainName === "") return json(400, { ok: false, error: "domainName is required" });
  if (records.length === 0) return json(400, { ok: false, error: "Provide at least one DNS record." });

  const pool = getPool();
  try {
    await ensureDomainTables(pool);
    await ensureNetlifyTable(pool);

    const [domainRows] = await pool.query(
      `SELECT provider
       FROM user_domains
       WHERE account_id = ? AND domain_name = ?
       LIMIT 1`,
      [accountId, domainName]
    );
    if (Array.isArray(domainRows) !== true || domainRows.length === 0) {
      return json(404, { ok: false, error: "Domain not found in user domains." });
    }

    const domain = domainRows[0];
    if (clean(domain && domain.provider, 40).toLowerCase() === "mock") {
      return json(409, {
        ok: false,
        error: "This domain was created in mock mode and was not registered with a live registrar. DNS records cannot be updated.",
      });
    }

    const [netlifyRows] = await pool.query(
      `SELECT id, netlify_email, netlify_workspace, netlify_site_name, connection_method, access_details
       FROM ${NETLIFY_TABLE}
       WHERE account_id = ? AND domain_name = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
      [accountId, domainName]
    );
    const netlify = Array.isArray(netlifyRows) && netlifyRows.length ? netlifyRows[0] : null;
    const hasNetlifySubmission = Boolean(
      netlify && (netlify.netlify_email || netlify.netlify_workspace || netlify.netlify_site_name || netlify.connection_method || netlify.access_details)
    );
    if (hasNetlifySubmission !== true) {
      return json(409, {
        ok: false,
        error: "DNS editing is only available after the student submits Netlify setup details.",
      });
    }

    const result = await updateDnsRecords({ domainName, records });
    let verification = {
      checked: false,
      ok: false,
      fetchedCount: 0,
      error: "",
    };
    try {
      const zone = await getDnsZone({ domainName });
      verification = {
        checked: true,
        ok: true,
        fetchedCount: Array.isArray(zone && zone.records) ? zone.records.length : 0,
        error: "",
      };
    } catch (verifyError) {
      verification = {
        checked: true,
        ok: false,
        fetchedCount: 0,
        error: clean(verifyError && verifyError.message, 220) || "Registrar verification read failed.",
      };
    }
    return json(200, {
      ok: true,
      domainName,
      provider: result.provider || domain.provider || "",
      records: Array.isArray(result.records) ? result.records : records,
      verification,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: clean(error && error.message, 400) || "Could not update DNS records.",
    });
  }
};
