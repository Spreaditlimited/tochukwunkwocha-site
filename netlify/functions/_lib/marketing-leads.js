const { nowSql } = require("./db");

const MARKETING_LEADS_TABLE = "tochukwu_marketing_leads";

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

async function ensureMarketingLeadsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MARKETING_LEADS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      lead_uuid VARCHAR(80) NOT NULL,
      first_name VARCHAR(120) NULL,
      email VARCHAR(190) NOT NULL,
      list_id BIGINT NULL,
      source VARCHAR(100) NULL,
      page_type VARCHAR(40) NULL,
      page_url TEXT NULL,
      pathname VARCHAR(500) NULL,
      referrer TEXT NULL,
      utm_source VARCHAR(190) NULL,
      utm_medium VARCHAR(190) NULL,
      utm_campaign VARCHAR(190) NULL,
      utm_content VARCHAR(190) NULL,
      utm_term VARCHAR(190) NULL,
      fbclid TEXT NULL,
      fbp VARCHAR(190) NULL,
      fbc VARCHAR(190) NULL,
      lead_track VARCHAR(120) NULL,
      blog_pid VARCHAR(64) NULL,
      blog_slug VARCHAR(255) NULL,
      lead_magnet_slug VARCHAR(255) NULL,
      lead_magnet_title VARCHAR(255) NULL,
      pdf_url TEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_marketing_lead_uuid (lead_uuid),
      KEY idx_marketing_leads_email (email),
      KEY idx_marketing_leads_created (created_at),
      KEY idx_marketing_leads_page_type (page_type),
      KEY idx_marketing_leads_pathname (pathname),
      KEY idx_marketing_leads_utm_source (utm_source),
      KEY idx_marketing_leads_utm_campaign (utm_campaign),
      KEY idx_marketing_leads_track (lead_track),
      KEY idx_marketing_leads_blog_slug (blog_slug),
      KEY idx_marketing_leads_magnet_slug (lead_magnet_slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await safeAlter(pool, `ALTER TABLE ${MARKETING_LEADS_TABLE} ADD COLUMN lead_track VARCHAR(120) NULL`);
  await safeAlter(pool, `ALTER TABLE ${MARKETING_LEADS_TABLE} ADD COLUMN blog_pid VARCHAR(64) NULL`);
  await safeAlter(pool, `ALTER TABLE ${MARKETING_LEADS_TABLE} ADD COLUMN blog_slug VARCHAR(255) NULL`);
  await safeAlter(pool, `ALTER TABLE ${MARKETING_LEADS_TABLE} ADD COLUMN lead_magnet_slug VARCHAR(255) NULL`);
  await safeAlter(pool, `ALTER TABLE ${MARKETING_LEADS_TABLE} ADD COLUMN lead_magnet_title VARCHAR(255) NULL`);
  await safeAlter(pool, `ALTER TABLE ${MARKETING_LEADS_TABLE} ADD COLUMN pdf_url TEXT NULL`);
  await safeAlter(pool, `ALTER TABLE ${MARKETING_LEADS_TABLE} ADD KEY idx_marketing_leads_track (lead_track)`);
  await safeAlter(pool, `ALTER TABLE ${MARKETING_LEADS_TABLE} ADD KEY idx_marketing_leads_blog_slug (blog_slug)`);
  await safeAlter(pool, `ALTER TABLE ${MARKETING_LEADS_TABLE} ADD KEY idx_marketing_leads_magnet_slug (lead_magnet_slug)`);
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (error) {
    const code = String(error && error.code || "");
    if (!["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME", "ER_CANT_DROP_FIELD_OR_KEY"].includes(code)) throw error;
  }
}

async function createMarketingLead(pool, input) {
  await ensureMarketingLeadsTable(pool);

  const now = nowSql();
  const leadUuid =
    input.leadUuid ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `lead_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);

  await pool.query(
    `INSERT INTO ${MARKETING_LEADS_TABLE}
      (lead_uuid, first_name, email, list_id, source, page_type, page_url, pathname, referrer,
       utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fbp, fbc,
       lead_track, blog_pid, blog_slug, lead_magnet_slug, lead_magnet_title, pdf_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      clean(leadUuid, 80),
      clean(input.firstName, 120) || null,
      clean(input.email, 190).toLowerCase(),
      Number(input.listId || 0) || null,
      clean(input.source, 100) || "lead_capture_popup",
      clean(input.pageType, 40) || null,
      clean(input.pageUrl, 2000) || null,
      clean(input.pathname, 500) || null,
      clean(input.referrer, 2000) || null,
      clean(input.utmSource, 190) || null,
      clean(input.utmMedium, 190) || null,
      clean(input.utmCampaign, 190) || null,
      clean(input.utmContent, 190) || null,
      clean(input.utmTerm, 190) || null,
      clean(input.fbclid, 2000) || null,
      clean(input.fbp, 190) || null,
      clean(input.fbc, 190) || null,
      clean(input.leadTrack, 120) || null,
      clean(input.blogPid, 64) || null,
      clean(input.blogSlug, 255) || null,
      clean(input.leadMagnetSlug, 255) || null,
      clean(input.leadMagnetTitle, 255) || null,
      clean(input.pdfUrl, 2000) || null,
      now,
      now,
    ]
  );

  return { leadUuid };
}

