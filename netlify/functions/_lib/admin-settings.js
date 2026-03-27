const { nowSql } = require("./db");
const SETTINGS_TABLE = "tochukwu_admin_settings";
const SETTINGS_AUDIT_TABLE = "tochukwu_admin_settings_audit";

const SETTINGS_DEFINITIONS = [
  { key: "NODE_ENV", category: "Core", secret: false },
  { key: "SITE_BASE_URL", category: "Core", secret: false },

  { key: "DB_HOST", category: "Database", secret: false, restartSensitive: true },
  { key: "DB_USER", category: "Database", secret: false, restartSensitive: true },
  { key: "DB_PASSWORD", category: "Database", secret: true, restartSensitive: true },
  { key: "DB_NAME", category: "Database", secret: false, restartSensitive: true },

  { key: "ADMIN_DASHBOARD_PASSWORD", category: "Admin Auth", secret: true, restartSensitive: true },
  { key: "ADMIN_SESSION_SECRET", category: "Admin Auth", secret: true, restartSensitive: true },

  { key: "PAYSTACK_SECRET_KEY", category: "Payments", secret: true },
  { key: "PAYPAL_ENV", category: "Payments", secret: false },
  { key: "PAYPAL_CLIENT_ID", category: "Payments", secret: true },
  { key: "PAYPAL_CLIENT_SECRET", category: "Payments", secret: true },
  { key: "PAYPAL_WEBHOOK_ID", category: "Payments", secret: true },
  { key: "META_PIXEL_ID", category: "Marketing", secret: false },
  { key: "META_PIXEL_ACCESS_TOKEN", category: "Marketing", secret: true },

  { key: "PROMPT_TO_PROFIT_PRICE_NGN_MINOR", category: "Pricing", secret: false },
  { key: "PROMPT_TO_PROFIT_PRICE_GBP", category: "Pricing", secret: false },
  { key: "PROMPT_TO_PRODUCTION_PRICE_NGN_MINOR", category: "Pricing", secret: false },
  { key: "PROMPT_TO_PRODUCTION_PRICE_GBP", category: "Pricing", secret: false },
  { key: "INSTALLMENT_SURCHARGE_PERCENT", category: "Pricing", secret: false },
  { key: "LEADPAGE_PRICE_NGN_MINOR", category: "Pricing", secret: false },
  { key: "BUSINESS_PLAN_PRICE_NGN_MINOR", category: "Pricing", secret: false },

  { key: "BUSINESS_PLAN_VERIFIER_NAME", category: "Business Plan", secret: false },
  { key: "BUSINESS_PLAN_VERIFIER_IMAGE_URL", category: "Business Plan", secret: false },
  { key: "BUSINESS_PLAN_VERIFIER_BIO", category: "Business Plan", secret: false },
  { key: "BUSINESS_PLAN_VERIFIER_LINKEDIN_URL", category: "Business Plan", secret: false },

  { key: "MANUAL_BANK_NAME", category: "Manual Transfer", secret: false },
  { key: "MANUAL_BANK_ACCOUNT_NAME", category: "Manual Transfer", secret: false },
  { key: "MANUAL_BANK_ACCOUNT_NUMBER", category: "Manual Transfer", secret: false },
  { key: "MANUAL_BANK_NOTE", category: "Manual Transfer", secret: false },

  { key: "CLOUDINARY_CLOUD_NAME", category: "Media Upload", secret: false },
  { key: "CLOUDINARY_API_KEY", category: "Media Upload", secret: true },
  { key: "CLOUDINARY_API_SECRET", category: "Media Upload", secret: true },

  { key: "FLODESK_API_KEY", category: "Email/CRM", secret: true },
  { key: "FLODESK_ENROL_SEGMENT_ID", category: "Email/CRM", secret: false },
  { key: "FLODESK_ENROL_PROD_SEGMENT_ID", category: "Email/CRM", secret: false },
  { key: "FLODESK_PRE_ENROL_SEGMENT_ID", category: "Email/CRM", secret: false },
  { key: "BREVO_API_KEY", category: "Email/CRM", secret: true },
  { key: "SENDINBLUE_API_KEY", category: "Email/CRM", secret: true },
  { key: "LEADPAGE_BREVO_ENABLED", category: "Email/CRM", secret: false },
  { key: "LEADPAGE_BREVO_ALLOW_MOCK", category: "Email/CRM", secret: false },
  { key: "BREVO_LEADPAGE_LIST_ID", category: "Email/CRM", secret: false },
  { key: "BREVO_LEADPAGE_FOLLOWUP_EMAIL_COUNT", category: "Email/CRM", secret: false },
  { key: "BREVO_FREE_TIER_DAILY_SEND_LIMIT", category: "Email/CRM", secret: false },

  { key: "LEADPAGE_AUTOMATION_ENABLED", category: "Leadpage AI", secret: false },
  { key: "LEADPAGE_AUTOMATION_ALLOW_MOCK", category: "Leadpage AI", secret: false },
  { key: "LEADPAGE_AI_PROVIDER", category: "Leadpage AI", secret: false },
  { key: "AI_PROVIDER", category: "Leadpage AI", secret: false },
  { key: "GEMINI_API_KEY", category: "Leadpage AI", secret: true },
  { key: "GOOGLE_AI_API_KEY", category: "Leadpage AI", secret: true },
  { key: "GEMINI_MODEL", category: "Leadpage AI", secret: false },
  { key: "OPENAI_API_KEY", category: "Leadpage AI", secret: true },
  { key: "OPENAI_MODEL", category: "Leadpage AI", secret: false },

  { key: "LEADPAGE_DOMAIN_AUTOMATION_ENABLED", category: "Domain Automation", secret: false },
  { key: "LEADPAGE_DOMAIN_PROVIDER", category: "Domain Automation", secret: false },
  { key: "LEADPAGE_DOMAIN_ALLOW_MOCK", category: "Domain Automation", secret: false },
  { key: "LEADPAGE_DOMAIN_TLDS", category: "Domain Automation", secret: false },
  { key: "LEADPAGE_DOMAIN_SUGGEST_WINDOW_SECONDS", category: "Domain Automation", secret: false },
  { key: "LEADPAGE_DOMAIN_SUGGEST_LIMIT_PER_WINDOW", category: "Domain Automation", secret: false },
  { key: "LEADPAGE_DOMAIN_CHECK_WINDOW_SECONDS", category: "Domain Automation", secret: false },
  { key: "LEADPAGE_DOMAIN_CHECK_LIMIT_PER_WINDOW", category: "Domain Automation", secret: false },
  { key: "LEADPAGE_DOMAIN_REGISTER_WINDOW_SECONDS", category: "Domain Automation", secret: false },
  { key: "LEADPAGE_DOMAIN_REGISTER_LIMIT_PER_WINDOW", category: "Domain Automation", secret: false },

  { key: "NAMECHEAP_API_USER", category: "Registrar (Namecheap)", secret: false },
  { key: "NAMECHEAP_API_KEY", category: "Registrar (Namecheap)", secret: true },
  { key: "NAMECHEAP_USERNAME", category: "Registrar (Namecheap)", secret: false },
  { key: "NAMECHEAP_CLIENT_IP", category: "Registrar (Namecheap)", secret: false },
  { key: "NAMECHEAP_USE_SANDBOX", category: "Registrar (Namecheap)", secret: false },
  { key: "NAMECHEAP_CONTACT_FIRST_NAME", category: "Registrar (Namecheap)", secret: false },
  { key: "NAMECHEAP_CONTACT_LAST_NAME", category: "Registrar (Namecheap)", secret: false },
  { key: "NAMECHEAP_CONTACT_ADDRESS1", category: "Registrar (Namecheap)", secret: false },
  { key: "NAMECHEAP_CONTACT_CITY", category: "Registrar (Namecheap)", secret: false },
  { key: "NAMECHEAP_CONTACT_STATE", category: "Registrar (Namecheap)", secret: false },
  { key: "NAMECHEAP_CONTACT_POSTAL_CODE", category: "Registrar (Namecheap)", secret: false },
  { key: "NAMECHEAP_CONTACT_COUNTRY", category: "Registrar (Namecheap)", secret: false },
  { key: "NAMECHEAP_CONTACT_PHONE", category: "Registrar (Namecheap)", secret: false },
  { key: "NAMECHEAP_CONTACT_EMAIL", category: "Registrar (Namecheap)", secret: false },

  { key: "NETLIFY_API_TOKEN", category: "Netlify", secret: true },
  { key: "NETLIFY_SITE_ID", category: "Netlify", secret: false },
  { key: "NETLIFY_MONTHLY_CREDIT_LIMIT", category: "Netlify", secret: false },
  { key: "NETLIFY_ESTIMATED_CREDITS_PER_PUBLISH", category: "Netlify", secret: false },
  { key: "NETLIFY_CREDIT_WARNING_REMAINING", category: "Netlify", secret: false },

  { key: "LEADPAGE_CLIENT_MONTHLY_PUBLISH_LIMIT", category: "Publish Limits", secret: false },
];

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function knownKeysSet() {
  return new Set(SETTINGS_DEFINITIONS.map((x) => x.key));
}

