const crypto = require("crypto");
const { nowSql } = require("./db");

const BLOG_LEAD_MAGNETS_TABLE = "tochukwu_blog_lead_magnets";
const BLOG_LEAD_MAGNET_FILES_TABLE = "tochukwu_blog_lead_magnet_files";
const BLOG_LEAD_SUBMISSIONS_TABLE = "tochukwu_blog_lead_submissions";
const BLOG_LEAD_EVENTS_TABLE = "tochukwu_blog_lead_events";
const BLOG_LEAD_MAGNET_FOLDER = "tochukwu/blog-lead-magnets";
const DEFAULT_LEAD_LIST_ID = 17;

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 1000);
}

function slugify(input) {
  return clean(input, 220)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(String(value || ""));
  } catch (_error) {
    return fallback;
  }
}

function safeJsonStringify(value, fallback) {
  try {
    return JSON.stringify(value == null ? fallback : value);
  } catch (_error) {
    return JSON.stringify(fallback);
  }
}

function normalizeBullets(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 180)).filter(Boolean).slice(0, 8);
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => clean(item.replace(/^-\s+/, ""), 180))
    .filter(Boolean)
    .slice(0, 8);
}

function boolValue(value) {
  return value === true || String(value).toLowerCase() === "true" || String(value) === "1" || String(value).toLowerCase() === "active";
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (error) {
    const code = String(error && error.code || "");
    if (!["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME", "ER_CANT_DROP_FIELD_OR_KEY"].includes(code)) throw error;
  }
}

async function ensureBlogLeadMagnetTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${BLOG_LEAD_MAGNETS_TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      magnet_uuid VARCHAR(80) NOT NULL,
      pid_blog VARCHAR(64) NOT NULL,
      slug VARCHAR(255) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'inactive',
      title VARCHAR(255) NOT NULL,
      offer_headline VARCHAR(255) NULL,
      description TEXT NULL,
      button_text VARCHAR(120) NULL,
      bullets_json TEXT NULL,
      pdf_url TEXT NULL,
      pdf_public_id VARCHAR(500) NULL,
      pdf_resource_type VARCHAR(40) NULL,
      pdf_filename VARCHAR(255) NULL,
      brevo_list_id BIGINT NULL,
      email_subject VARCHAR(255) NULL,
      delivery_message TEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_blog_lead_magnet_uuid (magnet_uuid),
      UNIQUE KEY uniq_blog_lead_magnet_pid (pid_blog),
      UNIQUE KEY uniq_blog_lead_magnet_slug (slug),
      KEY idx_blog_lead_magnet_status (status),
      KEY idx_blog_lead_magnet_pid_status (pid_blog, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${BLOG_LEAD_MAGNET_FILES_TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      magnet_uuid VARCHAR(80) NOT NULL,
      pid_blog VARCHAR(64) NOT NULL,
      filename VARCHAR(255) NULL,
      content_type VARCHAR(120) NOT NULL DEFAULT 'application/pdf',
      byte_size INT UNSIGNED NOT NULL DEFAULT 0,
      file_data LONGBLOB NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_blog_lead_file_magnet (magnet_uuid),
      KEY idx_blog_lead_file_pid (pid_blog)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${BLOG_LEAD_SUBMISSIONS_TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      submission_uuid VARCHAR(80) NOT NULL,
      magnet_uuid VARCHAR(80) NULL,
      pid_blog VARCHAR(64) NULL,
      first_name VARCHAR(120) NULL,
      email VARCHAR(190) NOT NULL,
      marketing_lead_uuid VARCHAR(80) NULL,
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
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_blog_lead_submission_uuid (submission_uuid),
      KEY idx_blog_lead_submission_email (email),
      KEY idx_blog_lead_submission_magnet (magnet_uuid),
      KEY idx_blog_lead_submission_pid (pid_blog),
      KEY idx_blog_lead_submission_created (created_at),
      KEY idx_blog_lead_submission_utm_campaign (utm_campaign)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${BLOG_LEAD_EVENTS_TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      event_uuid VARCHAR(80) NOT NULL,
      magnet_uuid VARCHAR(80) NULL,
      pid_blog VARCHAR(64) NULL,
      event_name VARCHAR(80) NOT NULL,
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
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_blog_lead_event_uuid (event_uuid),
      KEY idx_blog_lead_event_magnet_name (magnet_uuid, event_name),
      KEY idx_blog_lead_event_pid_name (pid_blog, event_name),
      KEY idx_blog_lead_event_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await safeAlter(pool, `ALTER TABLE ${BLOG_LEAD_MAGNETS_TABLE} ADD COLUMN pdf_filename VARCHAR(255) NULL`);
  await safeAlter(pool, `ALTER TABLE ${BLOG_LEAD_MAGNETS_TABLE} ADD COLUMN pdf_resource_type VARCHAR(40) NULL`);
  await safeAlter(pool, `ALTER TABLE ${BLOG_LEAD_MAGNETS_TABLE} ADD COLUMN delivery_message TEXT NULL`);
}

function mapLeadMagnet(row) {
  if (!row) return null;
  const bullets = safeJsonParse(row.bullets_json, []);
  return {
    id: Number(row.id || 0),
    magnetUuid: clean(row.magnet_uuid, 80),
    pidBlog: clean(row.pid_blog, 64),
    slug: clean(row.slug, 255),
    active: clean(row.status, 32) === "active",
    status: clean(row.status, 32) || "inactive",
    title: clean(row.title, 255),
    offerHeadline: clean(row.offer_headline, 255),
    description: clean(row.description, 2000),
    buttonText: clean(row.button_text, 120),
    bullets: Array.isArray(bullets) ? bullets : [],
    pdfUrl: clean(row.pdf_url, 2000),
    pdfPublicId: clean(row.pdf_public_id, 500),
    pdfResourceType: clean(row.pdf_resource_type, 40) || "image",
    pdfFilename: clean(row.pdf_filename, 255),
    brevoListId: Number(row.brevo_list_id || DEFAULT_LEAD_LIST_ID),
    emailSubject: clean(row.email_subject, 255),
    deliveryMessage: clean(row.delivery_message, 2000),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getLeadMagnetForPost(pool, pidBlog, options) {
  await ensureBlogLeadMagnetTables(pool);
  const opts = options && typeof options === "object" ? options : {};
  const where = ["pid_blog = ?"];
  const params = [clean(pidBlog, 64)];
  if (opts.activeOnly) where.push("status = 'active'");
  const [rows] = await pool.query(
    `SELECT * FROM ${BLOG_LEAD_MAGNETS_TABLE} WHERE ${where.join(" AND ")} LIMIT 1`,
    params
  );
  return mapLeadMagnet(rows[0]);
}

async function getLeadMagnetBySlug(pool, slugInput) {
  await ensureBlogLeadMagnetTables(pool);
  const [rows] = await pool.query(
    `SELECT * FROM ${BLOG_LEAD_MAGNETS_TABLE} WHERE slug = ? AND status = 'active' LIMIT 1`,
    [clean(slugInput, 255)]
  );
  return mapLeadMagnet(rows[0]);
}

async function listLeadMagnetsForPosts(pool, pidBlogs, options) {
  await ensureBlogLeadMagnetTables(pool);
  const ids = Array.from(new Set((pidBlogs || []).map((item) => clean(item, 64)).filter(Boolean)));
  if (!ids.length) return new Map();
  const opts = options && typeof options === "object" ? options : {};
  const where = [`pid_blog IN (${ids.map(() => "?").join(",")})`];
  if (opts.activeOnly) where.push("status = 'active'");
  const [rows] = await pool.query(`SELECT * FROM ${BLOG_LEAD_MAGNETS_TABLE} WHERE ${where.join(" AND ")}`, ids);
  const map = new Map();
  (rows || []).forEach((row) => {
    const item = mapLeadMagnet(row);
    if (item && item.pidBlog) map.set(item.pidBlog, item);
  });
  return map;
}

async function makeUniqueLeadMagnetSlug(pool, baseInput, currentUuid) {
  const base = slugify(baseInput) || `lead-magnet-${Date.now()}`;
  let slug = base;
  let index = 2;
  while (true) {
    const params = currentUuid ? [slug, currentUuid] : [slug];
    const sql = currentUuid
      ? `SELECT magnet_uuid FROM ${BLOG_LEAD_MAGNETS_TABLE} WHERE slug = ? AND magnet_uuid <> ? LIMIT 1`
      : `SELECT magnet_uuid FROM ${BLOG_LEAD_MAGNETS_TABLE} WHERE slug = ? LIMIT 1`;
    const [rows] = await pool.query(sql, params);
    if (!rows.length) return slug;
    slug = `${base}-${index}`;
    index += 1;
  }
}

async function saveLeadMagnetForPost(pool, input) {
  await ensureBlogLeadMagnetTables(pool);
  const data = input && typeof input === "object" ? input : {};
  const pidBlog = clean(data.pidBlog, 64);
  if (!pidBlog) throw new Error("pidBlog is required for lead magnet.");
  const existing = await getLeadMagnetForPost(pool, pidBlog);
  const title = clean(data.title || data.leadMagnetTitle, 255);
  const enabled = boolValue(data.enabled || data.active || data.leadMagnetEnabled);
  if (!enabled && !existing && !title) return null;

  const magnetUuid = existing ? existing.magnetUuid : `BLM${crypto.randomBytes(12).toString("hex")}`;
  const slug = await makeUniqueLeadMagnetSlug(pool, data.slug || data.leadMagnetSlug || title || pidBlog, magnetUuid);
  const now = nowSql();
  const values = {
    magnetUuid,
    pidBlog,
    slug,
    status: enabled ? "active" : "inactive",
    title: title || (existing && existing.title) || "Blog PDF guide",
    offerHeadline: clean(data.offerHeadline || data.leadMagnetOfferHeadline, 255),
    description: clean(data.description || data.leadMagnetDescription, 2000),
    buttonText: clean(data.buttonText || data.leadMagnetButtonText, 120) || "Send me the PDF",
    bulletsJson: safeJsonStringify(normalizeBullets(data.bullets || data.leadMagnetBullets), []),
    pdfUrl: clean(data.pdfUrl || data.leadMagnetPdfUrl, 2000) || (existing && existing.pdfUrl) || "",
    pdfPublicId: clean(data.pdfPublicId || data.leadMagnetPdfPublicId, 500) || (existing && existing.pdfPublicId) || "",
    pdfResourceType: clean(data.pdfResourceType || data.leadMagnetPdfResourceType, 40) || (existing && existing.pdfResourceType) || "image",
    pdfFilename: clean(data.pdfFilename || data.leadMagnetPdfFilename, 255) || (existing && existing.pdfFilename) || "",
    brevoListId: Number(data.brevoListId || data.leadMagnetBrevoListId || (existing && existing.brevoListId) || DEFAULT_LEAD_LIST_ID),
    emailSubject: clean(data.emailSubject || data.leadMagnetEmailSubject, 255),
    deliveryMessage: clean(data.deliveryMessage || data.leadMagnetDeliveryMessage, 2000),
  };

  await pool.query(
    `INSERT INTO ${BLOG_LEAD_MAGNETS_TABLE}
      (magnet_uuid, pid_blog, slug, status, title, offer_headline, description, button_text, bullets_json,
       pdf_url, pdf_public_id, pdf_resource_type, pdf_filename, brevo_list_id, email_subject, delivery_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       slug = VALUES(slug),
       status = VALUES(status),
       title = VALUES(title),
       offer_headline = VALUES(offer_headline),
       description = VALUES(description),
       button_text = VALUES(button_text),
       bullets_json = VALUES(bullets_json),
       pdf_url = VALUES(pdf_url),
       pdf_public_id = VALUES(pdf_public_id),
       pdf_resource_type = VALUES(pdf_resource_type),
       pdf_filename = VALUES(pdf_filename),
       brevo_list_id = VALUES(brevo_list_id),
       email_subject = VALUES(email_subject),
       delivery_message = VALUES(delivery_message),
       updated_at = VALUES(updated_at)`,
    [
      values.magnetUuid,
      values.pidBlog,
      values.slug,
      values.status,
      values.title,
      values.offerHeadline,
      values.description,
      values.buttonText,
      values.bulletsJson,
      values.pdfUrl,
      values.pdfPublicId,
      values.pdfResourceType,
      values.pdfFilename,
      Number.isFinite(values.brevoListId) && values.brevoListId > 0 ? values.brevoListId : DEFAULT_LEAD_LIST_ID,
      values.emailSubject,
      values.deliveryMessage,
      now,
      now,
    ]
  );
  return getLeadMagnetForPost(pool, pidBlog);
}

function getLeadMagnetDownloadUrl(slug) {
  const cleanSlug = encodeURIComponent(clean(slug, 255));
  return `/.netlify/functions/blog-lead-magnet-download?slug=${cleanSlug}`;
}

async function saveLeadMagnetFile(pool, magnet, file) {
  await ensureBlogLeadMagnetTables(pool);
  const current = magnet && typeof magnet === "object" ? magnet : null;
  const buffer = Buffer.isBuffer(file && file.buffer) ? file.buffer : Buffer.from(file && file.buffer ? file.buffer : "");
  if (!current || !current.magnetUuid || !current.pidBlog) throw new Error("Valid lead magnet is required before saving the PDF file.");
  if (!buffer.length) throw new Error("PDF file buffer is required.");
  const now = nowSql();
  await pool.query(
    `INSERT INTO ${BLOG_LEAD_MAGNET_FILES_TABLE}
      (magnet_uuid, pid_blog, filename, content_type, byte_size, file_data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       pid_blog = VALUES(pid_blog),
       filename = VALUES(filename),
       content_type = VALUES(content_type),
       byte_size = VALUES(byte_size),
       file_data = VALUES(file_data),
       updated_at = VALUES(updated_at)`,
    [
      current.magnetUuid,
      current.pidBlog,
      clean(file.filename, 255) || "lead-magnet.pdf",
      clean(file.contentType, 120) || "application/pdf",
      buffer.length,
      buffer,
      now,
      now,
    ]
  );
  return {
    url: getLeadMagnetDownloadUrl(current.slug),
    filename: clean(file.filename, 255) || "lead-magnet.pdf",
    byteSize: buffer.length,
  };
}

async function getLeadMagnetFileBySlug(pool, slugInput) {
  await ensureBlogLeadMagnetTables(pool);
  const [rows] = await pool.query(
    `SELECT m.magnet_uuid, m.pid_blog, m.slug, m.title, f.filename, f.content_type, f.byte_size, f.file_data
       FROM ${BLOG_LEAD_MAGNETS_TABLE} m
       INNER JOIN ${BLOG_LEAD_MAGNET_FILES_TABLE} f ON f.magnet_uuid = m.magnet_uuid
      WHERE m.slug = ? AND m.status = 'active'
      LIMIT 1`,
    [clean(slugInput, 255)]
  );
  const row = rows && rows[0];
  if (!row) return null;
  return {
    magnetUuid: clean(row.magnet_uuid, 80),
    pidBlog: clean(row.pid_blog, 64),
    slug: clean(row.slug, 255),
    title: clean(row.title, 255),
    filename: clean(row.filename, 255) || `${clean(row.slug, 120) || "lead-magnet"}.pdf`,
    contentType: clean(row.content_type, 120) || "application/pdf",
    byteSize: Number(row.byte_size || 0),
    buffer: Buffer.isBuffer(row.file_data) ? row.file_data : Buffer.from(row.file_data || ""),
  };
}

async function createBlogLeadSubmission(pool, input) {
  await ensureBlogLeadMagnetTables(pool);
  const data = input && typeof input === "object" ? input : {};
  const submissionUuid = data.submissionUuid || `BLS${crypto.randomBytes(12).toString("hex")}`;
  const now = nowSql();
  await pool.query(
    `INSERT INTO ${BLOG_LEAD_SUBMISSIONS_TABLE}
      (submission_uuid, magnet_uuid, pid_blog, first_name, email, marketing_lead_uuid, list_id, source, page_type, page_url, pathname, referrer,
       utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fbp, fbc, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      clean(submissionUuid, 80),
      clean(data.magnetUuid, 80) || null,
      clean(data.pidBlog, 64) || null,
      clean(data.firstName, 120) || null,
      clean(data.email, 190).toLowerCase(),
      clean(data.marketingLeadUuid, 80) || null,
      Number(data.listId || DEFAULT_LEAD_LIST_ID) || DEFAULT_LEAD_LIST_ID,
      clean(data.source, 100) || "blog_lead_magnet",
      clean(data.pageType, 40) || "blog",
      clean(data.pageUrl, 2000) || null,
      clean(data.pathname, 500) || null,
      clean(data.referrer, 2000) || null,
      clean(data.utmSource, 190) || null,
      clean(data.utmMedium, 190) || null,
      clean(data.utmCampaign, 190) || null,
      clean(data.utmContent, 190) || null,
      clean(data.utmTerm, 190) || null,
      clean(data.fbclid, 2000) || null,
      clean(data.fbp, 190) || null,
      clean(data.fbc, 190) || null,
      now,
      now,
    ]
  );
  return { submissionUuid };
}

async function createBlogLeadEvent(pool, input) {
  await ensureBlogLeadMagnetTables(pool);
  const data = input && typeof input === "object" ? input : {};
  const eventName = clean(data.eventName || data.event_name, 80);
  if (!eventName) throw new Error("eventName is required.");
  const eventUuid = `BLE${crypto.randomBytes(12).toString("hex")}`;
  await pool.query(
    `INSERT INTO ${BLOG_LEAD_EVENTS_TABLE}
      (event_uuid, magnet_uuid, pid_blog, event_name, page_url, pathname, referrer,
       utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fbp, fbc, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventUuid,
      clean(data.magnetUuid, 80) || null,
      clean(data.pidBlog, 64) || null,
      eventName,
      clean(data.pageUrl, 2000) || null,
      clean(data.pathname, 500) || null,
      clean(data.referrer, 2000) || null,
      clean(data.utmSource, 190) || null,
      clean(data.utmMedium, 190) || null,
      clean(data.utmCampaign, 190) || null,
      clean(data.utmContent, 190) || null,
      clean(data.utmTerm, 190) || null,
      clean(data.fbclid, 2000) || null,
      clean(data.fbp, 190) || null,
      clean(data.fbc, 190) || null,
      nowSql(),
    ]
  );
  return { eventUuid };
}

module.exports = {
  BLOG_LEAD_MAGNETS_TABLE,
  BLOG_LEAD_MAGNET_FILES_TABLE,
  BLOG_LEAD_SUBMISSIONS_TABLE,
  BLOG_LEAD_EVENTS_TABLE,
  BLOG_LEAD_MAGNET_FOLDER,
  DEFAULT_LEAD_LIST_ID,
  ensureBlogLeadMagnetTables,
  getLeadMagnetForPost,
  getLeadMagnetBySlug,
  listLeadMagnetsForPosts,
  saveLeadMagnetForPost,
  getLeadMagnetDownloadUrl,
  saveLeadMagnetFile,
  getLeadMagnetFileBySlug,
  createBlogLeadSubmission,
  createBlogLeadEvent,
};
