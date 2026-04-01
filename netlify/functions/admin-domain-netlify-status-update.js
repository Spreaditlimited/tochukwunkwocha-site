const { json, badMethod } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");

const TABLE = "tochukwu_user_domain_netlify_access";

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeStatus(value) {
  const status = clean(value, 40).toLowerCase();
  const allowed = new Set(["submitted", "connected", "follow_up", "completed"]);
  return allowed.has(status) ? status : "";
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

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const accountId = Number(body.accountId || body.account_id);
  const domainName = clean(body.domainName || body.domain_name, 190).toLowerCase();
  const status = normalizeStatus(body.status);

  if (!Number.isFinite(accountId) || accountId <= 0) return json(400, { ok: false, error: "accountId is required" });
  if (!domainName) return json(400, { ok: false, error: "domainName is required" });
  if (!status) return json(400, { ok: false, error: "Invalid status" });

  const pool = getPool();
  try {
    await ensureTable(pool);
    const now = nowSql();
    const [result] = await pool.query(
      `UPDATE ${TABLE}
       SET status = ?, updated_at = ?
       WHERE account_id = ? AND domain_name = ?
       LIMIT 1`,
      [status, now, accountId, domainName]
    );
    if (!result || !result.affectedRows) {
      return json(404, { ok: false, error: "No Netlify submission found for this domain." });
    }
    return json(200, {
      ok: true,
      accountId,
      domainName,
      status,
      updatedAt: now,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not update Netlify status." });
  }
};