async function ensureAdminSettingsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SETTINGS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      setting_key VARCHAR(120) NOT NULL,
      setting_value LONGTEXT NULL,
      updated_by VARCHAR(80) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_admin_setting_key (setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SETTINGS_AUDIT_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      setting_key VARCHAR(120) NOT NULL,
      action_type VARCHAR(20) NOT NULL,
      old_is_set TINYINT(1) NOT NULL DEFAULT 0,
      new_is_set TINYINT(1) NOT NULL DEFAULT 0,
      updated_by VARCHAR(80) NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_setting_audit_key_created (setting_key, created_at),
      KEY idx_setting_audit_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function listAdminSettings(pool) {
  const [rows] = await pool.query(
    `SELECT setting_key, setting_value, updated_by, created_at, updated_at
     FROM ${SETTINGS_TABLE}`
  );
  return rows || [];
}

async function upsertAdminSettings(pool, input) {
  const entries = Array.isArray(input && input.entries) ? input.entries : [];
  const updatedBy = clean((input && input.updatedBy) || "admin", 80) || "admin";
  const now = nowSql();
  const known = knownKeysSet();
  const [existingRows] = await pool.query(
    `SELECT setting_key, setting_value
     FROM ${SETTINGS_TABLE}`
  );
  const existing = new Map(
    (existingRows || []).map((row) => [clean(row.setting_key, 120), clean(row.setting_value, 5000)])
  );
  let changed = 0;
  const auditRows = [];

  for (const item of entries) {
    const key = clean(item && item.key, 120);
    if (!key || !known.has(key)) continue;
    const value = clean(item && item.value, 5000);
    const oldValue = existing.get(key) || "";
    if (!value) {
      const [delRes] = await pool.query(`DELETE FROM ${SETTINGS_TABLE} WHERE setting_key = ?`, [key]);
      const affected = Number(delRes && delRes.affectedRows ? delRes.affectedRows : 0);
      changed += affected;
      if (affected > 0 || oldValue) {
        auditRows.push({
          key,
          actionType: "deleted",
          oldIsSet: oldValue ? 1 : 0,
          newIsSet: 0,
        });
      }
      existing.delete(key);
      continue;
    }

    const [res] = await pool.query(
      `INSERT INTO ${SETTINGS_TABLE} (setting_key, setting_value, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         setting_value = VALUES(setting_value),
         updated_by = VALUES(updated_by),
         updated_at = VALUES(updated_at)`,
      [key, value, updatedBy, now, now]
    );
    if (res) changed += 1;
    const actionType = oldValue ? "updated" : "created";
    if (oldValue !== value) {
      auditRows.push({
        key,
        actionType,
        oldIsSet: oldValue ? 1 : 0,
        newIsSet: 1,
      });
    }
    existing.set(key, value);
  }

  if (auditRows.length) {
    for (const row of auditRows) {
      await pool.query(
        `INSERT INTO ${SETTINGS_AUDIT_TABLE}
         (setting_key, action_type, old_is_set, new_is_set, updated_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.key, row.actionType, row.oldIsSet, row.newIsSet, updatedBy, now]
      );
    }
  }

  return changed;
}

async function listRecentAdminSettingsAudit(pool, limitInput) {
  const limit = Math.max(1, Math.min(Number(limitInput) || 60, 300));
  const [rows] = await pool.query(
    `SELECT setting_key, action_type, old_is_set, new_is_set, updated_by, created_at
     FROM ${SETTINGS_AUDIT_TABLE}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [limit]
  );
  return rows || [];
}

function buildEffectiveSettings(rows) {
  const rowMap = new Map(
    (rows || []).map((row) => [clean(row.setting_key, 120), clean(row.setting_value, 5000)])
  );

  return SETTINGS_DEFINITIONS.map((def) => {
    const key = def.key;
    const overrideValue = rowMap.has(key) ? clean(rowMap.get(key), 5000) : "";
    const envValue = clean(process.env[key], 5000);
    const value = overrideValue || envValue || "";
    const source = overrideValue ? "override" : envValue ? "env" : "empty";
    return {
      key,
      category: def.category,
      secret: Boolean(def.secret),
      restartSensitive: Boolean(def.restartSensitive),
      value,
      source,
    };
  });
}

module.exports = {
  SETTINGS_DEFINITIONS,
  ensureAdminSettingsTable,
  listAdminSettings,
  upsertAdminSettings,
  listRecentAdminSettingsAudit,
  buildEffectiveSettings,
};
