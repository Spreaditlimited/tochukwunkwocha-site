const crypto = require("crypto");
const { json } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { sendEmail } = require("./_lib/email");
const { getRegistrationPrice } = require("./_lib/domain-client");
const { buildDomainCheckoutQuote } = require("./_lib/domain-pricing");
const { paystackInitialize, siteBaseUrl } = require("./_lib/payments");
const { ensureStudentAuthTables } = require("./_lib/student-auth");
const { ensureDomainTables, createDomainRenewalCheckout, normalizeDomain } = require("./_lib/domains");

const NOTICE_TABLE = "tochukwu_domain_renewal_notifications";

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 220);
}

function toDate(value) {
  const raw = clean(value, 40);
  if (!raw) return null;
  const date = new Date(raw.replace(" ", "T") + "Z");
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeInt(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const safe = Math.floor(n);
  if (Number.isFinite(min) && safe < min) return min;
  if (Number.isFinite(max) && safe > max) return max;
  return safe;
}

function reminderStage(dueAt, now) {
  const dueMs = Number(dueAt && dueAt.getTime ? dueAt.getTime() : NaN);
  const nowMs = Number(now && now.getTime ? now.getTime() : NaN);
  if (!Number.isFinite(dueMs) || !Number.isFinite(nowMs)) return "30d";
  const daysLeft = Math.floor((dueMs - nowMs) / (24 * 60 * 60 * 1000));
  if (daysLeft <= 0) return "overdue";
  if (daysLeft <= 1) return "24h";
  if (daysLeft <= 7) return "7d";
  return "30d";
}

function money(currency, amountMinor) {
  const code = clean(currency, 16).toUpperCase() || "NGN";
  const amount = Number(amountMinor || 0) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return "";
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: code }).format(amount);
  } catch (_error) {
    return `${code} ${amount.toFixed(2)}`;
  }
}

function renewalEmail(payload) {
  const fullName = clean(payload && payload.fullName, 180) || "there";
  const domainName = clean(payload && payload.domainName, 190).toLowerCase();
  const dueAt = clean(payload && payload.renewalDueAt, 40);
  const checkoutUrl = clean(payload && payload.checkoutUrl, 1000);
  const amountText = money(payload && payload.currency, payload && payload.amountMinor);
  const dashboardUrl = `${siteBaseUrl()}/dashboard/domains/`;
  const subject = `Domain Renewal Payment Link: ${domainName}`;

  const html = [
    `<p>Hello ${fullName},</p>`,
    `<p>Your domain <strong>${domainName}</strong> is due for renewal${dueAt ? ` on <strong>${dueAt}</strong>` : ""}.</p>`,
    `<p>This renewal is <strong>not auto-charged</strong>. Please use your payment link below:</p>`,
    `<p><a href="${checkoutUrl}">Pay Now${amountText ? ` (${amountText})` : ""}</a></p>`,
    `<p>If the link expires, go to your dashboard and click <strong>Renew (1 year)</strong> to generate a new one:</p>`,
    `<p><a href="${dashboardUrl}">${dashboardUrl}</a></p>`,
  ].join("\n");

  const text = [
    `Hello ${fullName},`,
    "",
    `Your domain ${domainName} is due for renewal${dueAt ? ` on ${dueAt}` : ""}.`,
    "This renewal is not auto-charged.",
    `Pay here: ${checkoutUrl}${amountText ? ` (${amountText})` : ""}`,
    "",
    "If the link expires, open your dashboard and click Renew (1 year):",
    dashboardUrl,
  ].join("\n");

  return { subject, html, text };
}

