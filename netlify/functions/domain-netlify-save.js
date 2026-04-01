const { json, badMethod } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureDomainTables, findDomainForAccount, normalizeDomain } = require("./_lib/domains");

const TABLE = "tochukwu_user_domain_netlify_access";

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeMethod(_value) {
  return "temporary_login";
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
  const netlifyEmail = normalizeEmail(body.netlifyEmail || body.netlify_email);
  const netlifyWorkspace = clean(body.netlifyWorkspace || body.netlify_workspace, 190);
  const netlifySiteName = clean(body.netlifySiteName || body.netlify_site_name, 190);
  const connectionMethod = normalizeMethod(body.connectionMethod || body.connection_method);
  const accessDetails = clean(body.accessDetails || body.access_details, 3000);

  if (!domainName) return json(400, { ok: false, error: "domainName is required" });
  if (!netlifyEmail) return json(400, { ok: false, error: "Enter a valid login email." });
  if (!netlifySiteName) return json(400, { ok: false, error: "Enter project name." });
  if (!netlifyWorkspace) return json(400, { ok: false, error: "Enter temporary Netlify domain." });
  if (!accessDetails) return json(400, { ok: false, error: "Enter temporary password." });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureDomainTables(pool);
    await ensureTable(pool);

    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const accountId = Number(session.account.id);
    const email = String(session.account.email || "").trim().toLowerCase();
    const owned = await findDomainForAccount(pool, { accountId, domainName });
    if (!owned) return json(404, { ok: false, error: "Domain not found in your account." });

    const now = nowSql();
    await pool.query(
      `INSERT INTO ${TABLE}
        (account_id, email, domain_name, netlify_email, netlify_workspace, netlify_site_name, connection_method, access_details, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)
       ON DUPLICATE KEY UPDATE
         email = VALUES(email),
         netlify_email = VALUES(netlify_email),
         netlify_workspace = VALUES(netlify_workspace),
         netlify_site_name = VALUES(netlify_site_name),
         connection_method = VALUES(connection_method),
         access_details = VALUES(access_details),
         status = 'submitted',
         updated_at = VALUES(updated_at)`,
      [
        accountId,
        email,
        domainName,
        netlifyEmail,
        netlifyWorkspace || null,
        netlifySiteName || null,
        connectionMethod,
        accessDetails,
        now,
        now,
      ]
    );

    return json(200, {
      ok: true,
      domainName,
      netlifyEmail,
      netlifyWorkspace,
      netlifySiteName,
      connectionMethod,
      status: "submitted",
      updatedAt: now,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not save Netlify details." });
  }
};