function toMarketingLeadRow(row) {
  return {
    id: Number(row.id || 0),
    leadUuid: clean(row.lead_uuid, 80),
    firstName: clean(row.first_name, 120),
    email: clean(row.email, 190),
    listId: Number(row.list_id || 0),
    source: clean(row.source, 100),
    pageType: clean(row.page_type, 40),
    pageUrl: clean(row.page_url, 2000),
    pathname: clean(row.pathname, 500),
    referrer: clean(row.referrer, 2000),
    utmSource: clean(row.utm_source, 190),
    utmMedium: clean(row.utm_medium, 190),
    utmCampaign: clean(row.utm_campaign, 190),
    utmContent: clean(row.utm_content, 190),
    utmTerm: clean(row.utm_term, 190),
    fbclid: clean(row.fbclid, 2000),
    fbp: clean(row.fbp, 190),
    fbc: clean(row.fbc, 190),
    leadTrack: clean(row.lead_track, 120),
    blogPid: clean(row.blog_pid, 64),
    blogSlug: clean(row.blog_slug, 255),
    leadMagnetSlug: clean(row.lead_magnet_slug, 255),
    leadMagnetTitle: clean(row.lead_magnet_title, 255),
    pdfUrl: clean(row.pdf_url, 2000),
    createdAt: clean(row.created_at, 40),
    updatedAt: clean(row.updated_at, 40),
  };
}

async function getMarketingLeadDashboard(pool, input) {
  await ensureMarketingLeadsTable(pool);

  const days = Math.min(365, Math.max(1, Number(input && input.days) || 30));
  const limit = Math.min(300, Math.max(1, Number(input && input.limit) || 100));

  const [[summary]] = await pool.query(
    `SELECT
       COUNT(*) AS total_leads,
       SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN 1 ELSE 0 END) AS period_leads,
       COUNT(DISTINCT email) AS unique_emails,
       COUNT(DISTINCT pathname) AS converting_pages
     FROM ${MARKETING_LEADS_TABLE}`,
    [days]
  );

  const [recentRows] = await pool.query(
    `SELECT id, lead_uuid, first_name, email, list_id, source, page_type, page_url, pathname, referrer,
            utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fbp, fbc,
            lead_track, blog_pid, blog_slug, lead_magnet_slug, lead_magnet_title, pdf_url,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM ${MARKETING_LEADS_TABLE}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [limit]
  );

  const [sourceRows] = await pool.query(
    `SELECT COALESCE(NULLIF(utm_source, ''), NULLIF(source, ''), 'direct/unknown') AS label, COUNT(*) AS leads
     FROM ${MARKETING_LEADS_TABLE}
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY label
     ORDER BY leads DESC, label ASC
     LIMIT 12`,
    [days]
  );

  const [pageRows] = await pool.query(
    `SELECT COALESCE(NULLIF(pathname, ''), '/') AS label, COUNT(*) AS leads
     FROM ${MARKETING_LEADS_TABLE}
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY label
     ORDER BY leads DESC, label ASC
     LIMIT 12`,
    [days]
  );

  const [campaignRows] = await pool.query(
    `SELECT COALESCE(NULLIF(utm_campaign, ''), 'none') AS label, COUNT(*) AS leads
     FROM ${MARKETING_LEADS_TABLE}
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY label
     ORDER BY leads DESC, label ASC
     LIMIT 12`,
    [days]
  );

  const [dailyRows] = await pool.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS label, COUNT(*) AS leads
     FROM ${MARKETING_LEADS_TABLE}
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY label
     ORDER BY label ASC`,
    [days]
  );

  return {
    days,
    summary: {
      totalLeads: Number(summary && summary.total_leads || 0),
      periodLeads: Number(summary && summary.period_leads || 0),
      uniqueEmails: Number(summary && summary.unique_emails || 0),
      convertingPages: Number(summary && summary.converting_pages || 0),
    },
    recentLeads: (recentRows || []).map(toMarketingLeadRow),
    sources: (sourceRows || []).map((row) => ({ label: clean(row.label, 190), leads: Number(row.leads || 0) })),
    pages: (pageRows || []).map((row) => ({ label: clean(row.label, 500), leads: Number(row.leads || 0) })),
    campaigns: (campaignRows || []).map((row) => ({ label: clean(row.label, 190), leads: Number(row.leads || 0) })),
    daily: (dailyRows || []).map((row) => ({ label: clean(row.label, 20), leads: Number(row.leads || 0) })),
  };
}

module.exports = {
  MARKETING_LEADS_TABLE,
  ensureMarketingLeadsTable,
  createMarketingLead,
  getMarketingLeadDashboard,
};
