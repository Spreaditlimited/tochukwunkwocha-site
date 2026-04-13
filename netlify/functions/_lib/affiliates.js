const crypto = require("crypto");
const { nowSql } = require("./db");
const { applyRuntimeSettings } = require("./runtime-settings");
const { runtimeSchemaChangesAllowed } = require("./schema-mode");
const { sendEmail } = require("./email");
const {
  paystackCreateTransferRecipient,
  paystackCreateTransfer,
  paystackListBanks,
  paystackResolveBankAccount,
  normalizePaystackErrorReason,
  paystackSecretMode,
} = require("./payments");

const AFFILIATE_PROFILES_TABLE = "tochukwu_affiliate_profiles";
const AFFILIATE_COURSE_RULES_TABLE = "tochukwu_affiliate_course_rules";
const AFFILIATE_ATTRIBUTIONS_TABLE = "tochukwu_affiliate_attributions";
const AFFILIATE_COMMISSIONS_TABLE = "tochukwu_affiliate_commissions";
const AFFILIATE_PAYOUT_ACCOUNTS_TABLE = "tochukwu_affiliate_payout_accounts";
const AFFILIATE_PAYOUT_BATCHES_TABLE = "tochukwu_affiliate_payout_batches";
const AFFILIATE_PAYOUT_ITEMS_TABLE = "tochukwu_affiliate_payout_items";
const AFFILIATE_PAYOUT_CHANGE_OTPS_TABLE = "tochukwu_affiliate_payout_change_otps";
const AFFILIATE_AUDIT_TABLE = "tochukwu_affiliate_audit";
const AFFILIATE_SCHOOL_REFERRALS_TABLE = "tochukwu_affiliate_school_referrals";