async function ensureNoticeTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${NOTICE_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      account_id BIGINT NOT NULL,
      email VARCHAR(190) NOT NULL,
      domain_name VARCHAR(190) NOT NULL,
      renewal_due_at DATETIME NOT NULL,
      stage VARCHAR(16) NOT NULL,
      years INT NOT NULL DEFAULT 1,
      amount_minor BIGINT NULL,
      currency VARCHAR(16) NULL,
      renewal_uuid VARCHAR(72) NULL,
      payment_reference VARCHAR(120) NULL,
      checkout_url TEXT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      sent_at DATETIME NULL,
      error_message VARCHAR(500) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_domain_renew_notice (account_id, domain_name, renewal_due_at, stage),
      KEY idx_domain_renew_notice_status (status, updated_at),
      KEY idx_domain_renew_notice_account (account_id, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function listDueDomains(pool, opts) {
  const leadDays = normalizeInt(opts && opts.leadDays, 30, 1, 90);
  const lookbackDays = normalizeInt(opts && opts.lookbackDays, 3, 0, 30);
  const limit = normalizeInt(opts && opts.limit, 50, 1, 300);
  const [rows] = await pool.query(
    `SELECT ud.account_id,
            ud.email,
            ud.domain_name,
            ud.years,
            ud.auto_renew_enabled,
            DATE_FORMAT(ud.renewal_due_at, '%Y-%m-%d %H:%i:%s') AS renewal_due_at,
            sa.full_name,
            sa.domains_auto_renew_enabled
     FROM user_domains ud
     JOIN student_accounts sa ON sa.id = ud.account_id
     WHERE ud.status = 'registered'
       AND ud.auto_renew_enabled = 1
       AND sa.domains_auto_renew_enabled = 1
       AND ud.renewal_due_at IS NOT NULL
       AND ud.renewal_due_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY)
       AND ud.renewal_due_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
     ORDER BY ud.renewal_due_at ASC
     LIMIT ?`,
    [leadDays, lookbackDays, limit]
  );
  return Array.isArray(rows) ? rows : [];
}

async function getExistingNotice(pool, row, stage) {
  const [rows] = await pool.query(
    `SELECT id, status, attempts, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM ${NOTICE_TABLE}
     WHERE account_id = ?
       AND domain_name = ?
       AND renewal_due_at = ?
       AND stage = ?
     LIMIT 1`,
    [Number(row.account_id), clean(row.domain_name, 190).toLowerCase(), clean(row.renewal_due_at, 40), clean(stage, 16)]
  );
  return rows && rows.length ? rows[0] : null;
}

async function upsertNoticePending(pool, payload) {
  const now = nowSql();
  await pool.query(
    `INSERT INTO ${NOTICE_TABLE}
      (account_id, email, domain_name, renewal_due_at, stage, years, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?)
     ON DUPLICATE KEY UPDATE
      email = VALUES(email),
      years = VALUES(years),
      status = 'pending',
      attempts = attempts + 1,
      updated_at = VALUES(updated_at)`,
    [
      Number(payload.accountId),
      clean(payload.email, 190).toLowerCase(),
      clean(payload.domainName, 190).toLowerCase(),
      clean(payload.renewalDueAt, 40),
      clean(payload.stage, 16),
      Number(payload.years || 1),
      now,
      now,
    ]
  );
}

async function markNoticeSent(pool, payload) {
  const now = nowSql();
  await pool.query(
    `UPDATE ${NOTICE_TABLE}
     SET status = 'sent',
         amount_minor = ?,
         currency = ?,
         renewal_uuid = ?,
         payment_reference = ?,
         checkout_url = ?,
         sent_at = ?,
         error_message = NULL,
         updated_at = ?
     WHERE account_id = ?
       AND domain_name = ?
       AND renewal_due_at = ?
       AND stage = ?
     LIMIT 1`,
    [
      Number(payload.amountMinor || 0) || null,
      clean(payload.currency, 16).toUpperCase() || null,
      clean(payload.renewalUuid, 72) || null,
      clean(payload.paymentReference, 120) || null,
      clean(payload.checkoutUrl, 4000) || null,
      now,
      now,
      Number(payload.accountId),
      clean(payload.domainName, 190).toLowerCase(),
      clean(payload.renewalDueAt, 40),
      clean(payload.stage, 16),
    ]
  );
}

async function markNoticeFailed(pool, payload) {
  const now = nowSql();
  await pool.query(
    `UPDATE ${NOTICE_TABLE}
     SET status = 'failed',
         error_message = ?,
         updated_at = ?
     WHERE account_id = ?
       AND domain_name = ?
       AND renewal_due_at = ?
       AND stage = ?
     LIMIT 1`,
    [
      clean(payload.errorMessage, 500) || "unknown_error",
      now,
      Number(payload.accountId),
      clean(payload.domainName, 190).toLowerCase(),
      clean(payload.renewalDueAt, 40),
      clean(payload.stage, 16),
    ]
  );
}

exports.handler = async function () {
  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureDomainTables(pool);
    await ensureNoticeTable(pool);

    const leadDays = normalizeInt(process.env.DOMAIN_RENEWAL_NOTIFY_LEAD_DAYS, 30, 1, 90);
    const lookbackDays = normalizeInt(process.env.DOMAIN_RENEWAL_NOTIFY_LOOKBACK_DAYS, 3, 0, 30);
    const batchLimit = normalizeInt(process.env.DOMAIN_RENEWAL_NOTIFY_BATCH_LIMIT, 50, 1, 300);
    const rows = await listDueDomains(pool, { leadDays, lookbackDays, limit: batchLimit });

    let considered = 0;
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] || {};
      considered += 1;
      const accountId = Number(row.account_id || 0);
      const email = clean(row.email, 190).toLowerCase();
      const domainName = normalizeDomain(row.domain_name);
      const dueAtSql = clean(row.renewal_due_at, 40);
      const dueAtDate = toDate(dueAtSql);
      const fullName = clean(row.full_name, 180) || "there";
      const years = 1;
      const stage = reminderStage(dueAtDate, new Date());

      if (!accountId || !email || !domainName || !dueAtSql) {
        skipped += 1;
        continue;
      }

      const existing = await getExistingNotice(pool, row, stage);
      if (existing && String(existing.status || "").toLowerCase() === "sent") {
        skipped += 1;
        continue;
      }
      if (existing && String(existing.status || "").toLowerCase() === "pending") {
        const lastUpdate = toDate(existing.updated_at);
        const ageMs = lastUpdate ? Date.now() - lastUpdate.getTime() : 0;
        if (ageMs > 0 && ageMs < 2 * 60 * 60 * 1000) {
          skipped += 1;
          continue;
        }
      }

      await upsertNoticePending(pool, {
        accountId,
        email,
        domainName,
        renewalDueAt: dueAtSql,
        stage,
        years,
      });

      try {
        const pricing = await getRegistrationPrice({ domainName, years });
        const quote = buildDomainCheckoutQuote({
          basePricing: pricing,
          years,
          selectedServices: [],
          servicePrices: {},
        });

        const reference = `DRN_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
        const renewalUuid = await createDomainRenewalCheckout(pool, {
          accountId,
          email,
          domainName,
          years,
          paymentProvider: "paystack",
          paymentReference: reference,
          paymentCurrency: quote.currency,
          paymentAmountMinor: quote.totalAmountMinor,
          autoRenewEnabled: true,
        });

        const payment = await paystackInitialize({
          email,
          amountMinor: quote.totalAmountMinor,
          reference,
          callbackUrl: `${siteBaseUrl()}/.netlify/functions/domain-renew-paystack-return`,
          metadata: {
            domain_renewal_uuid: renewalUuid,
            domain_name: domainName,
            years,
            email,
          },
        });

        const checkoutUrl = clean(payment && payment.checkoutUrl, 1000);
        if (!checkoutUrl) throw new Error("Missing renewal checkout URL");

        const mail = renewalEmail({
          fullName,
          domainName,
          renewalDueAt: dueAtSql,
          checkoutUrl,
          currency: quote.currency,
          amountMinor: quote.totalAmountMinor,
        });

        await sendEmail({
          to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });

        await markNoticeSent(pool, {
          accountId,
          domainName,
          renewalDueAt: dueAtSql,
          stage,
          amountMinor: quote.totalAmountMinor,
          currency: quote.currency,
          renewalUuid,
          paymentReference: reference,
          checkoutUrl,
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        await markNoticeFailed(pool, {
          accountId,
          domainName,
          renewalDueAt: dueAtSql,
          stage,
          errorMessage: error && error.message ? String(error.message) : "unknown_error",
        });
      }
    }

    return json(200, {
      ok: true,
      considered,
      sent,
      skipped,
      failed,
      lead_days: leadDays,
      lookback_days: lookbackDays,
      batch_limit: batchLimit,
    });
  } catch (error) {
    console.error("[domain-renewal-notify-cron] failed", {
      error: error && error.message ? error.message : String(error || "unknown error"),
    });
    return json(500, { ok: false, error: error.message || "Could not process renewal notifications." });
  }
};

