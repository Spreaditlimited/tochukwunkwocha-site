const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureDomainTables, findDomainForAccount, normalizeDomain } = require("./_lib/domains");

const TABLE = "tochukwu_user_domain_netlify_access";

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
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
    await ensureTable(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const accountId = Number(session.account.id);
    const owned = await findDomainForAccount(pool, { accountId, domainName });
    if (!owned) return json(404, { ok: false, error: "Domain not found in your account." });

    const [rows] = await pool.query(
      `SELECT domain_name, netlify_email, netlify_workspace, netlify_site_name, connection_method, access_details, status, created_at, updated_at
       FROM ${TABLE}
       WHERE account_id = ? AND domain_name = ?
       LIMIT 1`,
      [accountId, domainName]
    );
    const row = rows && rows.length ? rows[0] : null;
    return json(200, {
      ok: true,
      domainName,
      details: row
        ? {
            netlifyEmail: row.netlify_email || "",
            netlifyWorkspace: row.netlify_workspace || "",
            netlifySiteName: row.netlify_site_name || "",
            connectionMethod: row.connection_method || "collaborator_invite",
            accessDetails: row.access_details || "",
            status: row.status || "submitted",
            updatedAt: row.updated_at || row.created_at || null,
          }
        : null,
    });
  } catch (error) {
    return json(500, { ok: false, error: clean(error && error.message, 400) || "Could not load Netlify details." });
  }
};