const STUDENT_ACCOUNTS_TABLE = "student_accounts";
const SCHOOL_STUDENTS_TABLE = "school_students";
const SCHOOL_ACCOUNTS_TABLE = "school_accounts";
const SCHOOL_ORDERS_TABLE = "school_orders";
const NIGERIAN_BANKS_FALLBACK = [
  { code: "044", name: "Access Bank" },
  { code: "063", name: "Access Bank (Diamond)" },
  { code: "023", name: "Citibank Nigeria" },
  { code: "050", name: "Ecobank Nigeria" },
  { code: "011", name: "First Bank of Nigeria" },
  { code: "214", name: "First City Monument Bank" },
  { code: "070", name: "Fidelity Bank" },
  { code: "058", name: "Guaranty Trust Bank" },
  { code: "030", name: "Heritage Bank" },
  { code: "082", name: "Keystone Bank" },
  { code: "076", name: "Polaris Bank" },
  { code: "221", name: "Stanbic IBTC Bank" },
  { code: "068", name: "Standard Chartered Bank Nigeria" },
  { code: "232", name: "Sterling Bank" },
  { code: "100", name: "SunTrust Bank Nigeria" },
  { code: "032", name: "Union Bank of Nigeria" },
  { code: "033", name: "United Bank For Africa" },
  { code: "215", name: "Unity Bank" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" },
];

let affiliateTablesEnsured = false;
const PAYSTACK_BANKS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const paystackBanksCache = new Map();

function logAffiliatePayout(event, payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  try {
    console.log(JSON.stringify({
      scope: "affiliate_payout",
      event: clean(event, 80),
      ...safePayload,
      ts: new Date().toISOString(),
    }));
  } catch (_error) {
    return;
  }
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function normalizeEmail(value) {
  const email = clean(value, 220).toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return ok ? email : "";
}

function normalizeCourse(value) {
  return clean(value, 120).toLowerCase();
}

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number.isFinite(fallback) ? Math.trunc(fallback) : 0;
  return Math.trunc(n);
}

function toMinor(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function boolToInt(value) {
  return value ? 1 : 0;
}

function randomNumericCode(length) {
  const size = Math.max(4, Math.min(10, Number(length) || 6));
  let out = "";
  for (let i = 0; i < size; i += 1) out += String(Math.floor(Math.random() * 10));
  return out;
}

function maskEmailAddress(emailInput) {
  const email = normalizeEmail(emailInput);
  if (!email) return "";
  const at = email.indexOf("@");
  if (at <= 1) return `***${email.slice(at)}`;
  return `${email.slice(0, 2)}***${email.slice(at)}`;
}

function maskAccountNumber(value) {
  const digits = clean(value, 40).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return `${digits.slice(0, 1)}***${digits.slice(-1)}`;
  return `${digits.slice(0, 2)}******${digits.slice(-2)}`;
}

function otpCodeHash(value) {
  return sha256(`affotp:${clean(value, 24)}`);
}

function bankCacheKey(countryCode, currency, payoutProvider) {
  return `${clean(countryCode, 2).toUpperCase()}:${clean(currency, 10).toUpperCase()}:${clean(payoutProvider, 40).toLowerCase()}`;
}

function normalizeBankRows(list) {
  return (Array.isArray(list) ? list : [])
    .map(function (row) {
      return {
        code: clean(row && row.code, 40),
        name: clean(row && row.name, 160),
      };
    })
    .filter(function (row) { return row.code && row.name; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
}

function accountResolveErrorMessage(reason) {
  const normalized = clean(reason, 80).toLowerCase();
  if (normalized === "unauthorized" || normalized === "invalid_configuration" || normalized === "forbidden") {
    return "Bank verification service is temporarily misconfigured. Please try again shortly.";
  }
  if (normalized === "rate_limited" || normalized === "provider_unavailable" || normalized === "network_error" || normalized === "timeout") {
    return "Bank verification is temporarily unavailable. Please retry in a few moments.";
  }
  if (normalized === "bad_request" || normalized === "not_found") {
    return "Bank code or account number could not be verified. Confirm details and try again.";
  }
  return "Could not verify account with Paystack right now. Please try again.";
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function randomCode(length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function affiliateEnabled() {
  return String(process.env.AFFILIATE_ENABLED || "1").trim() !== "0";
}

function affiliateBaseUrl() {
  const raw = clean(process.env.AFFILIATE_LINK_BASE_URL || process.env.SITE_BASE_URL, 500).replace(/\/$/, "");
  return raw || "";
}

function defaultHoldDays() {
  const raw = Number(process.env.AFFILIATE_DEFAULT_HOLD_DAYS || 30);
  if (!Number.isFinite(raw)) return 30;
  return Math.max(0, Math.min(120, Math.trunc(raw)));
}

function minPayoutMinor(currency) {
  const ccy = clean(currency, 10).toUpperCase();
  if (ccy === "USD") {
    const rawUsd = Number(process.env.AFFILIATE_MIN_PAYOUT_USD_MINOR || 2500);
    return Number.isFinite(rawUsd) ? Math.max(0, Math.trunc(rawUsd)) : 2500;
  }
  const raw = Number(process.env.AFFILIATE_MIN_PAYOUT_NGN_MINOR || 100000);
  return Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : 100000;
}

function schoolsMinSeats() {
  const raw = Number(process.env.SCHOOLS_MIN_SEATS || 50);
  if (!Number.isFinite(raw) || raw < 1) return 50;
  return Math.trunc(raw);
}

function schoolsPricePerStudentMinor() {
  const raw = Number(process.env.SCHOOLS_PRICE_PER_STUDENT_NGN_MINOR || 850000);
  if (!Number.isFinite(raw) || raw < 1) return 850000;
  return Math.trunc(raw);
}

function parseCountryCurrencyConfig() {
  const raw = clean(process.env.AFFILIATE_COUNTRY_CURRENCY_MAP_JSON, 15000);
  if (!raw) {
    return {
      NG: { countryCode: "NG", currency: "NGN", payoutProvider: "paystack", enabled: true },
      US: { countryCode: "US", currency: "USD", payoutProvider: "manual", enabled: false },
    };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    const out = {};
    Object.keys(parsed).forEach(function (key) {
      const item = parsed[key] && typeof parsed[key] === "object" ? parsed[key] : {};
      const code = clean(item.countryCode || key, 2).toUpperCase();
      if (!code) return;
      out[code] = {
        countryCode: code,
        currency: clean(item.currency || "", 10).toUpperCase() || "NGN",
        payoutProvider: clean(item.payoutProvider || "manual", 30).toLowerCase(),
        enabled: boolToInt(item.enabled !== false) === 1,
      };
    });
    return out;
  } catch (_error) {
    return {
      NG: { countryCode: "NG", currency: "NGN", payoutProvider: "paystack", enabled: true },
      US: { countryCode: "US", currency: "USD", payoutProvider: "manual", enabled: false },
    };
  }
}

function countryConfig(countryCode) {
  const map = parseCountryCurrencyConfig();
  const code = clean(countryCode || "NG", 2).toUpperCase() || "NG";
  return map[code] || map.NG || { countryCode: "NG", currency: "NGN", payoutProvider: "paystack", enabled: true };
}

function firstHeader(headers, names) {
  const src = headers && typeof headers === "object" ? headers : {};
  for (const name of names) {
    const direct = src[name];
    if (direct) return String(direct);
    const lower = src[String(name).toLowerCase()];
    if (lower) return String(lower);
  }
  return "";
}

function clientIp(headers) {
  const forwarded = firstHeader(headers, ["x-forwarded-for", "client-ip", "x-nf-client-connection-ip", "cf-connecting-ip"]);
  if (!forwarded) return "";
  return clean(String(forwarded).split(",")[0], 90);
}

function clientUserAgent(headers) {
  return clean(firstHeader(headers, ["user-agent"]), 255);
}

function plusDaysSqlDate(days) {
  return new Date(Date.now() + Math.max(0, Number(days) || 0) * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

async function isSchoolStudentAccount(pool, accountId) {
  const id = Number(accountId);
  if (!Number.isFinite(id) || id <= 0) return false;
  const [rows] = await pool.query(
    `SELECT ss.id
     FROM ${SCHOOL_STUDENTS_TABLE} ss
     JOIN ${SCHOOL_ACCOUNTS_TABLE} sc ON sc.id = ss.school_id
     WHERE ss.account_id = ?
       AND ss.status = 'active'
       AND sc.status = 'active'
     ORDER BY ss.id DESC
     LIMIT 1`,
    [id]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureAffiliateTables(pool) {
  await applyRuntimeSettings(pool);
  if (affiliateTablesEnsured) return;
  if (!runtimeSchemaChangesAllowed()) {
    affiliateTablesEnsured = true;
    return;
  }

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${AFFILIATE_PROFILES_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      profile_uuid VARCHAR(64) NOT NULL,
      account_id BIGINT NOT NULL,
      affiliate_code VARCHAR(40) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      eligibility_status VARCHAR(40) NOT NULL DEFAULT 'eligible',
      eligibility_reason VARCHAR(190) NULL,
      country_code VARCHAR(2) NOT NULL DEFAULT 'NG',
      payout_currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
      payout_provider VARCHAR(40) NOT NULL DEFAULT 'paystack',
      risk_level VARCHAR(20) NOT NULL DEFAULT 'normal',
      blocked_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_affiliate_profile_uuid (profile_uuid),
      UNIQUE KEY uniq_tochukwu_affiliate_profile_account (account_id),
      UNIQUE KEY uniq_tochukwu_affiliate_code (affiliate_code),
      KEY idx_tochukwu_affiliate_profile_status (status, eligibility_status),
      KEY idx_tochukwu_affiliate_profile_country (country_code, payout_currency)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${AFFILIATE_COURSE_RULES_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      course_slug VARCHAR(120) NOT NULL,
      is_affiliate_eligible TINYINT(1) NOT NULL DEFAULT 0,
      commission_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
      commission_value INT NOT NULL DEFAULT 0,
      commission_currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
      min_order_amount_minor INT NOT NULL DEFAULT 0,
      hold_days INT NOT NULL DEFAULT 30,
      starts_at DATETIME NULL,
      ends_at DATETIME NULL,
      updated_by VARCHAR(120) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_aff_course_rule_slug (course_slug),
      KEY idx_tochukwu_aff_course_rule_elig (is_affiliate_eligible, course_slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${AFFILIATE_ATTRIBUTIONS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      attribution_uuid VARCHAR(64) NOT NULL,
      order_uuid VARCHAR(64) NOT NULL,
      course_slug VARCHAR(120) NOT NULL,
      affiliate_profile_id BIGINT NULL,
      affiliate_code VARCHAR(40) NULL,
      buyer_email VARCHAR(220) NOT NULL,
      buyer_account_id BIGINT NULL,
      buyer_country VARCHAR(120) NULL,
      buyer_currency VARCHAR(10) NULL,
      order_amount_minor INT NOT NULL DEFAULT 0,
      ip_hash VARCHAR(128) NULL,
      user_agent_hash VARCHAR(128) NULL,
      click_referrer VARCHAR(255) NULL,
      attribution_status VARCHAR(40) NOT NULL DEFAULT 'accepted',
      rejection_reason VARCHAR(190) NULL,
      risk_score INT NOT NULL DEFAULT 0,
      risk_flags_json LONGTEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_aff_attr_uuid (attribution_uuid),
      UNIQUE KEY uniq_tochukwu_aff_attr_order (order_uuid),
      KEY idx_tochukwu_aff_attr_profile (affiliate_profile_id, created_at),
      KEY idx_tochukwu_aff_attr_buyer_email (buyer_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${AFFILIATE_COMMISSIONS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      commission_uuid VARCHAR(64) NOT NULL,
      attribution_id BIGINT NOT NULL,
      order_uuid VARCHAR(64) NOT NULL,
      course_slug VARCHAR(120) NOT NULL,
      affiliate_profile_id BIGINT NOT NULL,
      affiliate_code VARCHAR(40) NOT NULL,
      buyer_email VARCHAR(220) NOT NULL,
      currency VARCHAR(10) NOT NULL,
      order_amount_minor INT NOT NULL DEFAULT 0,
      commission_type VARCHAR(20) NOT NULL,
      commission_rate_or_value INT NOT NULL DEFAULT 0,
      commission_amount_minor INT NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      risk_score INT NOT NULL DEFAULT 0,
      risk_flags_json LONGTEXT NULL,
      payable_at DATETIME NULL,
      paid_at DATETIME NULL,
      reversed_at DATETIME NULL,
      reversal_reason VARCHAR(190) NULL,
      payout_batch_id BIGINT NULL,
      payout_item_id BIGINT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_aff_commission_uuid (commission_uuid),
      UNIQUE KEY uniq_tochukwu_aff_commission_order (order_uuid),
      KEY idx_tochukwu_aff_commission_profile (affiliate_profile_id, status, payable_at),
      KEY idx_tochukwu_aff_commission_batch (payout_batch_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${AFFILIATE_PAYOUT_ACCOUNTS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      account_uuid VARCHAR(64) NOT NULL,
      affiliate_profile_id BIGINT NOT NULL,
      country_code VARCHAR(2) NOT NULL,
      currency VARCHAR(10) NOT NULL,
      payout_provider VARCHAR(40) NOT NULL,
      account_name VARCHAR(180) NULL,
      bank_code VARCHAR(40) NULL,
      bank_name VARCHAR(120) NULL,
      account_number_masked VARCHAR(40) NULL,
      account_number_hash VARCHAR(128) NULL,
      paystack_recipient_code VARCHAR(120) NULL,
      payout_email VARCHAR(220) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      is_verified TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_aff_payout_account_uuid (account_uuid),
      UNIQUE KEY uniq_tochukwu_aff_payout_profile_ccy (affiliate_profile_id, country_code, currency),
      KEY idx_tochukwu_aff_payout_profile (affiliate_profile_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${AFFILIATE_PAYOUT_BATCHES_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      batch_uuid VARCHAR(64) NOT NULL,
      country_code VARCHAR(2) NOT NULL,
      currency VARCHAR(10) NOT NULL,
      payout_provider VARCHAR(40) NOT NULL,
      period_start DATETIME NOT NULL,
      period_end DATETIME NOT NULL,
      scheduled_for DATE NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'processing',
      total_items INT NOT NULL DEFAULT 0,
      total_amount_minor BIGINT NOT NULL DEFAULT 0,
      successful_items INT NOT NULL DEFAULT 0,
      failed_items INT NOT NULL DEFAULT 0,
      run_notes VARCHAR(255) NULL,
      initiated_by VARCHAR(120) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      completed_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_aff_payout_batch_uuid (batch_uuid),
      KEY idx_tochukwu_aff_payout_batch_period (country_code, currency, period_start, period_end),
      KEY idx_tochukwu_aff_payout_batch_status (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${AFFILIATE_PAYOUT_ITEMS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      item_uuid VARCHAR(64) NOT NULL,
      payout_batch_id BIGINT NOT NULL,
      commission_id BIGINT NOT NULL,
      affiliate_profile_id BIGINT NOT NULL,
      payout_account_id BIGINT NULL,
      amount_minor INT NOT NULL DEFAULT 0,
      currency VARCHAR(10) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'processing',
      provider_transfer_id VARCHAR(190) NULL,
      provider_transfer_code VARCHAR(120) NULL,
      provider_reference VARCHAR(190) NULL,
      error_message VARCHAR(255) NULL,
      processed_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_aff_payout_item_uuid (item_uuid),
      UNIQUE KEY uniq_tochukwu_aff_payout_item_commission (commission_id),
      KEY idx_tochukwu_aff_payout_item_batch (payout_batch_id, status),
      KEY idx_tochukwu_aff_payout_item_profile (affiliate_profile_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${AFFILIATE_PAYOUT_CHANGE_OTPS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      otp_uuid VARCHAR(64) NOT NULL,
      affiliate_profile_id BIGINT NOT NULL,
      country_code VARCHAR(2) NOT NULL,
      currency VARCHAR(10) NOT NULL,
      payout_provider VARCHAR(40) NOT NULL,
      target_bank_code VARCHAR(40) NOT NULL,
      target_account_hash VARCHAR(128) NOT NULL,
      target_account_masked VARCHAR(40) NULL,
      sent_to_email VARCHAR(220) NOT NULL,
      otp_hash VARCHAR(128) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 5,
      expires_at DATETIME NOT NULL,
      verified_at DATETIME NULL,
      consumed_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_aff_payout_otp_uuid (otp_uuid),
      KEY idx_tochukwu_aff_payout_otp_profile (affiliate_profile_id, status, expires_at),
      KEY idx_tochukwu_aff_payout_otp_target (affiliate_profile_id, target_bank_code, target_account_hash, status, expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${AFFILIATE_AUDIT_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      event_uuid VARCHAR(64) NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      actor_type VARCHAR(40) NOT NULL DEFAULT 'system',
      actor_id VARCHAR(120) NULL,
      target_type VARCHAR(60) NULL,
      target_id VARCHAR(120) NULL,
      metadata_json LONGTEXT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_aff_audit_uuid (event_uuid),
      KEY idx_tochukwu_aff_audit_type_created (event_type, created_at),
      KEY idx_tochukwu_aff_audit_target (target_type, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${AFFILIATE_SCHOOL_REFERRALS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      referral_uuid VARCHAR(64) NOT NULL,
      school_id BIGINT NOT NULL,
      affiliate_profile_id BIGINT NOT NULL,
      affiliate_code VARCHAR(40) NOT NULL,
      first_order_uuid VARCHAR(64) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_aff_school_ref_uuid (referral_uuid),
      UNIQUE KEY uniq_tochukwu_aff_school_ref_school (school_id),
      KEY idx_tochukwu_aff_school_ref_affiliate (affiliate_profile_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN affiliate_code VARCHAR(40) NULL`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN affiliate_profile_id BIGINT NULL`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN affiliate_attribution_status VARCHAR(40) NULL`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD KEY idx_course_orders_affiliate_profile (affiliate_profile_id)`);
  await safeAlter(pool, `ALTER TABLE course_manual_payments ADD COLUMN affiliate_code VARCHAR(40) NULL`);
  await safeAlter(pool, `ALTER TABLE course_manual_payments ADD COLUMN affiliate_profile_id BIGINT NULL`);
  await safeAlter(pool, `ALTER TABLE course_manual_payments ADD COLUMN affiliate_attribution_status VARCHAR(40) NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_ORDERS_TABLE} ADD COLUMN affiliate_code VARCHAR(40) NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_ORDERS_TABLE} ADD COLUMN affiliate_profile_id BIGINT NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_ORDERS_TABLE} ADD COLUMN affiliate_attribution_status VARCHAR(40) NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_ORDERS_TABLE} ADD KEY idx_school_orders_affiliate_profile (affiliate_profile_id)`);

  const now = nowSql();
  await pool.query(
    `INSERT INTO ${AFFILIATE_COURSE_RULES_TABLE}
      (course_slug, is_affiliate_eligible, commission_type, commission_value, commission_currency, min_order_amount_minor, hold_days, created_at, updated_at)
     VALUES ('prompt-to-profit-schools', 1, 'percentage', 1000, 'NGN', 0, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       updated_at = VALUES(updated_at)`,
    [defaultHoldDays(), now, now]
  );

  affiliateTablesEnsured = true;
}

async function ensureAffiliatePayoutOtpTable(pool) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${AFFILIATE_PAYOUT_CHANGE_OTPS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      otp_uuid VARCHAR(64) NOT NULL,
      affiliate_profile_id BIGINT NOT NULL,
      country_code VARCHAR(2) NOT NULL,
      currency VARCHAR(10) NOT NULL,
      payout_provider VARCHAR(40) NOT NULL,
      target_bank_code VARCHAR(40) NOT NULL,
      target_account_hash VARCHAR(128) NOT NULL,
      target_account_masked VARCHAR(40) NULL,
      sent_to_email VARCHAR(220) NOT NULL,
      otp_hash VARCHAR(128) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 5,
      expires_at DATETIME NOT NULL,
      verified_at DATETIME NULL,
      consumed_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_aff_payout_otp_uuid (otp_uuid),
      KEY idx_tochukwu_aff_payout_otp_profile (affiliate_profile_id, status, expires_at),
      KEY idx_tochukwu_aff_payout_otp_target (affiliate_profile_id, target_bank_code, target_account_hash, status, expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

async function findAffiliateByCode(pool, code) {
  const affiliateCode = clean(code, 40).toUpperCase();
  if (!affiliateCode) return null;
  const [rows] = await pool.query(
    `SELECT p.id, p.profile_uuid, p.account_id, p.affiliate_code, p.status, p.eligibility_status,
            p.country_code, p.payout_currency, p.payout_provider,
            a.email AS account_email
     FROM ${AFFILIATE_PROFILES_TABLE} p
     JOIN ${STUDENT_ACCOUNTS_TABLE} a ON a.id = p.account_id
     WHERE p.affiliate_code = ?
     LIMIT 1`,
    [affiliateCode]
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function resolveEligibleAffiliateByCode(pool, code) {
  const profile = await findAffiliateByCode(pool, code);
  if (!profile) return { ok: false, error: "Invalid affiliate code" };
  if (String(profile.status || "") !== "active") return { ok: false, error: "Affiliate inactive" };
  if (String(profile.eligibility_status || "") !== "eligible") return { ok: false, error: "Affiliate not eligible" };
  return { ok: true, profile };
}

async function findStudentAccountByEmail(pool, emailInput) {
  const email = normalizeEmail(emailInput);
  if (!email) return null;
  const [rows] = await pool.query(
    `SELECT id, email
     FROM ${STUDENT_ACCOUNTS_TABLE}
     WHERE email = ?
     LIMIT 1`,
    [email]
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function ensureAffiliateProfileForAccount(pool, accountId, options) {
  await ensureAffiliateTables(pool);
  const id = Number(accountId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid account id");

  const cfg = options && typeof options === "object" ? options : {};
  const now = nowSql();

  const [rows] = await pool.query(
    `SELECT id, profile_uuid, account_id, affiliate_code, status, eligibility_status,
            eligibility_reason, country_code, payout_currency, payout_provider
     FROM ${AFFILIATE_PROFILES_TABLE}
     WHERE account_id = ?
     LIMIT 1`,
    [id]
  );

  let row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    let code = "";
    for (let i = 0; i < 10; i += 1) {
      code = randomCode(8);
      try {
        await pool.query(
          `INSERT INTO ${AFFILIATE_PROFILES_TABLE}
            (profile_uuid, account_id, affiliate_code, status, eligibility_status, country_code, payout_currency, payout_provider, created_at, updated_at)
           VALUES (?, ?, ?, 'active', 'eligible', ?, ?, ?, ?, ?)`,
          [
            `aff_${crypto.randomUUID().replace(/-/g, "")}`,
            id,
            code,
            clean(cfg.countryCode, 2).toUpperCase() || "NG",
            clean(cfg.currency, 10).toUpperCase() || "NGN",
            clean(cfg.payoutProvider, 40).toLowerCase() || "paystack",
            now,
            now,
          ]
        );
        break;
      } catch (_error) {
        code = "";
      }
    }
    if (!code) throw new Error("Could not generate affiliate code");
    const [newRows] = await pool.query(
      `SELECT id, profile_uuid, account_id, affiliate_code, status, eligibility_status,
              eligibility_reason, country_code, payout_currency, payout_provider
       FROM ${AFFILIATE_PROFILES_TABLE}
       WHERE account_id = ?
       LIMIT 1`,
      [id]
    );
    row = Array.isArray(newRows) && newRows.length ? newRows[0] : null;
  }

  const inSchool = await isSchoolStudentAccount(pool, id);
  const eligibilityStatus = inSchool ? "ineligible_school_student" : "eligible";
  const eligibilityReason = inSchool ? "School-linked students cannot be affiliates." : null;

  if (row && (String(row.eligibility_status || "") !== eligibilityStatus || String(row.eligibility_reason || "") !== String(eligibilityReason || ""))) {
    await pool.query(
      `UPDATE ${AFFILIATE_PROFILES_TABLE}
       SET eligibility_status = ?, eligibility_reason = ?, updated_at = ?
       WHERE id = ?
       LIMIT 1`,
      [eligibilityStatus, eligibilityReason, nowSql(), Number(row.id)]
    );
    row.eligibility_status = eligibilityStatus;
    row.eligibility_reason = eligibilityReason;
  }

  return row;
}

async function resolveCourseRule(pool, courseSlugInput, nowInput) {
  const slug = normalizeCourse(courseSlugInput);
  const now = clean(nowInput, 30) || nowSql();
  if (!slug) return null;
  const [rows] = await pool.query(
    `SELECT id, course_slug, is_affiliate_eligible, commission_type, commission_value,
            commission_currency, min_order_amount_minor, hold_days, starts_at, ends_at
     FROM ${AFFILIATE_COURSE_RULES_TABLE}
     WHERE course_slug = ?
       AND (starts_at IS NULL OR starts_at <= ?)
       AND (ends_at IS NULL OR ends_at >= ?)
     LIMIT 1`,
    [slug, now, now]
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function computeCommissionAmountMinor(orderAmountMinor, rule) {
  const amount = toMinor(orderAmountMinor);
  if (!rule) return 0;
  const type = clean(rule.commission_type, 20).toLowerCase();
  const value = toInt(rule.commission_value, 0);
  if (type === "fixed") return Math.max(0, value);
  const bps = Math.max(0, Math.min(value, 10000));
  return Math.max(0, Math.floor((amount * bps) / 10000));
}

function buildRiskAssessment(input) {
  const flags = [];
  let score = 0;

  const refEmail = normalizeEmail(input && input.affiliateEmail);
  const buyerEmail = normalizeEmail(input && input.buyerEmail);
  if (refEmail && buyerEmail && refEmail === buyerEmail) {
    flags.push("self_referral_same_email");
    score += 100;
  }

  const refAccountId = Number(input && input.affiliateAccountId || 0);
  const buyerAccountId = Number(input && input.buyerAccountId || 0);
  if (refAccountId > 0 && buyerAccountId > 0 && refAccountId === buyerAccountId) {
    flags.push("self_referral_same_account");
    score += 100;
  }

  const ipHash = clean(input && input.ipHash, 128);
  const userAgentHash = clean(input && input.userAgentHash, 128);
  const affiliateDeviceFingerprint = clean(input && input.affiliateDeviceFingerprint, 128);
  if (ipHash && affiliateDeviceFingerprint && ipHash === affiliateDeviceFingerprint) {
    flags.push("buyer_ip_matches_affiliate_device");
    score += 45;
  }

  if (userAgentHash && affiliateDeviceFingerprint && userAgentHash === affiliateDeviceFingerprint) {
    flags.push("buyer_user_agent_matches_affiliate_device");
    score += 45;
  }

  return {
    score,
    flags,
    isBlocked: score >= 90,
  };
}

async function recordAffiliateAttribution(pool, input) {
  await ensureAffiliateTables(pool);
  if (!affiliateEnabled()) {
    return { ok: false, status: "disabled", reason: "Affiliate system disabled" };
  }

  const orderUuid = clean(input && input.orderUuid, 64);
  const courseSlug = normalizeCourse(input && input.courseSlug);
  const buyerEmail = normalizeEmail(input && input.buyerEmail);
  const buyerCountry = clean(input && input.buyerCountry, 120) || "Nigeria";
  const buyerCurrency = clean(input && input.buyerCurrency, 10).toUpperCase();
  const affiliateCode = clean(input && input.affiliateCode, 40).toUpperCase();
  const orderAmountMinor = toMinor(input && input.orderAmountMinor);
  const headers = input && input.requestHeaders ? input.requestHeaders : {};

  if (!orderUuid || !courseSlug || !buyerEmail) {
    return { ok: false, status: "invalid", reason: "Missing order attribution inputs" };
  }

  const now = nowSql();
  const ip = clientIp(headers);
  const ua = clientUserAgent(headers);
  const ipHash = ip ? sha256(`ip:${ip}`) : "";
  const uaHash = ua ? sha256(`ua:${ua}`) : "";
  const clickReferrer = clean(firstHeader(headers, ["referer", "referrer"]), 255);

  let attributionStatus = "rejected";
  let rejectionReason = "No affiliate code";
  let affiliateProfile = null;
  let rule = null;
  let buyerAccount = null;
  let risk = { score: 0, flags: [], isBlocked: false };

  if (affiliateCode) {
    affiliateProfile = await findAffiliateByCode(pool, affiliateCode);
    if (!affiliateProfile) {
      rejectionReason = "Invalid affiliate code";
    } else if (String(affiliateProfile.status || "") !== "active") {
      rejectionReason = "Affiliate inactive";
    } else if (String(affiliateProfile.eligibility_status || "") !== "eligible") {
      rejectionReason = "Affiliate not eligible";
    } else {
      rule = await resolveCourseRule(pool, courseSlug, now);
      if (!rule || Number(rule.is_affiliate_eligible || 0) !== 1) {
        rejectionReason = "Course not affiliate-eligible";
      } else if (orderAmountMinor < toMinor(rule.min_order_amount_minor || 0)) {
        rejectionReason = "Order below commission threshold";
      } else {
        buyerAccount = await findStudentAccountByEmail(pool, buyerEmail);
        risk = buildRiskAssessment({
          affiliateEmail: affiliateProfile.account_email,
          buyerEmail,
          affiliateAccountId: Number(affiliateProfile.account_id || 0),
          buyerAccountId: Number(buyerAccount && buyerAccount.id || 0),
          ipHash,
          userAgentHash: uaHash,
          affiliateDeviceFingerprint: "",
        });
        if (risk.isBlocked) {
          rejectionReason = "High-risk attribution blocked";
        } else {
          attributionStatus = "accepted";
          rejectionReason = null;
        }
      }
    }
  }

  const [existing] = await pool.query(
    `SELECT id
     FROM ${AFFILIATE_ATTRIBUTIONS_TABLE}
     WHERE order_uuid = ?
     LIMIT 1`,
    [orderUuid]
  );
  if (Array.isArray(existing) && existing.length) {
    await pool.query(
      `UPDATE ${AFFILIATE_ATTRIBUTIONS_TABLE}
       SET affiliate_profile_id = ?,
           affiliate_code = ?,
           buyer_email = ?,
           buyer_account_id = ?,
           buyer_country = ?,
           buyer_currency = ?,
           order_amount_minor = ?,
           ip_hash = ?,
           user_agent_hash = ?,
           click_referrer = ?,
           attribution_status = ?,
           rejection_reason = ?,
           risk_score = ?,
           risk_flags_json = ?,
           updated_at = ?
       WHERE order_uuid = ?`,
      [
        affiliateProfile ? Number(affiliateProfile.id) : null,
        affiliateProfile ? clean(affiliateProfile.affiliate_code, 40) : null,
        buyerEmail,
        buyerAccount ? Number(buyerAccount.id) : null,
        buyerCountry,
        buyerCurrency || null,
        orderAmountMinor,
        ipHash || null,
        uaHash || null,
        clickReferrer || null,
        attributionStatus,
        rejectionReason,
        toInt(risk.score, 0),
        JSON.stringify(risk.flags || []),
        now,
        orderUuid,
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO ${AFFILIATE_ATTRIBUTIONS_TABLE}
        (attribution_uuid, order_uuid, course_slug, affiliate_profile_id, affiliate_code,
         buyer_email, buyer_account_id, buyer_country, buyer_currency, order_amount_minor,
         ip_hash, user_agent_hash, click_referrer, attribution_status, rejection_reason,
         risk_score, risk_flags_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `aat_${crypto.randomUUID().replace(/-/g, "")}`,
        orderUuid,
        courseSlug,
        affiliateProfile ? Number(affiliateProfile.id) : null,
        affiliateProfile ? clean(affiliateProfile.affiliate_code, 40) : null,
        buyerEmail,
        buyerAccount ? Number(buyerAccount.id) : null,
        buyerCountry || null,
        buyerCurrency || null,
        orderAmountMinor,
        ipHash || null,
        uaHash || null,
        clickReferrer || null,
        attributionStatus,
        rejectionReason,
        toInt(risk.score, 0),
        JSON.stringify(risk.flags || []),
        now,
        now,
      ]
    );
  }

  if (affiliateProfile && attributionStatus === "accepted") {
    await pool.query(
      `UPDATE course_orders
       SET affiliate_code = ?, affiliate_profile_id = ?, affiliate_attribution_status = 'accepted'
       WHERE order_uuid = ?
       LIMIT 1`,
      [clean(affiliateProfile.affiliate_code, 40), Number(affiliateProfile.id), orderUuid]
    );
    await pool.query(
      `UPDATE course_manual_payments
       SET affiliate_code = ?, affiliate_profile_id = ?, affiliate_attribution_status = 'accepted'
       WHERE payment_uuid = ?
       LIMIT 1`,
      [clean(affiliateProfile.affiliate_code, 40), Number(affiliateProfile.id), orderUuid]
    );
  } else {
    await pool.query(
      `UPDATE course_orders
       SET affiliate_attribution_status = ?
       WHERE order_uuid = ?
       LIMIT 1`,
      [attributionStatus, orderUuid]
    );
    await pool.query(
      `UPDATE course_manual_payments
       SET affiliate_attribution_status = ?
       WHERE payment_uuid = ?
       LIMIT 1`,
      [attributionStatus, orderUuid]
    );
  }

  return {
    ok: attributionStatus === "accepted",
    status: attributionStatus,
    reason: rejectionReason || null,
    affiliateProfileId: affiliateProfile ? Number(affiliateProfile.id) : null,
    affiliateCode: affiliateProfile ? clean(affiliateProfile.affiliate_code, 40) : "",
  };
}

async function createAffiliateCommissionForPaidOrder(pool, input) {
  await ensureAffiliateTables(pool);
  if (!affiliateEnabled()) return { ok: false, skipped: true, reason: "disabled" };

  const orderUuid = clean(input && input.orderUuid, 64);
  if (!orderUuid) return { ok: false, error: "Missing order uuid" };

  const [existing] = await pool.query(
    `SELECT id
     FROM ${AFFILIATE_COMMISSIONS_TABLE}
     WHERE order_uuid = ?
     LIMIT 1`,
    [orderUuid]
  );
  if (Array.isArray(existing) && existing.length) {
    return { ok: true, alreadyExists: true };
  }

  const [rows] = await pool.query(
    `SELECT a.id,
            a.order_uuid,
            a.course_slug,
            a.affiliate_profile_id,
            a.affiliate_code,
            a.buyer_email,
            a.buyer_currency,
            a.order_amount_minor,
            a.attribution_status,
            a.risk_score,
            a.risk_flags_json
     FROM ${AFFILIATE_ATTRIBUTIONS_TABLE} a
     WHERE a.order_uuid = ?
     LIMIT 1`,
    [orderUuid]
  );
  const attribution = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!attribution) return { ok: false, skipped: true, reason: "attribution_missing" };

  if (String(attribution.attribution_status || "") !== "accepted") {
    return { ok: false, skipped: true, reason: "attribution_not_accepted" };
  }

  if (!Number(attribution.affiliate_profile_id || 0)) {
    return { ok: false, skipped: true, reason: "affiliate_profile_missing" };
  }

  const [profileRows] = await pool.query(
    `SELECT id, account_id, status, eligibility_status
     FROM ${AFFILIATE_PROFILES_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [Number(attribution.affiliate_profile_id)]
  );
  const profile = Array.isArray(profileRows) && profileRows.length ? profileRows[0] : null;
  if (!profile || String(profile.eligibility_status || "") !== "eligible" || String(profile.status || "") !== "active") {
    return { ok: false, skipped: true, reason: "affiliate_not_eligible" };
  }

  const inSchool = await isSchoolStudentAccount(pool, Number(profile.account_id || 0));
  if (inSchool) {
    await pool.query(
      `UPDATE ${AFFILIATE_PROFILES_TABLE}
       SET eligibility_status = 'ineligible_school_student',
           eligibility_reason = 'School-linked students cannot be affiliates.',
           updated_at = ?
       WHERE id = ?
       LIMIT 1`,
      [nowSql(), Number(profile.id)]
    );
    return { ok: false, skipped: true, reason: "affiliate_not_eligible" };
  }

  const rule = await resolveCourseRule(pool, attribution.course_slug, nowSql());
  if (!rule || Number(rule.is_affiliate_eligible || 0) !== 1) {
    return { ok: false, skipped: true, reason: "course_not_eligible" };
  }

  const riskScore = toInt(attribution.risk_score, 0);
  const riskFlags = (() => {
    try {
      const parsed = JSON.parse(String(attribution.risk_flags_json || "[]"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  })();

  if (riskScore >= 90 || riskFlags.indexOf("self_referral_same_email") !== -1 || riskFlags.indexOf("self_referral_same_account") !== -1) {
    return { ok: false, skipped: true, reason: "high_risk" };
  }

  const orderAmountMinor = toMinor(attribution.order_amount_minor);
  const commissionAmountMinor = computeCommissionAmountMinor(orderAmountMinor, rule);
  if (commissionAmountMinor <= 0) {
    return { ok: false, skipped: true, reason: "zero_commission" };
  }

  const holdDays = Math.max(0, toInt(rule.hold_days, defaultHoldDays()));
  const payableAt = plusDaysSqlDate(holdDays);
  const now = nowSql();

  await pool.query(
    `INSERT INTO ${AFFILIATE_COMMISSIONS_TABLE}
      (commission_uuid, attribution_id, order_uuid, course_slug, affiliate_profile_id, affiliate_code,
       buyer_email, currency, order_amount_minor, commission_type, commission_rate_or_value,
       commission_amount_minor, status, risk_score, risk_flags_json, payable_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    [
      `acm_${crypto.randomUUID().replace(/-/g, "")}`,
      Number(attribution.id),
      orderUuid,
      clean(attribution.course_slug, 120),
      Number(attribution.affiliate_profile_id),
      clean(attribution.affiliate_code, 40),
      normalizeEmail(attribution.buyer_email),
      clean(rule.commission_currency || attribution.buyer_currency || "NGN", 10).toUpperCase(),
      orderAmountMinor,
      clean(rule.commission_type, 20).toLowerCase(),
      toInt(rule.commission_value, 0),
      commissionAmountMinor,
      riskScore,
      JSON.stringify(riskFlags),
      payableAt,
      now,
      now,
    ]
  );

  return { ok: true, amountMinor: commissionAmountMinor, payableAt };
}

async function captureSchoolOrderReferral(pool, input) {
  await ensureAffiliateTables(pool);
  if (!affiliateEnabled()) return { ok: false, status: "disabled" };
  const orderUuid = clean(input && input.orderUuid, 64);
  const code = clean(input && input.affiliateCode, 40).toUpperCase();
  if (!orderUuid || !code) return { ok: false, status: "invalid", error: "Missing orderUuid or affiliateCode" };

  const resolved = await resolveEligibleAffiliateByCode(pool, code);
  if (!resolved.ok) {
    await pool.query(
      `UPDATE ${SCHOOL_ORDERS_TABLE}
       SET affiliate_attribution_status = ?, updated_at = ?
       WHERE order_uuid = ?
       LIMIT 1`,
      ["rejected", nowSql(), orderUuid]
    );
    return { ok: false, status: "rejected", error: resolved.error || "Invalid affiliate" };
  }

  await pool.query(
    `UPDATE ${SCHOOL_ORDERS_TABLE}
     SET affiliate_code = ?, affiliate_profile_id = ?, affiliate_attribution_status = 'accepted', updated_at = ?
     WHERE order_uuid = ?
     LIMIT 1`,
    [clean(resolved.profile.affiliate_code, 40), Number(resolved.profile.id), nowSql(), orderUuid]
  );
  return {
    ok: true,
    status: "accepted",
    affiliateProfileId: Number(resolved.profile.id),
    affiliateCode: clean(resolved.profile.affiliate_code, 40),
  };
}

async function resolveSchoolReferralProfile(pool, schoolId) {
  const sid = Number(schoolId);
  if (!Number.isFinite(sid) || sid <= 0) return null;
  const [rows] = await pool.query(
    `SELECT sr.affiliate_profile_id, sr.affiliate_code
     FROM ${AFFILIATE_SCHOOL_REFERRALS_TABLE} sr
     JOIN ${AFFILIATE_PROFILES_TABLE} ap ON ap.id = sr.affiliate_profile_id
     WHERE sr.school_id = ?
       AND sr.status = 'active'
       AND ap.status = 'active'
       AND ap.eligibility_status = 'eligible'
     LIMIT 1`,
    [sid]
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function bindSchoolReferralAfterPayment(pool, input) {
  await ensureAffiliateTables(pool);
  const schoolId = Number(input && input.schoolId || 0);
  const orderUuid = clean(input && input.schoolOrderUuid, 64);
  if (!Number.isFinite(schoolId) || schoolId <= 0 || !orderUuid) return { ok: false, skipped: true };

  const existing = await resolveSchoolReferralProfile(pool, schoolId);
  if (existing) return { ok: true, affiliateProfileId: Number(existing.affiliate_profile_id), affiliateCode: clean(existing.affiliate_code, 40) };

  const [rows] = await pool.query(
    `SELECT affiliate_profile_id, affiliate_code, affiliate_attribution_status
     FROM ${SCHOOL_ORDERS_TABLE}
     WHERE order_uuid = ?
     LIMIT 1`,
    [orderUuid]
  );
  const order = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!order) return { ok: false, skipped: true };
  if (String(order.affiliate_attribution_status || "") !== "accepted") return { ok: false, skipped: true };
  const affiliateProfileId = Number(order.affiliate_profile_id || 0);
  if (!Number.isFinite(affiliateProfileId) || affiliateProfileId <= 0) return { ok: false, skipped: true };

  const now = nowSql();
  await pool.query(
    `INSERT INTO ${AFFILIATE_SCHOOL_REFERRALS_TABLE}
      (referral_uuid, school_id, affiliate_profile_id, affiliate_code, first_order_uuid, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
     ON DUPLICATE KEY UPDATE
       affiliate_profile_id = VALUES(affiliate_profile_id),
       affiliate_code = VALUES(affiliate_code),
       updated_at = VALUES(updated_at)`,
    [
      `asr_${crypto.randomUUID().replace(/-/g, "")}`,
      schoolId,
      affiliateProfileId,
      clean(order.affiliate_code, 40),
      orderUuid,
      now,
      now,
    ]
  );
  return { ok: true, affiliateProfileId, affiliateCode: clean(order.affiliate_code, 40) };
}

async function createAffiliateCommissionForSchoolStudentOnboard(pool, input) {
  await ensureAffiliateTables(pool);
  if (!affiliateEnabled()) return { ok: false, skipped: true, reason: "disabled" };
  const studentId = Number(input && input.schoolStudentId || 0);
  if (!Number.isFinite(studentId) || studentId <= 0) return { ok: false, skipped: true, reason: "missing_student_id" };

  const pseudoOrderUuid = `school_student_onboard_${studentId}`;
  const [existing] = await pool.query(
    `SELECT id
     FROM ${AFFILIATE_COMMISSIONS_TABLE}
     WHERE order_uuid = ?
     LIMIT 1`,
    [pseudoOrderUuid]
  );
  if (Array.isArray(existing) && existing.length) return { ok: true, alreadyExists: true };

  const [rows] = await pool.query(
    `SELECT ss.id AS student_id, ss.school_id, ss.email,
            sc.course_slug, sc.currency, sc.price_per_student_minor
     FROM ${SCHOOL_STUDENTS_TABLE} ss
     JOIN ${SCHOOL_ACCOUNTS_TABLE} sc ON sc.id = ss.school_id
     WHERE ss.id = ?
       AND ss.status = 'active'
       AND sc.status = 'active'
     LIMIT 1`,
    [studentId]
  );
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) return { ok: false, skipped: true, reason: "student_not_active" };

  const referral = await resolveSchoolReferralProfile(pool, Number(row.school_id || 0));
  if (!referral) return { ok: false, skipped: true, reason: "school_referral_missing" };

  const rule = await resolveCourseRule(pool, normalizeCourse(row.course_slug), nowSql());
  if (!rule || Number(rule.is_affiliate_eligible || 0) !== 1) {
    return { ok: false, skipped: true, reason: "course_not_eligible" };
  }

  const baseMinor = toMinor(row.price_per_student_minor);
  const minOrderMinor = toMinor(rule.min_order_amount_minor || 0);
  if (baseMinor < minOrderMinor) {
    return { ok: false, skipped: true, reason: "below_min_order" };
  }

  const ruleType = clean(rule.commission_type, 20).toLowerCase();
  const ruleValue = toInt(rule.commission_value, 0);
  const commissionAmountMinor = ruleType === "percentage"
    ? Math.max(0, Math.floor((baseMinor * Math.max(0, Math.min(ruleValue, 10000))) / 10000))
    : Math.max(0, ruleValue);
  if (commissionAmountMinor <= 0) return { ok: false, skipped: true, reason: "zero_commission" };

  const holdDays = Math.max(0, Math.min(120, toInt(rule.hold_days, defaultHoldDays())));

  const now = nowSql();
  await pool.query(
    `INSERT INTO ${AFFILIATE_COMMISSIONS_TABLE}
      (commission_uuid, attribution_id, order_uuid, course_slug, affiliate_profile_id, affiliate_code,
       buyer_email, currency, order_amount_minor, commission_type, commission_rate_or_value,
       commission_amount_minor, status, risk_score, risk_flags_json, payable_at, created_at, updated_at)
     VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, '[]', ?, ?, ?)`,
    [
      `acm_${crypto.randomUUID().replace(/-/g, "")}`,
      pseudoOrderUuid,
      normalizeCourse(row.course_slug),
      Number(referral.affiliate_profile_id),
      clean(referral.affiliate_code, 40),
      normalizeEmail(row.email),
      clean(rule.commission_currency || row.currency || "NGN", 10).toUpperCase(),
      baseMinor,
      ruleType,
      ruleValue,
      commissionAmountMinor,
      plusDaysSqlDate(holdDays),
      now,
      now,
    ]
  );
  return { ok: true, amountMinor: commissionAmountMinor };
}

async function matureAffiliateCommissions(pool, nowInput) {
  await ensureAffiliateTables(pool);
  const now = clean(nowInput, 30) || nowSql();
  const [res] = await pool.query(
    `UPDATE ${AFFILIATE_COMMISSIONS_TABLE}
     SET status = 'approved',
         updated_at = ?
     WHERE status = 'pending'
       AND payable_at IS NOT NULL
       AND payable_at <= ?
       AND risk_score < 90`,
    [now, now]
  );
  return {
    ok: true,
    matured: Number(res && res.affectedRows || 0),
  };
}

async function listAffiliatePayoutBanks(pool, input) {
  await ensureAffiliateTables(pool);
  const includeMeta = Boolean(input && input.includeMeta);
  const countryCode = clean(input && input.countryCode || "NG", 2).toUpperCase() || "NG";
  const config = countryConfig(countryCode);
  if (!config.enabled) throw new Error("Affiliate payouts are not enabled for this country yet");
  const currency = clean(config.currency || input && input.currency || "NGN", 10).toUpperCase();
  const payoutProvider = clean(config.payoutProvider || input && input.payoutProvider || "paystack", 40).toLowerCase();
  if (payoutProvider !== "paystack" || countryCode !== "NG" || currency !== "NGN") {
    const emptyResult = {
      banks: [],
      meta: {
        source: "not_supported",
        queryVariant: "none",
        mode: paystackSecretMode(),
      },
    };
    return includeMeta ? emptyResult : emptyResult.banks;
  }

  const cacheKey = bankCacheKey(countryCode, currency, payoutProvider);
  const cached = paystackBanksCache.get(cacheKey);

  const paystackResult = await paystackListBanks({
    country: countryCode,
    currency,
    perPage: 100,
    includeMeta: true,
  }).catch(function (error) {
    return {
      banks: [],
      source: "paystack",
      queryVariant: clean(error && error.queryVariant, 80) || "none",
      mode: paystackSecretMode(),
      errorReason: clean(error && error.paystackReason, 80) || "unknown",
      attempts: [],
    };
  });
  const primaryBanks = normalizeBankRows(paystackResult && paystackResult.banks);
  if (primaryBanks.length) {
    paystackBanksCache.set(cacheKey, {
      banks: primaryBanks,
      fetchedAt: Date.now(),
      queryVariant: clean(paystackResult && paystackResult.queryVariant, 120),
      mode: clean(paystackResult && paystackResult.mode, 20) || paystackSecretMode(),
    });
    logAffiliatePayout("banks_list_fetch", {
      countryCode,
      currency,
      payoutProvider,
      source: "paystack",
      queryVariant: clean(paystackResult && paystackResult.queryVariant, 120) || "unknown",
      resultCount: primaryBanks.length,
      mode: clean(paystackResult && paystackResult.mode, 20) || paystackSecretMode(),
    });
    return includeMeta
      ? { banks: primaryBanks, meta: { source: "paystack", queryVariant: clean(paystackResult.queryVariant, 120), mode: clean(paystackResult.mode, 20) || paystackSecretMode() } }
      : primaryBanks;
  }

  const cacheFresh = cached && Date.now() - Number(cached.fetchedAt || 0) <= PAYSTACK_BANKS_CACHE_TTL_MS;
  if (cacheFresh) {
    logAffiliatePayout("banks_list_fetch", {
      countryCode,
      currency,
      payoutProvider,
      source: "cache",
      queryVariant: clean(cached.queryVariant, 120) || "cache",
      resultCount: Array.isArray(cached.banks) ? cached.banks.length : 0,
      mode: clean(cached.mode, 20) || paystackSecretMode(),
    });
    return includeMeta
      ? { banks: cached.banks, meta: { source: "cache", queryVariant: clean(cached.queryVariant, 120) || "cache", mode: clean(cached.mode, 20) || paystackSecretMode() } }
      : cached.banks;
  }

  const fallbackValidation = await paystackListBanks({
    country: countryCode,
    useCursor: true,
    perPage: 200,
    includeMeta: true,
  }).catch(function (error) {
    return {
      banks: [],
      source: "paystack",
      queryVariant: clean(error && error.queryVariant, 80) || "none",
      mode: paystackSecretMode(),
      errorReason: clean(error && error.paystackReason, 80) || "unknown",
    };
  });
  const verifiedCodes = new Set(normalizeBankRows(fallbackValidation && fallbackValidation.banks).map(function (item) { return item.code; }));
  const verifiedFallbackBanks = normalizeBankRows(NIGERIAN_BANKS_FALLBACK.filter(function (item) {
    return verifiedCodes.has(clean(item && item.code, 40));
  }));
  if (verifiedFallbackBanks.length) {
    paystackBanksCache.set(cacheKey, {
      banks: verifiedFallbackBanks,
      fetchedAt: Date.now(),
      queryVariant: clean(fallbackValidation && fallbackValidation.queryVariant, 120) || "fallback_verified",
      mode: clean(fallbackValidation && fallbackValidation.mode, 20) || paystackSecretMode(),
    });
    logAffiliatePayout("banks_list_fetch", {
      countryCode,
      currency,
      payoutProvider,
      source: "fallback_verified",
      queryVariant: clean(fallbackValidation && fallbackValidation.queryVariant, 120) || "fallback_verified",
      resultCount: verifiedFallbackBanks.length,
      mode: clean(fallbackValidation && fallbackValidation.mode, 20) || paystackSecretMode(),
    });
    return includeMeta
      ? { banks: verifiedFallbackBanks, meta: { source: "fallback_verified", queryVariant: clean(fallbackValidation.queryVariant, 120) || "fallback_verified", mode: clean(fallbackValidation.mode, 20) || paystackSecretMode() } }
      : verifiedFallbackBanks;
  }

  const errorReason = clean(
    paystackResult && paystackResult.errorReason ||
    fallbackValidation && fallbackValidation.errorReason ||
    "",
    80
  ) || "banks_unavailable";
  logAffiliatePayout("banks_list_fetch", {
    countryCode,
    currency,
    payoutProvider,
    source: "empty",
    queryVariant: clean(paystackResult && paystackResult.queryVariant, 120) || "none",
    resultCount: 0,
    mode: clean(paystackResult && paystackResult.mode, 20) || paystackSecretMode(),
    errorReason,
  });
  const emptyResult = {
    banks: [],
    meta: {
      source: "empty",
      queryVariant: clean(paystackResult && paystackResult.queryVariant, 120) || "none",
      mode: clean(paystackResult && paystackResult.mode, 20) || paystackSecretMode(),
      errorReason,
      userMessage: "Bank list is temporarily unavailable. Please retry in a few moments.",
    },
  };
  return includeMeta ? emptyResult : emptyResult.banks;
}

async function resolveAffiliatePayoutAccount(pool, input) {
  await ensureAffiliateTables(pool);
  const countryCode = clean(input && input.countryCode || "NG", 2).toUpperCase() || "NG";
  const config = countryConfig(countryCode);
  if (!config.enabled) throw new Error("Affiliate payouts are not enabled for this country yet");
  const currency = clean(config.currency || input && input.currency || "NGN", 10).toUpperCase();
  const payoutProvider = clean(config.payoutProvider || input && input.payoutProvider || "paystack", 40).toLowerCase();
  if (payoutProvider !== "paystack" || countryCode !== "NG" || currency !== "NGN") {
    throw new Error("Paystack account resolution is currently configured for Nigeria (NGN) only");
  }

  const bankCode = clean(input && input.bankCode, 40);
  const accountNumber = clean(input && input.accountNumber, 40).replace(/\D/g, "");
  if (!bankCode) throw new Error("Bank selection is required");
  if (!accountNumber || accountNumber.length < 10) throw new Error("Valid account number is required");

  let resolved;
  try {
    resolved = await paystackResolveBankAccount({ accountNumber, bankCode });
  } catch (error) {
    const reason = clean(
      error && error.paystackReason || normalizePaystackErrorReason(error && error.message, error && error.paystackStatusCode),
      80
    ) || "unknown";
    logAffiliatePayout("account_resolve_failed", {
      countryCode,
      currency,
      payoutProvider,
      bankCode: clean(bankCode, 40),
      errorReason: reason,
      statusCode: Number(error && error.paystackStatusCode || 0),
      mode: paystackSecretMode(),
    });
    throw new Error(accountResolveErrorMessage(reason));
  }
  const banks = await listAffiliatePayoutBanks(pool, { countryCode, currency, payoutProvider });
  const bank = banks.find(function (item) { return item.code === bankCode; }) || null;
  return {
    bankCode,
    bankName: bank ? clean(bank.name, 120) : "",
    accountName: clean(resolved && resolved.accountName, 180),
    accountNumber: clean(resolved && resolved.accountNumber, 40),
  };
}

async function findActivePayoutAccountForProfile(pool, profileId, countryCode, currency) {
  const [rows] = await pool.query(
    `SELECT id, bank_code, account_number_hash, account_number_masked, is_verified
     FROM ${AFFILIATE_PAYOUT_ACCOUNTS_TABLE}
     WHERE affiliate_profile_id = ?
       AND country_code = ?
       AND currency = ?
       AND status = 'active'
     ORDER BY id DESC
     LIMIT 1`,
    [Number(profileId), clean(countryCode, 2).toUpperCase(), clean(currency, 10).toUpperCase()]
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function isPayoutAccountChange(existing, bankCode, accountNumber) {
  if (!existing) return false;
  const existingBankCode = clean(existing.bank_code, 40);
  const existingHash = clean(existing.account_number_hash, 128);
  const targetBankCode = clean(bankCode, 40);
  const targetHash = accountNumber ? sha256(`acct:${accountNumber}`) : "";
  if (!existingBankCode || !existingHash || !targetBankCode || !targetHash) return false;
  return existingBankCode !== targetBankCode || existingHash !== targetHash;
}

async function sendAffiliatePayoutChangeOtp(pool, input) {
  await ensureAffiliateTables(pool);
  await ensureAffiliatePayoutOtpTable(pool);

  const accountId = Number(input && input.accountId || 0);
  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error("Invalid account id");

  const profile = await ensureAffiliateProfileForAccount(pool, accountId);
  if (!profile || String(profile.eligibility_status || "") !== "eligible") {
    throw new Error("Affiliate profile is not eligible");
  }

  const accountEmail = normalizeEmail(input && input.accountEmail);
  if (!accountEmail) throw new Error("Registered account email not available");

  const countryCode = clean(input && input.countryCode || profile.country_code || "NG", 2).toUpperCase() || "NG";
  const config = countryConfig(countryCode);
  if (!config.enabled) throw new Error("Affiliate payouts are not enabled for this country yet");

  const currency = clean(config.currency || input && input.currency || profile.payout_currency || "NGN", 10).toUpperCase();
  const payoutProvider = clean(config.payoutProvider || input && input.payoutProvider || profile.payout_provider || "paystack", 40).toLowerCase();
  if (payoutProvider !== "paystack" || countryCode !== "NG" || currency !== "NGN") {
    throw new Error("OTP verification for payout account changes is currently configured for Nigeria (NGN) only");
  }
  const bankCode = clean(input && input.bankCode, 40);
  const accountNumber = clean(input && input.accountNumber, 40).replace(/\D/g, "");

  if (!bankCode) throw new Error("Select a bank before requesting verification code");
  if (!accountNumber || accountNumber.length < 10) throw new Error("Enter a valid account number before requesting verification code");

  const existing = await findActivePayoutAccountForProfile(pool, profile.id, countryCode, currency);
  const changingExisting = isPayoutAccountChange(existing, bankCode, accountNumber);
  if (!changingExisting) {
    return {
      ok: true,
      otpRequired: false,
      emailMasked: maskEmailAddress(accountEmail),
      message: existing ? "No account change detected." : "No existing payout account yet.",
    };
  }

  const now = nowSql();
  const code = randomNumericCode(6);
  const codeHash = otpCodeHash(code);
  const targetAccountMasked = maskAccountNumber(accountNumber);
  const targetAccountHash = sha256(`acct:${accountNumber}`);

  await pool.query(
    `UPDATE ${AFFILIATE_PAYOUT_CHANGE_OTPS_TABLE}
     SET status = 'cancelled', updated_at = ?
     WHERE affiliate_profile_id = ?
       AND status IN ('pending', 'verified')`,
    [now, Number(profile.id)]
  );

  await pool.query(
    `INSERT INTO ${AFFILIATE_PAYOUT_CHANGE_OTPS_TABLE}
      (otp_uuid, affiliate_profile_id, country_code, currency, payout_provider,
       target_bank_code, target_account_hash, target_account_masked, sent_to_email,
       otp_hash, status, attempts, max_attempts, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 5, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE), ?, ?)`,
    [
      `aotp_${crypto.randomUUID().replace(/-/g, "")}`,
      Number(profile.id),
      countryCode,
      currency,
      payoutProvider,
      bankCode,
      targetAccountHash,
      targetAccountMasked || null,
      accountEmail,
      codeHash,
      now,
      now,
    ]
  );

  const subject = "Verify payout account change";
  const html = [
    `<p>Hi ${clean(profile && profile.affiliate_code, 40) || "Affiliate"},</p>`,
    `<p>Use this code to verify your payout account change:</p>`,
    `<p style="font-size:24px;font-weight:700;letter-spacing:2px;">${code}</p>`,
    `<p>This code expires in 10 minutes.</p>`,
    `<p>Requested bank code: <strong>${bankCode}</strong><br/>Requested account: <strong>${targetAccountMasked || "******"}</strong></p>`,
    `<p>If you did not request this, ignore this email and secure your account.</p>`,
  ].join("");
  const text = [
    "Verify payout account change",
    `Code: ${code}`,
    "Expires in 10 minutes.",
    `Requested bank code: ${bankCode}`,
    `Requested account: ${targetAccountMasked || "******"}`,
  ].join("\n");
  await sendEmail({ to: accountEmail, subject, html, text });

  return {
    ok: true,
    otpRequired: true,
    emailMasked: maskEmailAddress(accountEmail),
    expiresInSeconds: 600,
  };
}

async function validateAffiliatePayoutChangeOtp(pool, input) {
  await ensureAffiliatePayoutOtpTable(pool);
  const profileId = Number(input && input.profileId || 0);
  const bankCode = clean(input && input.bankCode, 40);
  const accountNumber = clean(input && input.accountNumber, 40).replace(/\D/g, "");
  const otpCode = clean(input && input.otpCode, 12).replace(/\D/g, "");
  if (!Number.isFinite(profileId) || profileId <= 0) throw new Error("Invalid profile for OTP verification");
  if (!bankCode || !accountNumber || accountNumber.length < 10) throw new Error("Invalid payout account details for OTP verification");
  if (!otpCode || otpCode.length < 6) throw new Error("Enter the 6-digit verification code sent to your email");

  const targetHash = sha256(`acct:${accountNumber}`);
  const [rows] = await pool.query(
    `SELECT id, otp_hash, attempts, max_attempts, expires_at
     FROM ${AFFILIATE_PAYOUT_CHANGE_OTPS_TABLE}
     WHERE affiliate_profile_id = ?
       AND target_bank_code = ?
       AND target_account_hash = ?
       AND status IN ('pending', 'verified')
       AND expires_at > UTC_TIMESTAMP()
     ORDER BY id DESC
     LIMIT 1`,
    [profileId, bankCode, targetHash]
  );
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) {
    const [latestRows] = await pool.query(
      `SELECT id
       FROM ${AFFILIATE_PAYOUT_CHANGE_OTPS_TABLE}
       WHERE affiliate_profile_id = ?
         AND target_bank_code = ?
         AND target_account_hash = ?
         AND status IN ('pending', 'verified')
       ORDER BY id DESC
       LIMIT 1`,
      [profileId, bankCode, targetHash]
    );
    const latest = Array.isArray(latestRows) && latestRows.length ? latestRows[0] : null;
    if (latest && latest.id) {
      await pool.query(
        `UPDATE ${AFFILIATE_PAYOUT_CHANGE_OTPS_TABLE}
         SET status = 'expired', updated_at = ?
         WHERE id = ?
         LIMIT 1`,
        [nowSql(), Number(latest.id)]
      );
      throw new Error("Verification code expired. Request a new one.");
    }
    throw new Error("Request a new verification code to confirm this payout account change");
  }

  const expiresMs = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresMs)) {
    await pool.query(
      `UPDATE ${AFFILIATE_PAYOUT_CHANGE_OTPS_TABLE}
       SET status = 'expired', updated_at = ?
       WHERE id = ?
       LIMIT 1`,
      [nowSql(), Number(row.id)]
    );
    throw new Error("Verification code expired. Request a new one.");
  }

  const attempts = Number(row.attempts || 0);
  const maxAttempts = Math.max(1, Number(row.max_attempts || 5));
  const ok = otpCodeHash(otpCode) === clean(row.otp_hash, 128);
  if (!ok) {
    const nextAttempts = attempts + 1;
    const status = nextAttempts >= maxAttempts ? "expired" : "pending";
    await pool.query(
      `UPDATE ${AFFILIATE_PAYOUT_CHANGE_OTPS_TABLE}
       SET attempts = ?, status = ?, updated_at = ?
       WHERE id = ?
       LIMIT 1`,
      [nextAttempts, status, nowSql(), Number(row.id)]
    );
    if (nextAttempts >= maxAttempts) throw new Error("Verification code attempts exceeded. Request a new code.");
    throw new Error("Invalid verification code");
  }
  return { otpId: Number(row.id) };
}

async function consumeAffiliatePayoutChangeOtp(pool, otpId) {
  await ensureAffiliatePayoutOtpTable(pool);
  const id = Number(otpId);
  if (!Number.isFinite(id) || id <= 0) return;
  await pool.query(
    `UPDATE ${AFFILIATE_PAYOUT_CHANGE_OTPS_TABLE}
     SET status = 'used', verified_at = COALESCE(verified_at, ?), consumed_at = ?, updated_at = ?
     WHERE id = ?
       AND status IN ('pending', 'verified')
     LIMIT 1`,
    [nowSql(), nowSql(), nowSql(), id]
  );
}

async function saveAffiliatePayoutAccount(pool, input) {
  await ensureAffiliateTables(pool);

  const accountId = Number(input && input.accountId || 0);
  if (!Number.isFinite(accountId) || accountId <= 0) throw new Error("Invalid account id");

  const profile = await ensureAffiliateProfileForAccount(pool, accountId);
  if (!profile || String(profile.eligibility_status || "") !== "eligible") {
    throw new Error("Affiliate profile is not eligible");
  }

  const countryCode = clean(input && input.countryCode || profile.country_code || "NG", 2).toUpperCase() || "NG";
  const config = countryConfig(countryCode);
  if (!config.enabled) throw new Error("Affiliate payouts are not enabled for this country yet");

  const currency = clean(config.currency || input && input.currency || profile.payout_currency || "NGN", 10).toUpperCase();
  const payoutProvider = clean(config.payoutProvider || input && input.payoutProvider || profile.payout_provider || "paystack", 40).toLowerCase();

  let accountName = clean(input && input.accountName, 180);
  let bankCode = clean(input && input.bankCode, 40);
  let bankName = clean(input && input.bankName, 120);
  const accountNumber = clean(input && input.accountNumber, 40).replace(/\D/g, "");
  const otpCode = clean(input && input.otpCode, 12).replace(/\D/g, "");

  const existingAccount = await findActivePayoutAccountForProfile(pool, profile.id, countryCode, currency);
  const changingExistingAccount = isPayoutAccountChange(existingAccount, bankCode, accountNumber);
  let otpValidation = null;
  if (changingExistingAccount) {
    otpValidation = await validateAffiliatePayoutChangeOtp(pool, {
      profileId: Number(profile.id),
      bankCode,
      accountNumber,
      otpCode,
    });
  }

  let paystackRecipientCode = "";
  let verified = false;
  if (payoutProvider === "paystack") {
    if (countryCode !== "NG" || currency !== "NGN") {
      throw new Error("Paystack payouts are currently configured for NGN/Nigeria only");
    }
    const resolved = await resolveAffiliatePayoutAccount(pool, {
      countryCode,
      currency,
      payoutProvider,
      bankCode,
      accountNumber,
    });
    bankCode = clean(resolved && resolved.bankCode, 40);
    bankName = clean(resolved && resolved.bankName, 120) || bankName;
    accountName = clean(resolved && resolved.accountName, 180) || accountName;
    if (!accountName) throw new Error("Could not resolve account name from Paystack");

    const recipient = await paystackCreateTransferRecipient({
      type: "nuban",
      name: accountName,
      accountNumber,
      bankCode,
      currency,
    });
    paystackRecipientCode = clean(recipient && recipient.recipientCode, 120);
    verified = !!paystackRecipientCode;
  }

  const now = nowSql();
  await pool.query(
    `INSERT INTO ${AFFILIATE_PAYOUT_ACCOUNTS_TABLE}
      (account_uuid, affiliate_profile_id, country_code, currency, payout_provider,
       account_name, bank_code, bank_name, account_number_masked, account_number_hash,
       paystack_recipient_code, payout_email, status, is_verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       payout_provider = VALUES(payout_provider),
       account_name = VALUES(account_name),
       bank_code = VALUES(bank_code),
       bank_name = VALUES(bank_name),
       account_number_masked = VALUES(account_number_masked),
       account_number_hash = VALUES(account_number_hash),
       paystack_recipient_code = VALUES(paystack_recipient_code),
       payout_email = VALUES(payout_email),
       status = 'active',
       is_verified = VALUES(is_verified),
       updated_at = VALUES(updated_at)`,
    [
      `apa_${crypto.randomUUID().replace(/-/g, "")}`,
      Number(profile.id),
      countryCode,
      currency,
      payoutProvider,
      accountName || null,
      bankCode || null,
      bankName || null,
      accountNumber ? `${accountNumber.slice(0, 2)}******${accountNumber.slice(-2)}` : null,
      accountNumber ? sha256(`acct:${accountNumber}`) : null,
      paystackRecipientCode || null,
      normalizeEmail(input && input.payoutEmail) || null,
      boolToInt(verified),
      now,
      now,
    ]
  );

  if (otpValidation && otpValidation.otpId) {
    await consumeAffiliatePayoutChangeOtp(pool, otpValidation.otpId);
  }

  await pool.query(
    `UPDATE ${AFFILIATE_PROFILES_TABLE}
     SET country_code = ?, payout_currency = ?, payout_provider = ?, updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [countryCode, currency, payoutProvider, nowSql(), Number(profile.id)]
  );

  return {
    ok: true,
    countryCode,
    currency,
    payoutProvider,
    bankCode: bankCode || null,
    bankName: bankName || null,
    resolvedAccountName: accountName || null,
    verified,
  };
}

function parseDateInput(value) {
  const raw = clean(value, 30);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw} 00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw)) return raw.replace("T", " ");
  return "";
}

function previousMonthPeriod(nowDate) {
  const d = nowDate instanceof Date ? nowDate : new Date();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  return {
    periodStart: start.toISOString().slice(0, 19).replace("T", " "),
    periodEnd: end.toISOString().slice(0, 19).replace("T", " "),
  };
}

async function runAffiliatePayoutBatch(pool, input) {
  await ensureAffiliateTables(pool);

  await matureAffiliateCommissions(pool);

  const mode = clean(input && input.periodMode, 40).toLowerCase();
  const inferred = previousMonthPeriod(new Date());
  const periodStart = parseDateInput(input && input.periodStart) || (mode === "month_end" ? inferred.periodStart : "");
  const periodEnd = parseDateInput(input && input.periodEnd) || (mode === "month_end" ? inferred.periodEnd : "");
  if (!periodStart || !periodEnd) throw new Error("periodStart and periodEnd are required (or set periodMode=month_end)");

  const countryCode = clean(input && input.countryCode || "NG", 2).toUpperCase() || "NG";
  const config = countryConfig(countryCode);
  if (!config.enabled) throw new Error("Country payouts not enabled");

  const currency = clean(input && input.currency || config.currency || "NGN", 10).toUpperCase();
  const payoutProvider = clean(input && input.payoutProvider || config.payoutProvider || "manual", 40).toLowerCase();
  const initiatedBy = clean(input && input.initiatedBy || "admin", 120) || "admin";
  const scheduledFor = clean(input && input.scheduledFor, 10);

  const [candidateRows] = await pool.query(
    `SELECT c.id AS commission_id,
            c.commission_uuid,
            c.affiliate_profile_id,
            c.currency,
            c.commission_amount_minor,
            c.order_uuid,
            pa.id AS payout_account_id,
            pa.payout_provider,
            pa.paystack_recipient_code,
            pa.is_verified
     FROM ${AFFILIATE_COMMISSIONS_TABLE} c
     JOIN ${AFFILIATE_PROFILES_TABLE} p ON p.id = c.affiliate_profile_id
     LEFT JOIN ${AFFILIATE_PAYOUT_ACCOUNTS_TABLE} pa
       ON pa.affiliate_profile_id = c.affiliate_profile_id
      AND pa.currency = c.currency
      AND pa.country_code = p.country_code
      AND pa.status = 'active'
     WHERE c.status = 'approved'
       AND c.currency = ?
       AND p.country_code = ?
       AND c.paid_at IS NULL
       AND c.created_at >= ?
       AND c.created_at <= ?
     ORDER BY c.id ASC`,
    [currency, countryCode, periodStart, periodEnd]
  );

  const candidates = Array.isArray(candidateRows) ? candidateRows : [];
  const minMinor = minPayoutMinor(currency);

  const sumsByAffiliate = new Map();
  candidates.forEach(function (row) {
    const profileId = Number(row.affiliate_profile_id || 0);
    if (!profileId) return;
    const current = sumsByAffiliate.get(profileId) || 0;
    sumsByAffiliate.set(profileId, current + toMinor(row.commission_amount_minor));
  });

  const filtered = candidates.filter(function (row) {
    const profileId = Number(row.affiliate_profile_id || 0);
    const total = Number(sumsByAffiliate.get(profileId) || 0);
    if (total < minMinor) return false;
    if (payoutProvider === "paystack") {
      return clean(row.paystack_recipient_code, 120) && Number(row.is_verified || 0) === 1;
    }
    return true;
  });

  if (!filtered.length) {
    return {
      ok: true,
      empty: true,
      periodStart,
      periodEnd,
      countryCode,
      currency,
      payoutProvider,
      candidateCount: candidates.length,
      paidCount: 0,
      failedCount: 0,
      totalAmountMinor: 0,
    };
  }

  const now = nowSql();
  const [batchRes] = await pool.query(
    `INSERT INTO ${AFFILIATE_PAYOUT_BATCHES_TABLE}
      (batch_uuid, country_code, currency, payout_provider, period_start, period_end,
       scheduled_for, status, total_items, total_amount_minor, initiated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', 0, 0, ?, ?, ?)`,
    [
      `apb_${crypto.randomUUID().replace(/-/g, "")}`,
      countryCode,
      currency,
      payoutProvider,
      periodStart,
      periodEnd,
      scheduledFor || null,
      initiatedBy,
      now,
      now,
    ]
  );
  const payoutBatchId = Number(batchRes && batchRes.insertId || 0);
  if (!payoutBatchId) throw new Error("Could not create payout batch");

  let totalAmountMinor = 0;
  let successCount = 0;
  let failedCount = 0;

  for (const row of filtered) {
    const commissionId = Number(row.commission_id || 0);
    const amountMinor = toMinor(row.commission_amount_minor);
    if (!commissionId || amountMinor <= 0) continue;

    const [itemRes] = await pool.query(
      `INSERT INTO ${AFFILIATE_PAYOUT_ITEMS_TABLE}
        (item_uuid, payout_batch_id, commission_id, affiliate_profile_id, payout_account_id,
         amount_minor, currency, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?)`,
      [
        `api_${crypto.randomUUID().replace(/-/g, "")}`,
        payoutBatchId,
        commissionId,
        Number(row.affiliate_profile_id),
        Number(row.payout_account_id || 0) || null,
        amountMinor,
        currency,
        nowSql(),
        nowSql(),
      ]
    );
    const payoutItemId = Number(itemRes && itemRes.insertId || 0);

    let itemStatus = "failed";
    let providerTransferId = "";
    let providerTransferCode = "";
    let providerReference = "";
    let errorMessage = "";

    try {
      if (payoutProvider === "paystack") {
        const transfer = await paystackCreateTransfer({
          source: "balance",
          amountMinor,
          recipient: clean(row.paystack_recipient_code, 120),
          reason: `Affiliate payout for ${clean(row.order_uuid, 64)}`,
          reference: `aff_${clean(row.order_uuid, 64)}_${Date.now()}`,
        });
        providerTransferId = transfer && transfer.transferId ? String(transfer.transferId) : "";
        providerTransferCode = transfer && transfer.transferCode ? String(transfer.transferCode) : "";
        providerReference = transfer && transfer.reference ? String(transfer.reference) : "";
        itemStatus = "paid";
      } else {
        itemStatus = "failed";
        errorMessage = "Unsupported payout provider for automatic transfer";
      }
    } catch (error) {
      itemStatus = "failed";
      errorMessage = clean(error && error.message || "Payout failed", 255);
    }

    await pool.query(
      `UPDATE ${AFFILIATE_PAYOUT_ITEMS_TABLE}
       SET status = ?, provider_transfer_id = ?, provider_transfer_code = ?, provider_reference = ?,
           error_message = ?, processed_at = ?, updated_at = ?
       WHERE id = ?
       LIMIT 1`,
      [
        itemStatus,
        providerTransferId || null,
        providerTransferCode || null,
        providerReference || null,
        errorMessage || null,
        nowSql(),
        nowSql(),
        payoutItemId,
      ]
    );

    if (itemStatus === "paid") {
      await pool.query(
        `UPDATE ${AFFILIATE_COMMISSIONS_TABLE}
         SET status = 'paid',
             paid_at = ?,
             payout_batch_id = ?,
             payout_item_id = ?,
             updated_at = ?
         WHERE id = ?
         LIMIT 1`,
        [nowSql(), payoutBatchId, payoutItemId, nowSql(), commissionId]
      );
      totalAmountMinor += amountMinor;
      successCount += 1;
    } else {
      await pool.query(
        `UPDATE ${AFFILIATE_COMMISSIONS_TABLE}
         SET status = 'approved',
             payout_batch_id = ?,
             payout_item_id = ?,
             updated_at = ?
         WHERE id = ?
         LIMIT 1`,
        [payoutBatchId, payoutItemId, nowSql(), commissionId]
      );
      failedCount += 1;
    }
  }

  await pool.query(
    `UPDATE ${AFFILIATE_PAYOUT_BATCHES_TABLE}
     SET total_items = ?,
         total_amount_minor = ?,
         successful_items = ?,
         failed_items = ?,
         status = ?,
         completed_at = ?,
         updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [
      successCount + failedCount,
      totalAmountMinor,
      successCount,
      failedCount,
      failedCount > 0 ? "completed_with_errors" : "completed",
      nowSql(),
      nowSql(),
      payoutBatchId,
    ]
  );

  return {
    ok: true,
    empty: false,
    payoutBatchId,
    periodStart,
    periodEnd,
    countryCode,
    currency,
    payoutProvider,
    candidateCount: candidates.length,
    paidCount: successCount,
    failedCount,
    totalAmountMinor,
  };
}

async function listAffiliateCourseRules(pool) {
  await ensureAffiliateTables(pool);
  const [rows] = await pool.query(
    `SELECT id, course_slug, is_affiliate_eligible, commission_type, commission_value, commission_currency,
            min_order_amount_minor, hold_days, starts_at, ends_at, updated_by, created_at, updated_at
     FROM ${AFFILIATE_COURSE_RULES_TABLE}
     ORDER BY course_slug ASC`
  );
  return Array.isArray(rows) ? rows : [];
}

async function upsertAffiliateCourseRule(pool, input) {
  await ensureAffiliateTables(pool);
  const courseSlug = normalizeCourse(input && input.courseSlug);
  if (!courseSlug) throw new Error("courseSlug is required");

  const commissionType = clean(input && input.commissionType || "percentage", 20).toLowerCase();
  if (commissionType !== "percentage" && commissionType !== "fixed") {
    throw new Error("commissionType must be percentage or fixed");
  }

  const commissionValue = toInt(input && input.commissionValue, 0);
  if (commissionType === "percentage" && (commissionValue < 0 || commissionValue > 10000)) {
    throw new Error("percentage commissionValue must be in basis points (0..10000)");
  }
  if (commissionType === "fixed" && commissionValue < 0) {
    throw new Error("fixed commissionValue cannot be negative");
  }

  const minOrderAmountMinor = toMinor(input && input.minOrderAmountMinor);
  const holdDays = Math.max(0, Math.min(120, toInt(input && input.holdDays, defaultHoldDays())));
  const now = nowSql();

  await pool.query(
    `INSERT INTO ${AFFILIATE_COURSE_RULES_TABLE}
      (course_slug, is_affiliate_eligible, commission_type, commission_value, commission_currency,
       min_order_amount_minor, hold_days, starts_at, ends_at, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       is_affiliate_eligible = VALUES(is_affiliate_eligible),
       commission_type = VALUES(commission_type),
       commission_value = VALUES(commission_value),
       commission_currency = VALUES(commission_currency),
       min_order_amount_minor = VALUES(min_order_amount_minor),
       hold_days = VALUES(hold_days),
       starts_at = VALUES(starts_at),
       ends_at = VALUES(ends_at),
       updated_by = VALUES(updated_by),
       updated_at = VALUES(updated_at)`,
    [
      courseSlug,
      boolToInt(input && input.isAffiliateEligible),
      commissionType,
      commissionValue,
      clean(input && input.commissionCurrency || "NGN", 10).toUpperCase(),
      minOrderAmountMinor,
      holdDays,
      parseDateInput(input && input.startsAt) || null,
      parseDateInput(input && input.endsAt) || null,
      clean(input && input.updatedBy || "admin", 120) || "admin",
      now,
      now,
    ]
  );

  const [rows] = await pool.query(
    `SELECT id, course_slug, is_affiliate_eligible, commission_type, commission_value, commission_currency,
            min_order_amount_minor, hold_days, starts_at, ends_at, updated_by, created_at, updated_at
     FROM ${AFFILIATE_COURSE_RULES_TABLE}
     WHERE course_slug = ?
     LIMIT 1`,
    [courseSlug]
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getAffiliateDashboard(pool, accountId) {
  await ensureAffiliateTables(pool);
  const profile = await ensureAffiliateProfileForAccount(pool, accountId);
  const profileId = Number(profile && profile.id || 0);
  if (!profileId) throw new Error("Could not load affiliate profile");

  const [sumRows] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount_minor ELSE 0 END), 0) AS pending_minor,
       COALESCE(SUM(CASE WHEN status = 'approved' THEN commission_amount_minor ELSE 0 END), 0) AS approved_minor,
       COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount_minor ELSE 0 END), 0) AS paid_minor,
       COALESCE(SUM(CASE WHEN status IN ('blocked','reversed') THEN commission_amount_minor ELSE 0 END), 0) AS blocked_minor,
       COUNT(*) AS total_count
     FROM ${AFFILIATE_COMMISSIONS_TABLE}
     WHERE affiliate_profile_id = ?`,
    [profileId]
  );

  const [refRows] = await pool.query(
    `SELECT c.order_uuid, c.course_slug, c.buyer_email, c.currency,
            c.order_amount_minor, c.commission_amount_minor, c.status, c.created_at
     FROM ${AFFILIATE_COMMISSIONS_TABLE} c
     WHERE c.affiliate_profile_id = ?
     ORDER BY c.id DESC
     LIMIT 100`,
    [profileId]
  );

  const [payoutRows] = await pool.query(
    `SELECT b.batch_uuid, b.period_start, b.period_end, b.currency,
            b.total_items, b.total_amount_minor, b.status, b.created_at, b.completed_at
     FROM ${AFFILIATE_PAYOUT_BATCHES_TABLE} b
     JOIN ${AFFILIATE_PAYOUT_ITEMS_TABLE} i ON i.payout_batch_id = b.id
     WHERE i.affiliate_profile_id = ?
     GROUP BY b.id
     ORDER BY b.id DESC
     LIMIT 30`,
    [profileId]
  );

  const [payoutAccountRows] = await pool.query(
    `SELECT country_code, currency, payout_provider, account_name, bank_code, bank_name, account_number_masked, is_verified
     FROM ${AFFILIATE_PAYOUT_ACCOUNTS_TABLE}
     WHERE affiliate_profile_id = ?
       AND status = 'active'
     ORDER BY id DESC
     LIMIT 1`,
    [profileId]
  );
  const payoutAccount = Array.isArray(payoutAccountRows) && payoutAccountRows.length ? payoutAccountRows[0] : null;

  const [ruleRows] = await pool.query(
    `SELECT course_slug, commission_type, commission_value, commission_currency, min_order_amount_minor, hold_days
     FROM ${AFFILIATE_COURSE_RULES_TABLE}
     WHERE is_affiliate_eligible = 1
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (ends_at IS NULL OR ends_at >= NOW())
     ORDER BY course_slug ASC`
  );

  const baseUrl = affiliateBaseUrl();
  const link = baseUrl ? `${baseUrl}/courses/?ref=${encodeURIComponent(clean(profile.affiliate_code, 40))}` : `/?ref=${encodeURIComponent(clean(profile.affiliate_code, 40))}`;
  const payoutCurrency = clean(profile.payout_currency, 10) || "NGN";
  const minPayout = minPayoutMinor(payoutCurrency);
  const defaultHold = defaultHoldDays();
  const schoolMinSeats = schoolsMinSeats();
  const schoolPricePerStudent = schoolsPricePerStudentMinor();

  return {
    profile: {
      profileUuid: clean(profile.profile_uuid, 64),
      affiliateCode: clean(profile.affiliate_code, 40),
      status: clean(profile.status, 30),
      eligibilityStatus: clean(profile.eligibility_status, 40),
      eligibilityReason: clean(profile.eligibility_reason, 190) || null,
      countryCode: clean(profile.country_code, 2),
      payoutCurrency: clean(profile.payout_currency, 10),
      payoutProvider: clean(profile.payout_provider, 40),
      affiliateLink: link,
      payoutAccount: payoutAccount ? {
        countryCode: clean(payoutAccount.country_code, 2),
        currency: clean(payoutAccount.currency, 10),
        payoutProvider: clean(payoutAccount.payout_provider, 40),
        accountName: clean(payoutAccount.account_name, 180),
        bankCode: clean(payoutAccount.bank_code, 40),
        bankName: clean(payoutAccount.bank_name, 120),
        accountNumberMasked: clean(payoutAccount.account_number_masked, 60),
        isVerified: Number(payoutAccount.is_verified || 0) === 1,
      } : null,
    },
    policy: {
      defaultHoldDays: defaultHold,
      minPayoutMinor: minPayout,
      payoutCurrency: payoutCurrency,
      antiAbuseSummary: "Self-referrals, duplicate/fake onboarding, suspicious patterns, and policy violations are blocked and may lead to withheld/reversed commissions.",
      schoolReferralNote: "School referrals remain tied to your affiliate profile, so you continue earning on each new student onboarded by that school while the rule stays active.",
      schoolProgram: {
        courseSlug: "prompt-to-profit-schools",
        minSeats: schoolMinSeats,
        pricePerStudentMinor: schoolPricePerStudent,
      },
    },
    earnings: {
      pendingMinor: Number(sumRows && sumRows[0] && sumRows[0].pending_minor || 0),
      approvedMinor: Number(sumRows && sumRows[0] && sumRows[0].approved_minor || 0),
      paidMinor: Number(sumRows && sumRows[0] && sumRows[0].paid_minor || 0),
      blockedMinor: Number(sumRows && sumRows[0] && sumRows[0].blocked_minor || 0),
      totalCount: Number(sumRows && sumRows[0] && sumRows[0].total_count || 0),
    },
    referrals: (Array.isArray(refRows) ? refRows : []).map(function (row) {
      return {
        orderUuid: clean(row.order_uuid, 64),
        courseSlug: clean(row.course_slug, 120),
        buyerEmailMasked: clean(row.buyer_email, 220).replace(/(^.).*(@.*$)/, "$1***$2"),
        currency: clean(row.currency, 10),
        orderAmountMinor: Number(row.order_amount_minor || 0),
        commissionAmountMinor: Number(row.commission_amount_minor || 0),
        status: clean(row.status, 30),
        createdAt: row.created_at || null,
      };
    }),
    payouts: (Array.isArray(payoutRows) ? payoutRows : []).map(function (row) {
      return {
        batchUuid: clean(row.batch_uuid, 64),
        periodStart: row.period_start || null,
        periodEnd: row.period_end || null,
        currency: clean(row.currency, 10),
        totalItems: Number(row.total_items || 0),
        totalAmountMinor: Number(row.total_amount_minor || 0),
        status: clean(row.status, 30),
        createdAt: row.created_at || null,
        completedAt: row.completed_at || null,
      };
    }),
    eligibleCourses: (Array.isArray(ruleRows) ? ruleRows : []).map(function (row) {
      const slug = clean(row.course_slug, 120);
      const commissionType = clean(row.commission_type, 20).toLowerCase();
      const commissionValue = toInt(row.commission_value, 0);
      const minOrderAmountMinor = toMinor(row.min_order_amount_minor);
      let projectedMinCommissionMinor = 0;
      if (slug === "prompt-to-profit-schools") {
        if (commissionType === "fixed") {
          projectedMinCommissionMinor = Math.max(0, commissionValue * schoolMinSeats);
        } else if (commissionType === "percentage") {
          projectedMinCommissionMinor = Math.max(0, Math.floor((minOrderAmountMinor * Math.max(0, Math.min(commissionValue, 10000))) / 10000));
        }
      }
      return {
        courseSlug: slug,
        commissionType: commissionType,
        commissionValue: commissionValue,
        commissionCurrency: clean(row.commission_currency, 10).toUpperCase() || "NGN",
        minOrderAmountMinor: minOrderAmountMinor,
        holdDays: Math.max(0, toInt(row.hold_days, defaultHold)),
        projectedMinCommissionMinor: projectedMinCommissionMinor,
        projectedMinSeats: slug === "prompt-to-profit-schools" ? schoolMinSeats : 0,
      };
    }),
  };
}

module.exports = {
  AFFILIATE_PROFILES_TABLE,
  AFFILIATE_COURSE_RULES_TABLE,
  AFFILIATE_ATTRIBUTIONS_TABLE,
  AFFILIATE_COMMISSIONS_TABLE,
  AFFILIATE_PAYOUT_ACCOUNTS_TABLE,
  AFFILIATE_PAYOUT_BATCHES_TABLE,
  AFFILIATE_PAYOUT_ITEMS_TABLE,
  AFFILIATE_AUDIT_TABLE,
  AFFILIATE_SCHOOL_REFERRALS_TABLE,
  ensureAffiliateTables,
  resolveEligibleAffiliateByCode,
  ensureAffiliateProfileForAccount,
  recordAffiliateAttribution,
  captureSchoolOrderReferral,
  bindSchoolReferralAfterPayment,
  createAffiliateCommissionForPaidOrder,
  createAffiliateCommissionForSchoolStudentOnboard,
  matureAffiliateCommissions,
  saveAffiliatePayoutAccount,
  runAffiliatePayoutBatch,
  listAffiliateCourseRules,
  upsertAffiliateCourseRule,
  listAffiliatePayoutBanks,
  sendAffiliatePayoutChangeOtp,
  resolveAffiliatePayoutAccount,
  getAffiliateDashboard,
};
