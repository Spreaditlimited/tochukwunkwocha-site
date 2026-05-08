const { nowSql } = require("./db");

const WA_WAITLIST_CONTACTS_TABLE = "tochukwu_wa_waitlist_contacts";
const WA_WAITLIST_QUEUE_TABLE = "tochukwu_wa_waitlist_queue";
const WA_WEBHOOK_EVENTS_TABLE = "tochukwu_wa_webhook_events";

function clean(value, maxLen) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Number(maxLen || 300));
}

async function ensureWhatsAppWaitlistTables(pool) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${WA_WAITLIST_CONTACTS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      email VARCHAR(190) NOT NULL,
      full_name VARCHAR(180) NOT NULL,
      phone_e164 VARCHAR(20) NOT NULL,
      opted_in TINYINT(1) NOT NULL DEFAULT 1,
      opted_in_at DATETIME NULL,
      opted_out_at DATETIME NULL,
      opt_in_version VARCHAR(80) NULL,
      opt_in_source_url VARCHAR(500) NULL,
      opt_in_ip VARCHAR(80) NULL,
      opt_in_user_agent VARCHAR(255) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_wa_waitlist_phone (phone_e164),
      KEY idx_tochukwu_wa_waitlist_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${WA_WAITLIST_QUEUE_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      phone_e164 VARCHAR(20) NOT NULL,
      template_name VARCHAR(120) NOT NULL,
      template_language VARCHAR(20) NOT NULL DEFAULT 'en',
      template_params_json TEXT NULL,
      due_at DATETIME NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      sent_at DATETIME NULL,
      last_error VARCHAR(500) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_tochukwu_wa_waitlist_queue_status_due (status, due_at),
      KEY idx_tochukwu_wa_waitlist_queue_phone (phone_e164)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${WA_WEBHOOK_EVENTS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      phone_e164 VARCHAR(20) NULL,
      event_type VARCHAR(80) NOT NULL,
      payload_json LONGTEXT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_tochukwu_wa_webhook_events_type_created (event_type, created_at),
      KEY idx_tochukwu_wa_webhook_events_phone (phone_e164)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

async function upsertWaitlistContact(pool, input) {
  const now = nowSql();
  await pool.query(
    `INSERT INTO ${WA_WAITLIST_CONTACTS_TABLE}
      (email, full_name, phone_e164, opted_in, opted_in_at, opt_in_version, opt_in_source_url, opt_in_ip, opt_in_user_agent, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      email = VALUES(email),
      full_name = VALUES(full_name),
      opted_in = 1,
      opted_out_at = NULL,
      opted_in_at = VALUES(opted_in_at),
      opt_in_version = VALUES(opt_in_version),
      opt_in_source_url = VALUES(opt_in_source_url),
      opt_in_ip = VALUES(opt_in_ip),
      opt_in_user_agent = VALUES(opt_in_user_agent),
      updated_at = VALUES(updated_at)`,
    [
      clean(input.email, 190).toLowerCase(),
      clean(input.fullName, 180),
      clean(input.phoneE164, 20),
      now,
      clean(input.optInVersion, 80),
      clean(input.optInSourceUrl, 500),
      clean(input.optInIp, 80),
      clean(input.optInUserAgent, 255),
      now,
      now,
    ]
  );
}

async function enqueueTemplateMessage(pool, input) {
  const now = nowSql();
  await pool.query(
    `INSERT INTO ${WA_WAITLIST_QUEUE_TABLE}
      (phone_e164, template_name, template_language, template_params_json, due_at, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    [
      clean(input.phoneE164, 20),
      clean(input.templateName, 120),
      clean(input.templateLanguage, 20) || "en",
      input.templateParamsJson ? clean(input.templateParamsJson, 4000) : null,
      clean(input.dueAtSql, 30) || now,
      now,
      now,
    ]
  );
}

async function fetchDueMessages(pool, limit) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 100), 500));
  const [rows] = await pool.query(
    `SELECT q.id, q.phone_e164, q.template_name, q.template_language, q.template_params_json, q.attempts
     FROM ${WA_WAITLIST_QUEUE_TABLE} q
     JOIN ${WA_WAITLIST_CONTACTS_TABLE} c ON c.phone_e164 = q.phone_e164
     WHERE q.status = 'pending'
       AND q.due_at <= UTC_TIMESTAMP()
       AND c.opted_in = 1
     ORDER BY q.due_at ASC
     LIMIT ?`,
    [safeLimit]
  );
  return Array.isArray(rows) ? rows : [];
}

async function markQueueSent(pool, id) {
  const now = nowSql();
  await pool.query(
    `UPDATE ${WA_WAITLIST_QUEUE_TABLE}
     SET status = 'sent', sent_at = ?, last_error = NULL, attempts = attempts + 1, updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [now, now, Number(id)]
  );
}

async function markQueueFailed(pool, id, errorMessage) {
  const now = nowSql();
  await pool.query(
    `UPDATE ${WA_WAITLIST_QUEUE_TABLE}
     SET status = CASE WHEN attempts + 1 >= 5 THEN 'dead' ELSE 'pending' END,
         due_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL POW(2, LEAST(attempts, 6)) MINUTE),
         last_error = ?,
         attempts = attempts + 1,
         updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [clean(errorMessage, 500), now, Number(id)]
  );
}

async function saveWebhookEvent(pool, input) {
  await pool.query(
    `INSERT INTO ${WA_WEBHOOK_EVENTS_TABLE}
      (phone_e164, event_type, payload_json, created_at)
     VALUES (?, ?, ?, ?)`,
    [
      clean(input.phoneE164, 20) || null,
      clean(input.eventType, 80) || "event",
      clean(input.payloadJson, 20000) || null,
      nowSql(),
    ]
  );
}

async function markOptedOutByPhone(pool, phoneE164) {
  const now = nowSql();
  await pool.query(
    `UPDATE ${WA_WAITLIST_CONTACTS_TABLE}
     SET opted_in = 0, opted_out_at = ?, updated_at = ?
     WHERE phone_e164 = ?
     LIMIT 1`,
    [now, now, clean(phoneE164, 20)]
  );
}

module.exports = {
  WA_WAITLIST_CONTACTS_TABLE,
  WA_WAITLIST_QUEUE_TABLE,
  WA_WEBHOOK_EVENTS_TABLE,
  clean,
  ensureWhatsAppWaitlistTables,
  upsertWaitlistContact,
  enqueueTemplateMessage,
  fetchDueMessages,
  markQueueSent,
  markQueueFailed,
  saveWebhookEvent,
  markOptedOutByPhone,
};
