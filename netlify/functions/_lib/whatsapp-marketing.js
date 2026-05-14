const { nowSql } = require("./db");
const { normalizePhoneE164 } = require("./whatsapp");
const { callN8nWebhook } = require("./n8n");

const WA_CONTACTS_TABLE = "tochukwu_whatsapp_contacts";
const WA_CAMPAIGNS_TABLE = "tochukwu_whatsapp_campaigns";

function clean(value, maxLen) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Number(maxLen || 300));
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

async function ensureWhatsAppMarketingTables(pool) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${WA_CONTACTS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      student_account_id BIGINT NULL,
      email VARCHAR(190) NULL,
      full_name VARCHAR(180) NULL,
      phone_e164 VARCHAR(20) NOT NULL,
      course_slug VARCHAR(120) NULL,
      source VARCHAR(80) NULL,
      whatsapp_opted_in TINYINT(1) NOT NULL DEFAULT 0,
      whatsapp_opted_in_at DATETIME NULL,
      whatsapp_opted_out_at DATETIME NULL,
      opt_in_version VARCHAR(80) NULL,
      opt_in_source_url VARCHAR(500) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_whatsapp_phone (phone_e164),
      KEY idx_tochukwu_whatsapp_email (email),
      KEY idx_tochukwu_whatsapp_optin (whatsapp_opted_in, updated_at),
      KEY idx_tochukwu_whatsapp_course (course_slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await safeAlter(pool, `ALTER TABLE ${WA_CONTACTS_TABLE} ADD COLUMN student_account_id BIGINT NULL`);
  await safeAlter(pool, `ALTER TABLE ${WA_CONTACTS_TABLE} ADD COLUMN course_slug VARCHAR(120) NULL`);
  await safeAlter(pool, `ALTER TABLE ${WA_CONTACTS_TABLE} ADD COLUMN source VARCHAR(80) NULL`);
  await safeAlter(pool, `ALTER TABLE ${WA_CONTACTS_TABLE} ADD COLUMN opt_in_source_url VARCHAR(500) NULL`);

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${WA_CAMPAIGNS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      campaign_uuid VARCHAR(64) NOT NULL,
      campaign_name VARCHAR(180) NOT NULL,
      audience_course_slug VARCHAR(120) NULL,
      message_text TEXT NOT NULL,
      recipient_count INT NOT NULL DEFAULT 0,
      n8n_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      n8n_error VARCHAR(500) NULL,
      created_by VARCHAR(190) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_whatsapp_campaign_uuid (campaign_uuid),
      KEY idx_tochukwu_whatsapp_campaign_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

async function upsertWhatsAppContact(pool, input) {
  const phoneE164 = normalizePhoneE164(input && (input.phoneE164 || input.phone));
  if (!phoneE164) return { ok: false, error: "Invalid WhatsApp phone number" };
  const optedIn = input && input.optedIn === true;
  const now = nowSql();
  await ensureWhatsAppMarketingTables(pool);
  await pool.query(
    `INSERT INTO ${WA_CONTACTS_TABLE}
      (student_account_id, email, full_name, phone_e164, course_slug, source, whatsapp_opted_in, whatsapp_opted_in_at, whatsapp_opted_out_at, opt_in_version, opt_in_source_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      student_account_id = COALESCE(VALUES(student_account_id), student_account_id),
      email = COALESCE(VALUES(email), email),
      full_name = COALESCE(VALUES(full_name), full_name),
      course_slug = COALESCE(VALUES(course_slug), course_slug),
      source = COALESCE(VALUES(source), source),
      whatsapp_opted_in = CASE WHEN VALUES(whatsapp_opted_in) = 1 THEN 1 ELSE whatsapp_opted_in END,
      whatsapp_opted_in_at = CASE WHEN VALUES(whatsapp_opted_in) = 1 THEN VALUES(whatsapp_opted_in_at) ELSE whatsapp_opted_in_at END,
      whatsapp_opted_out_at = CASE WHEN VALUES(whatsapp_opted_in) = 1 THEN NULL ELSE whatsapp_opted_out_at END,
      opt_in_version = CASE WHEN VALUES(whatsapp_opted_in) = 1 THEN VALUES(opt_in_version) ELSE opt_in_version END,
      opt_in_source_url = CASE WHEN VALUES(whatsapp_opted_in) = 1 THEN VALUES(opt_in_source_url) ELSE opt_in_source_url END,
      updated_at = VALUES(updated_at)`,
    [
      Number(input && input.studentAccountId) > 0 ? Number(input.studentAccountId) : null,
      clean(input && input.email, 190).toLowerCase() || null,
      clean(input && input.fullName, 180) || null,
      phoneE164,
      clean(input && input.courseSlug, 120).toLowerCase() || null,
      clean(input && input.source, 80) || null,
      optedIn ? 1 : 0,
      optedIn ? now : null,
      optedIn ? clean(input && input.optInVersion, 80) || "whatsapp_marketing_v1" : null,
      optedIn ? clean(input && input.optInSourceUrl, 500) || null : null,
      now,
      now,
    ]
  );
  return { ok: true, phoneE164 };
}

async function markWhatsAppOptedOut(pool, phoneInput) {
  const phoneE164 = normalizePhoneE164(phoneInput);
  if (!phoneE164) return 0;
  await ensureWhatsAppMarketingTables(pool);
  const now = nowSql();
  const [res] = await pool.query(
    `UPDATE ${WA_CONTACTS_TABLE}
     SET whatsapp_opted_in = 0, whatsapp_opted_out_at = ?, updated_at = ?
     WHERE phone_e164 = ?`,
    [now, now, phoneE164]
  );
  return Number(res && res.affectedRows ? res.affectedRows : 0);
}

async function listWhatsAppContacts(pool, input) {
  await ensureWhatsAppMarketingTables(pool);
  const courseSlug = clean(input && input.courseSlug, 120).toLowerCase();
  const search = clean(input && input.search, 190).toLowerCase();
  const opted = String(input && input.opted || "in").toLowerCase();
  const limit = Math.max(1, Math.min(Number(input && input.limit || 500), 1000));
  const where = [];
  const params = [];
  if (opted === "in") where.push("whatsapp_opted_in = 1");
  if (opted === "out") where.push("whatsapp_opted_in = 0");
  if (courseSlug && courseSlug !== "all") {
    where.push("course_slug = ?");
    params.push(courseSlug);
  }
  if (search) {
    where.push("(LOWER(email) LIKE ? OR LOWER(full_name) LIKE ? OR phone_e164 LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  params.push(limit);
  const [rows] = await pool.query(
    `SELECT id, student_account_id, email, full_name, phone_e164, course_slug, source, whatsapp_opted_in,
            DATE_FORMAT(whatsapp_opted_in_at, '%Y-%m-%dT%H:%i:%sZ') AS whatsapp_opted_in_at,
            DATE_FORMAT(whatsapp_opted_out_at, '%Y-%m-%dT%H:%i:%sZ') AS whatsapp_opted_out_at,
            DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ') AS updated_at
     FROM ${WA_CONTACTS_TABLE}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY updated_at DESC
     LIMIT ?`,
    params
  );
  return Array.isArray(rows) ? rows : [];
}

function n8nWebhookUrl() {
  return clean(process.env.N8N_HOLIDAY_WAITLIST_WEBHOOK_URL, 2000);
}

function n8nWebhookSecret() {
  return clean(process.env.N8N_HOLIDAY_WAITLIST_WEBHOOK_SECRET, 300);
}

async function createWhatsAppCampaign(pool, input) {
  await ensureWhatsAppMarketingTables(pool);
  const campaignUuid = `wc_${require("crypto").randomUUID().replace(/-/g, "")}`;
  const now = nowSql();
  const recipients = Array.isArray(input && input.recipients) ? input.recipients : [];
  await pool.query(
    `INSERT INTO ${WA_CAMPAIGNS_TABLE}
      (campaign_uuid, campaign_name, audience_course_slug, message_text, recipient_count, n8n_status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [
      campaignUuid,
      clean(input && input.campaignName, 180) || "WhatsApp Campaign",
      clean(input && input.courseSlug, 120).toLowerCase() || "all",
      clean(input && input.messageText, 4000),
      recipients.length,
      clean(input && input.createdBy, 190) || null,
      now,
      now,
    ]
  );
  return campaignUuid;
}

async function updateCampaignN8nStatus(pool, campaignUuid, status, errorMessage) {
  await pool.query(
    `UPDATE ${WA_CAMPAIGNS_TABLE}
     SET n8n_status = ?, n8n_error = ?, updated_at = ?
     WHERE campaign_uuid = ?
     LIMIT 1`,
    [clean(status, 30), clean(errorMessage, 500) || null, nowSql(), clean(campaignUuid, 64)]
  );
}

async function sendCampaignToN8n(input) {
  return callN8nWebhook({
    webhookUrl: n8nWebhookUrl(),
    secret: n8nWebhookSecret(),
    payload: input && typeof input.payload === "object" ? input.payload : {},
  });
}

module.exports = {
  WA_CONTACTS_TABLE,
  WA_CAMPAIGNS_TABLE,
  clean,
  ensureWhatsAppMarketingTables,
  upsertWhatsAppContact,
  markWhatsAppOptedOut,
  listWhatsAppContacts,
  createWhatsAppCampaign,
  updateCampaignN8nStatus,
  sendCampaignToN8n,
};
