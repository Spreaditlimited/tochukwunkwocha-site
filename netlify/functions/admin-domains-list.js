const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureDomainTables } = require("./_lib/domains");

const NETLIFY_TABLE = "tochukwu_user_domain_netlify_access";

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
  if (event.httpMethod !== "GET") return badMethod();

  try {
    await applyRuntimeSettings(getPool());
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const qs = event.queryStringParameters || {};
  const search = String(qs.search || "").trim().toLowerCase();
  const status = String(qs.status || "all").trim().toLowerCase();
  const limit = Math.max(20, Math.min(Number(qs.limit || 120), 400));

  const allowedStatus = new Set(["all", "registered", "registration_failed", "registration_in_progress", "payment_pending", "paid"]);
  if (!allowedStatus.has(status)) {
    return json(400, { ok: false, error: "Invalid status filter" });
  }

  const provider = String(
    process.env.DOMAIN_REGISTRAR_PROVIDER ||
    process.env.LEADPAGE_DOMAIN_PROVIDER ||
    process.env.DOMAIN_PROVIDER ||
    "resellerclub"
  )
    .trim()
    .toLowerCase();

  const pool = getPool();

  try {
    await ensureDomainTables(pool);
    await ensureNetlifyTable(pool);

    const where = [];
    const params = [];

    if (search) {
      where.push("(ud.domain_name LIKE ? OR ud.email LIKE ? OR ud.provider_order_id LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    if (status !== "all") {
      if (status === "payment_pending" || status === "paid") {
        where.push("EXISTS (SELECT 1 FROM domain_orders dso WHERE dso.domain_name = ud.domain_name AND dso.account_id = ud.account_id AND dso.payment_status = ?)");
        params.push(status);
      } else {
        where.push("ud.status = ?");
        params.push(status);
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [domains] = await pool.query(
      `SELECT
         ud.account_id,
         ud.email,
         ud.domain_name,
         ud.provider,
         ud.status,
         ud.years,
         ud.purchase_currency,
         ud.purchase_amount_minor,
         ud.provider_order_id,
         ud.registered_at,
         ud.renewal_due_at,
         ud.created_at,
         ud.updated_at,
         (
           SELECT dso.payment_status
           FROM domain_orders dso
           WHERE dso.account_id = ud.account_id AND dso.domain_name = ud.domain_name
           ORDER BY dso.created_at DESC
           LIMIT 1
         ) AS latest_payment_status,
         (
           SELECT dso.payment_provider
           FROM domain_orders dso
           WHERE dso.account_id = ud.account_id AND dso.domain_name = ud.domain_name
           ORDER BY dso.created_at DESC
           LIMIT 1
         ) AS latest_payment_provider,
         (
           SELECT n.connection_method
           FROM ${NETLIFY_TABLE} n
           WHERE n.account_id = ud.account_id AND n.domain_name = ud.domain_name
           ORDER BY n.updated_at DESC
           LIMIT 1
         ) AS netlify_connection_method,
         (
           SELECT n.netlify_email
           FROM ${NETLIFY_TABLE} n
           WHERE n.account_id = ud.account_id AND n.domain_name = ud.domain_name
           ORDER BY n.updated_at DESC
           LIMIT 1
         ) AS netlify_email,
         (
           SELECT n.netlify_workspace
           FROM ${NETLIFY_TABLE} n
           WHERE n.account_id = ud.account_id AND n.domain_name = ud.domain_name
           ORDER BY n.updated_at DESC
           LIMIT 1
         ) AS netlify_workspace,
         (
           SELECT n.netlify_site_name
           FROM ${NETLIFY_TABLE} n
           WHERE n.account_id = ud.account_id AND n.domain_name = ud.domain_name
           ORDER BY n.updated_at DESC
           LIMIT 1
         ) AS netlify_site_name,
         (
           SELECT n.access_details
           FROM ${NETLIFY_TABLE} n
           WHERE n.account_id = ud.account_id AND n.domain_name = ud.domain_name
           ORDER BY n.updated_at DESC
           LIMIT 1
         ) AS netlify_access_details,
         (
           SELECT n.updated_at
           FROM ${NETLIFY_TABLE} n
           WHERE n.account_id = ud.account_id AND n.domain_name = ud.domain_name
           ORDER BY n.updated_at DESC
           LIMIT 1
         ) AS netlify_updated_at,
         (
           SELECT n.status
           FROM ${NETLIFY_TABLE} n
           WHERE n.account_id = ud.account_id AND n.domain_name = ud.domain_name
           ORDER BY n.updated_at DESC
           LIMIT 1
         ) AS netlify_status
       FROM user_domains ud
       ${whereSql}
       ORDER BY ud.created_at DESC
       LIMIT ?`,
      params.concat([limit])
    );

    const [orders] = await pool.query(
      `SELECT
         order_uuid,
         account_id,
         email,
         domain_name,
         years,
         provider,
         status,
         payment_provider,
         payment_status,
         purchase_currency,
         purchase_amount_minor,
         provider_order_id,
         notes,
         registered_at,
         created_at,
         updated_at
       FROM domain_orders
       ORDER BY created_at DESC
       LIMIT 120`
    );

    const [summaryRows] = await pool.query(
      `SELECT
         COUNT(*) AS total_domains,
         SUM(CASE WHEN status = 'registered' THEN 1 ELSE 0 END) AS registered_domains,
         SUM(CASE WHEN status = 'registration_failed' THEN 1 ELSE 0 END) AS failed_domains,
         SUM(CASE WHEN renewal_due_at IS NOT NULL AND renewal_due_at <= DATE_ADD(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS renewals_due_30_days
       FROM user_domains`
    );

    const summary = (summaryRows && summaryRows[0]) || {};

    return json(200, {
      ok: true,
      provider,
      summary: {
        totalDomains: Number(summary.total_domains || 0),
        registeredDomains: Number(summary.registered_domains || 0),
        failedDomains: Number(summary.failed_domains || 0),
        renewalsDue30Days: Number(summary.renewals_due_30_days || 0),
      },
      domains: Array.isArray(domains) ? domains : [],
      orders: Array.isArray(orders) ? orders : [],
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load domain management data" });
  }
};
