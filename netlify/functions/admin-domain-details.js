const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureDomainTables, normalizeDomain } = require("./_lib/domains");
const { getDnsZone } = require("./_lib/domain-client");

const NETLIFY_TABLE = "tochukwu_user_domain_netlify_access";

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function parseJsonSafe(raw, fallback) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed === undefined || parsed === null ? fallback : parsed;
  } catch (_error) {
    return fallback;
  }
}

function registrarUnavailable(error) {
  const message = clean(error && error.message, 400).toLowerCase();
  if (message === "") return false;
  return (
    message.includes("registrar") ||
    message.includes("resellerclub") ||
    message.includes("namecheap") ||
    message.includes("lookup_failed")
  );
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
  if (Number.isFinite(accountId) !== true || accountId <= 0) return json(400, { ok: false, error: "accountId is required" });
  if (domainName === "") return json(400, { ok: false, error: "domainName is required" });

  const pool = getPool();
  try {
    await ensureDomainTables(pool);
    await ensureNetlifyTable(pool);

    const [domainRows] = await pool.query(
      `SELECT
         id,
         account_id,
         email,
         domain_name,
         provider,
         status,
         years,
         purchase_currency,
         purchase_amount_minor,
         provider_order_id,
         selected_services_json,
         auto_renew_enabled,
         registered_at,
         renewal_due_at,
         last_synced_at,
         created_at,
         updated_at
       FROM user_domains
       WHERE account_id = ? AND domain_name = ?
       LIMIT 1`,
      [accountId, domainName]
    );

    if (Array.isArray(domainRows) !== true || domainRows.length === 0) {
      return json(404, { ok: false, error: "Domain not found in user domains." });
    }

    const domain = domainRows[0];

    const [orderRows] = await pool.query(
      `SELECT
         id,
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
         selected_services_json,
         auto_renew_enabled,
         notes,
         registered_at,
         created_at,
         updated_at
       FROM domain_orders
       WHERE account_id = ? AND domain_name = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [accountId, domainName]
    );

    const [netlifyRows] = await pool.query(
      `SELECT
         id,
         account_id,
         email,
         domain_name,
         netlify_email,
         netlify_workspace,
         netlify_site_name,
         connection_method,
         access_details,
         status,
         created_at,
         updated_at
       FROM ${NETLIFY_TABLE}
       WHERE account_id = ? AND domain_name = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
      [accountId, domainName]
    );

    const [renewalRows] = await pool.query(
      `SELECT
         id,
         renewal_uuid,
         years,
         status,
         payment_provider,
         payment_reference,
         payment_currency,
         payment_amount_minor,
         payment_paid_at,
         auto_renew_enabled,
         notes,
         created_at,
         updated_at
       FROM tochukwu_domain_renewal_checkouts
       WHERE account_id = ? AND domain_name = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [accountId, domainName]
    );

    const [checkoutRows] = await pool.query(
      `SELECT
         id,
         checkout_uuid,
         full_name,
         email,
         domain_name,
         years,
         provider,
         status,
         payment_provider,
         payment_reference,
         payment_currency,
         payment_amount_minor,
         payment_paid_at,
         linked_account_id,
         order_uuid,
         selected_services_json,
         auto_renew_enabled,
         notes,
         created_at,
         updated_at
       FROM domain_checkouts
       WHERE linked_account_id = ? AND domain_name = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [accountId, domainName]
    );

    let dns = { ok: false, nameservers: [], records: [], error: "DNS not loaded." };
    const provider = clean(domain.provider, 40).toLowerCase();
    if (provider === "mock") {
      dns = {
        ok: false,
        nameservers: [],
        records: [],
        error: "This domain was created in mock mode and was not registered with a live registrar. DNS records are unavailable.",
      };
    } else {
      try {
        const zone = await getDnsZone({ domainName });
        dns = {
          ok: true,
          provider: zone.provider || domain.provider || "",
          nameservers: Array.isArray(zone.nameservers) ? zone.nameservers : [],
          records: Array.isArray(zone.records) ? zone.records : [],
          error: "",
        };
      } catch (error) {
        dns = {
          ok: false,
          nameservers: [],
          records: [],
          error: registrarUnavailable(error)
            ? "DNS service is temporarily unavailable. Please try again shortly."
            : clean(error && error.message, 500) || "Could not load DNS records.",
        };
      }
    }

    const netlify = Array.isArray(netlifyRows) && netlifyRows.length ? netlifyRows[0] : null;
    const hasNetlifySubmission = Boolean(
      netlify && (netlify.netlify_email || netlify.connection_method || netlify.access_details || netlify.netlify_workspace || netlify.netlify_site_name)
    );

    return json(200, {
      ok: true,
      domain: {
        ...domain,
        selected_services: parseJsonSafe(domain.selected_services_json, []),
        auto_renew_enabled: Number(domain.auto_renew_enabled || 0) === 1,
      },
      orders: Array.isArray(orderRows)
        ? orderRows.map((row) => ({
            ...row,
            selected_services: parseJsonSafe(row.selected_services_json, []),
            auto_renew_enabled: Number(row.auto_renew_enabled || 0) === 1,
          }))
        : [],
      checkouts: Array.isArray(checkoutRows)
        ? checkoutRows.map((row) => ({
            ...row,
            selected_services: parseJsonSafe(row.selected_services_json, []),
            auto_renew_enabled: Number(row.auto_renew_enabled || 0) === 1,
          }))
        : [],
      renewals: Array.isArray(renewalRows)
        ? renewalRows.map((row) => ({
            ...row,
            auto_renew_enabled: Number(row.auto_renew_enabled || 0) === 1,
          }))
        : [],
      netlify: netlify || null,
      dns,
      permissions: {
        canEditDns: hasNetlifySubmission && dns.ok,
        requiresNetlifySubmission: !hasNetlifySubmission,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: clean(error && error.message, 500) || "Could not load domain details." });
  }
};
