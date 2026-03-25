const crypto = require("crypto");
const { nowSql } = require("./db");
const { applyRuntimeSettings } = require("./runtime-settings");

const STATUS_DETAILS_PENDING = "details_pending";
const STATUS_DETAILS_COMPLETE = "details_complete";
const STATUS_COPY_GENERATED = "copy_generated";
const STATUS_PAGE_BUILT = "page_built";
const STATUS_QA_PASSED = "qa_passed";
const STATUS_DELIVERED = "delivered";

const VALID_STATUSES = new Set([
  STATUS_DETAILS_PENDING,
  STATUS_DETAILS_COMPLETE,
  STATUS_COPY_GENERATED,
  STATUS_PAGE_BUILT,
  STATUS_QA_PASSED,
  STATUS_DELIVERED,
]);

function buildLeadpageJobUuid() {
  return `lp_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildClientAccessToken() {
  return `lpa_${crypto.randomBytes(24).toString("hex")}`;
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function positiveInt(input, fallback) {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return Number(fallback) || 1;
  return Math.floor(n);
}

function normalizeStatus(input) {
  const status = clean(input, 64).toLowerCase();
  if (!VALID_STATUSES.has(status)) return "";
  return status;
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (error) {
    if (error && (error.code === "ER_DUP_FIELDNAME" || error.code === "ER_DUP_KEYNAME")) return;
    throw error;
  }
}

async function ensureLeadpageTables(pool) {
  await applyRuntimeSettings(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leadpage_jobs (
      id BIGINT NOT NULL AUTO_INCREMENT,
      job_uuid VARCHAR(72) NOT NULL,
      full_name VARCHAR(180) NOT NULL,
      email VARCHAR(190) NOT NULL,
      phone VARCHAR(64) NOT NULL,
      business_name VARCHAR(220) NOT NULL,
      business_type VARCHAR(160) NULL,
      service_offer VARCHAR(280) NOT NULL,
      target_location VARCHAR(180) NULL,
      primary_goal VARCHAR(320) NULL,
      cta_text VARCHAR(180) NULL,
      tone VARCHAR(80) NULL,
      facebook_pixel_id VARCHAR(120) NULL,
      google_tag_id VARCHAR(120) NULL,
      domain_status VARCHAR(80) NULL,
      domain_name VARCHAR(190) NULL,
      hostinger_email VARCHAR(190) NULL,
      notes TEXT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'details_pending',
      build_url TEXT NULL,
      delivery_url TEXT NULL,
      copy_json LONGTEXT NULL,
      source VARCHAR(80) NOT NULL DEFAULT 'site_offer',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_leadpage_job_uuid (job_uuid),
      KEY idx_leadpage_status_created (status, created_at),
      KEY idx_leadpage_email (email),
      KEY idx_leadpage_business (business_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leadpage_job_events (
      id BIGINT NOT NULL AUTO_INCREMENT,
      job_uuid VARCHAR(72) NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      event_note VARCHAR(500) NULL,
      payload_json LONGTEXT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_leadpage_events_job (job_uuid, created_at),
      KEY idx_leadpage_events_type (event_type, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN payment_status VARCHAR(40) NOT NULL DEFAULT 'unpaid'`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN payment_provider VARCHAR(40) NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN payment_reference VARCHAR(120) NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN payment_order_id VARCHAR(120) NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN payment_currency VARCHAR(16) NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN payment_amount_minor BIGINT NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN payment_initiated_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN payment_paid_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD KEY idx_leadpage_payment_status_created (payment_status, created_at)`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD KEY idx_leadpage_payment_reference (payment_reference)`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN client_access_token VARCHAR(96) NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN client_content_json LONGTEXT NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN publish_status VARCHAR(40) NOT NULL DEFAULT 'draft'`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN publish_enabled TINYINT(1) NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN published_url TEXT NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN last_published_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN domain_provider VARCHAR(40) NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN domain_order_id VARCHAR(120) NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN domain_purchase_currency VARCHAR(16) NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN domain_purchase_amount_minor BIGINT NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN domain_purchased_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD KEY idx_leadpage_domain_status_created (domain_status, created_at)`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN netlify_api_token VARCHAR(400) NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN netlify_site_id VARCHAR(200) NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN brevo_api_key VARCHAR(400) NULL`);
  await safeAlter(pool, `ALTER TABLE leadpage_jobs ADD COLUMN brevo_list_id BIGINT NULL`);
}

async function appendLeadpageEvent(pool, input) {
  const now = nowSql();
  await pool.query(
    `INSERT INTO leadpage_job_events
     (job_uuid, event_type, event_note, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      clean(input.jobUuid, 72),
      clean(input.eventType, 80),
      clean(input.eventNote, 500) || null,
      input.payload ? JSON.stringify(input.payload) : null,
      now,
    ]
  );
}

async function countLeadpageEventsSince(pool, input) {
  const jobUuid = clean(input && input.jobUuid, 72);
  const eventType = clean(input && input.eventType, 80);
  const seconds = Math.max(1, Math.min(Number((input && input.seconds) || 60), 86400));
  const cutoff = new Date(Date.now() - seconds * 1000).toISOString().slice(0, 19).replace("T", " ");

  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM leadpage_job_events
     WHERE job_uuid = ?
       AND event_type = ?
       AND created_at >= ?`,
    [jobUuid, eventType, cutoff]
  );
  return Number(rows && rows[0] ? rows[0].count : 0);
}

async function createLeadpageJob(pool, input) {
  const now = nowSql();
  const jobUuid = buildLeadpageJobUuid();
  const clientAccessToken = buildClientAccessToken();

  const row = {
    fullName: clean(input.fullName, 180),
    email: clean(input.email, 190).toLowerCase(),
    phone: clean(input.phone, 64),
    businessName: clean(input.businessName, 220),
    businessType: clean(input.businessType, 160),
    serviceOffer: clean(input.serviceOffer, 280),
    targetLocation: clean(input.targetLocation, 180),
    primaryGoal: clean(input.primaryGoal, 320),
    ctaText: clean(input.ctaText, 180),
    tone: clean(input.tone, 80),
    facebookPixelId: clean(input.facebookPixelId, 120),
    googleTagId: clean(input.googleTagId, 120),
    domainStatus: clean(input.domainStatus, 80),
    domainName: clean(input.domainName, 190),
    hostingerEmail: clean(input.hostingerEmail, 190),
    notes: clean(input.notes, 4000),
    source: clean(input.source, 80) || "site_offer",
  };

  await pool.query(
    `INSERT INTO leadpage_jobs
     (job_uuid, full_name, email, phone, business_name, business_type, service_offer, target_location, primary_goal, cta_text, tone,
      facebook_pixel_id, google_tag_id, domain_status, domain_name, hostinger_email, notes, status, source, client_access_token, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      jobUuid,
      row.fullName,
      row.email,
      row.phone,
      row.businessName,
      row.businessType || null,
      row.serviceOffer,
      row.targetLocation || null,
      row.primaryGoal || null,
      row.ctaText || null,
      row.tone || null,
      row.facebookPixelId || null,
      row.googleTagId || null,
      row.domainStatus || null,
      row.domainName || null,
      row.hostingerEmail || null,
      row.notes || null,
      STATUS_DETAILS_PENDING,
      row.source,
      clientAccessToken,
      now,
      now,
    ]
  );

  await appendLeadpageEvent(pool, {
    jobUuid,
    eventType: "job_created",
    eventNote: "Lead capture job created via site offer details",
    payload: {
      email: row.email,
      businessName: row.businessName,
      source: row.source,
    },
  });

  return {
    jobUuid,
    clientAccessToken,
    status: STATUS_DETAILS_PENDING,
  };
}

async function listLeadpageJobs(pool, input) {
  const where = [];
  const params = [];

  const status = normalizeStatus(input.status);
  if (status) {
    where.push("status = ?");
    params.push(status);
  }

  const q = clean(input.search, 180);
  if (q) {
    where.push("(job_uuid LIKE ? OR full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR business_name LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }

  const safeLimit = Math.max(1, Math.min(Number(input.limit) || 80, 250));
  params.push(safeLimit);

  const [rows] = await pool.query(
    `SELECT job_uuid,
            full_name,
            email,
            phone,
            business_name,
            business_type,
            service_offer,
            target_location,
            primary_goal,
            cta_text,
            tone,
            facebook_pixel_id,
            google_tag_id,
            domain_status,
            domain_name,
            domain_provider,
            domain_order_id,
            domain_purchase_currency,
            domain_purchase_amount_minor,
            domain_purchased_at,
            hostinger_email,
            notes,
            status,
            build_url,
            delivery_url,
            copy_json,
            payment_status,
            payment_provider,
            payment_reference,
            payment_order_id,
            payment_currency,
            payment_amount_minor,
            payment_initiated_at,
            payment_paid_at,
            client_access_token,
            publish_status,
            publish_enabled,
            published_url,
            last_published_at,
            CASE WHEN netlify_api_token IS NULL OR netlify_api_token = '' THEN 0 ELSE 1 END AS has_netlify_api_token,
            netlify_site_id,
            CASE WHEN brevo_api_key IS NULL OR brevo_api_key = '' THEN 0 ELSE 1 END AS has_brevo_api_key,
            brevo_list_id,
            source,
            created_at,
            updated_at
     FROM leadpage_jobs
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT ?`,
    params
  );

  return rows || [];
}

async function findLeadpageJobByUuid(pool, jobUuid) {
  const [rows] = await pool.query(
    `SELECT job_uuid,
            full_name,
            email,
            phone,
            business_name,
            business_type,
            service_offer,
            target_location,
            primary_goal,
            cta_text,
            tone,
            facebook_pixel_id,
            google_tag_id,
            domain_status,
            domain_name,
            domain_provider,
            domain_order_id,
            domain_purchase_currency,
            domain_purchase_amount_minor,
            domain_purchased_at,
            hostinger_email,
            notes,
            status,
            build_url,
            delivery_url,
            copy_json,
            client_content_json,
            payment_status,
            payment_provider,
            payment_reference,
            payment_order_id,
            payment_currency,
            payment_amount_minor,
            payment_initiated_at,
            payment_paid_at,
            client_access_token,
            publish_status,
            publish_enabled,
            published_url,
            last_published_at,
            netlify_api_token,
            netlify_site_id,
            brevo_api_key,
            brevo_list_id,
            source,
            created_at,
            updated_at
     FROM leadpage_jobs
     WHERE job_uuid = ?
     LIMIT 1`,
    [clean(jobUuid, 72)]
  );

  return rows && rows.length ? rows[0] : null;
}

async function updateLeadpageJob(pool, input) {
  const jobUuid = clean(input.jobUuid, 72);
  const status = input.status ? normalizeStatus(input.status) : "";
  const adminNote = clean(input.adminNote, 500);
  const buildUrl = clean(input.buildUrl, 1200);
  const deliveryUrl = clean(input.deliveryUrl, 1200);

  const sets = ["updated_at = ?"];
  const params = [nowSql()];

  if (status) {
    sets.push("status = ?");
    params.push(status);
  }
  if (buildUrl) {
    sets.push("build_url = ?");
    params.push(buildUrl);
  }
  if (deliveryUrl) {
    sets.push("delivery_url = ?");
    params.push(deliveryUrl);
  }

  if (sets.length === 1) {
    return 0;
  }

  params.push(jobUuid);
  const [res] = await pool.query(`UPDATE leadpage_jobs SET ${sets.join(", ")} WHERE job_uuid = ?`, params);
  const affected = Number(res && res.affectedRows ? res.affectedRows : 0);

  if (affected > 0) {
    await appendLeadpageEvent(pool, {
      jobUuid,
      eventType: "job_updated",
      eventNote: adminNote || "Leadpage job updated",
      payload: {
        status: status || undefined,
        hasBuildUrl: Boolean(buildUrl),
        hasDeliveryUrl: Boolean(deliveryUrl),
      },
    });
  }

  return affected;
}

async function findLeadpageJobByPaymentReference(pool, paymentReference) {
  const [rows] = await pool.query(
    `SELECT job_uuid,
            payment_status,
            payment_reference
     FROM leadpage_jobs
     WHERE payment_reference = ?
     LIMIT 1`,
    [clean(paymentReference, 120)]
  );

  return rows && rows.length ? rows[0] : null;
}

async function validateLeadpageClientToken(pool, input) {
  const jobUuid = clean(input.jobUuid, 72);
  const accessToken = clean(input.accessToken, 96);
  if (!jobUuid || !accessToken) return null;

  const [rows] = await pool.query(
    `SELECT job_uuid,
            full_name,
            email,
            business_name,
            status,
            payment_status,
            publish_status,
            publish_enabled,
            published_url,
            netlify_site_id,
            CASE WHEN netlify_api_token IS NULL OR netlify_api_token = '' THEN 0 ELSE 1 END AS has_netlify_api_token,
            brevo_list_id,
            CASE WHEN brevo_api_key IS NULL OR brevo_api_key = '' THEN 0 ELSE 1 END AS has_brevo_api_key,
            created_at,
            updated_at
     FROM leadpage_jobs
     WHERE job_uuid = ? AND client_access_token = ?
     LIMIT 1`,
    [jobUuid, accessToken]
  );

  if (!rows || !rows.length) return null;
  return rows[0];
}

async function validateLeadpageClientAccess(pool, input) {
  const access = await validateLeadpageClientToken(pool, input);
  if (!access) return null;
  if (String(access.payment_status || "").toLowerCase() !== "paid") return null;
  return access;
}

async function getLeadpageDashboardData(pool, input) {
  const access = await validateLeadpageClientAccess(pool, input);
  if (!access) return null;

  const [projectRows] = await pool.query(
    `SELECT job_uuid,
            full_name,
            email,
            phone,
            business_name,
            business_type,
            service_offer,
            target_location,
            primary_goal,
            cta_text,
            tone,
            facebook_pixel_id,
            google_tag_id,
            domain_status,
            domain_name,
            domain_provider,
            domain_order_id,
            domain_purchase_currency,
            domain_purchase_amount_minor,
            domain_purchased_at,
            notes,
            status,
            payment_status,
            publish_status,
            publish_enabled,
            published_url,
            client_content_json,
            netlify_site_id,
            CASE WHEN netlify_api_token IS NULL OR netlify_api_token = '' THEN 0 ELSE 1 END AS has_netlify_api_token,
            brevo_list_id,
            CASE WHEN brevo_api_key IS NULL OR brevo_api_key = '' THEN 0 ELSE 1 END AS has_brevo_api_key,
            created_at,
            updated_at
     FROM leadpage_jobs
     WHERE job_uuid = ?
     LIMIT 1`,
    [clean(input.jobUuid, 72)]
  );

  if (!projectRows || !projectRows.length) return null;

  const [eventRows] = await pool.query(
    `SELECT event_type, event_note, payload_json, created_at
     FROM leadpage_job_events
     WHERE job_uuid = ?
     ORDER BY created_at DESC
     LIMIT 20`,
    [clean(input.jobUuid, 72)]
  );

  return {
    project: projectRows[0],
    events: eventRows || [],
  };
}

async function updateLeadpageClientContent(pool, input) {
  const jobUuid = clean(input.jobUuid, 72);
  const contentJson = input.contentJson ? JSON.stringify(input.contentJson) : null;
  const now = nowSql();
  const sets = ["client_content_json = ?", "updated_at = ?"];
  const params = [contentJson, now];

  if (Object.prototype.hasOwnProperty.call(input, "hasFacebookPixelId") && input.hasFacebookPixelId) {
    sets.push("facebook_pixel_id = ?");
    params.push(clean(input.facebookPixelId, 120) || null);
  }

  if (Object.prototype.hasOwnProperty.call(input, "hasGoogleTagId") && input.hasGoogleTagId) {
    sets.push("google_tag_id = ?");
    params.push(clean(input.googleTagId, 120) || null);
  }

  params.push(jobUuid);
  const [res] = await pool.query(
    `UPDATE leadpage_jobs
     SET ${sets.join(", ")}
     WHERE job_uuid = ?`,
    params
  );

  const affected = Number(res && res.affectedRows ? res.affectedRows : 0);
  if (affected > 0) {
    await appendLeadpageEvent(pool, {
      jobUuid,
      eventType: "client_content_saved",
      eventNote: "Client saved page content from dashboard",
    });
  }
  return affected;
}

async function updateLeadpageClientIntegrations(pool, input) {
  const jobUuid = clean(input.jobUuid, 72);
  const now = nowSql();
  const sets = ["updated_at = ?"];
  const params = [now];

  if (Object.prototype.hasOwnProperty.call(input, "hasNetlifyApiToken") && input.hasNetlifyApiToken) {
    sets.push("netlify_api_token = ?");
    params.push(clean(input.netlifyApiToken, 400) || null);
  }
  if (Object.prototype.hasOwnProperty.call(input, "hasNetlifySiteId") && input.hasNetlifySiteId) {
    sets.push("netlify_site_id = ?");
    params.push(clean(input.netlifySiteId, 200) || null);
  }
  if (Object.prototype.hasOwnProperty.call(input, "hasBrevoApiKey") && input.hasBrevoApiKey) {
    sets.push("brevo_api_key = ?");
    params.push(clean(input.brevoApiKey, 400) || null);
  }
  if (Object.prototype.hasOwnProperty.call(input, "hasBrevoListId") && input.hasBrevoListId) {
    const raw = clean(input.brevoListId, 40);
    const n = Number(raw);
    const listId = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    sets.push("brevo_list_id = ?");
    params.push(listId);
  }

  if (sets.length === 1) return 0;

  params.push(jobUuid);
  const [res] = await pool.query(
    `UPDATE leadpage_jobs
     SET ${sets.join(", ")}
     WHERE job_uuid = ?`,
    params
  );

  const affected = Number(res && res.affectedRows ? res.affectedRows : 0);
  if (affected > 0) {
    await appendLeadpageEvent(pool, {
      jobUuid,
      eventType: "client_integrations_saved",
      eventNote: "Client saved Netlify/Brevo integration credentials",
      payload: {
        hasNetlifyApiToken: Boolean(input.hasNetlifyApiToken),
        hasNetlifySiteId: Boolean(input.hasNetlifySiteId),
        hasBrevoApiKey: Boolean(input.hasBrevoApiKey),
        hasBrevoListId: Boolean(input.hasBrevoListId),
      },
    });
  }
  return affected;
}

async function setLeadpagePublishState(pool, input) {
  const jobUuid = clean(input.jobUuid, 72);
  const publishStatus = clean(input.publishStatus, 40) || "draft";
  const publishedUrl = clean(input.publishedUrl, 1200);
  const publishEnabled = Object.prototype.hasOwnProperty.call(input, "publishEnabled")
    ? Number(input.publishEnabled ? 1 : 0)
    : null;
  const now = nowSql();
  const sets = ["publish_status = ?", "updated_at = ?"];
  const params = [publishStatus, now];

  if (publishEnabled !== null) {
    sets.push("publish_enabled = ?");
    params.push(publishEnabled);
  }

  if (publishedUrl) {
    sets.push("published_url = ?");
    params.push(publishedUrl);
    sets.push("last_published_at = ?");
    params.push(now);
  }

  params.push(jobUuid);
  const [res] = await pool.query(`UPDATE leadpage_jobs SET ${sets.join(", ")} WHERE job_uuid = ?`, params);
  const affected = Number(res && res.affectedRows ? res.affectedRows : 0);
  if (affected > 0) {
    await appendLeadpageEvent(pool, {
      jobUuid,
      eventType: "publish_state_changed",
      eventNote: `Publish status changed to ${publishStatus}`,
      payload: { publishedUrl: publishedUrl || null },
    });
  }
  return affected;
}

async function setLeadpageDomainState(pool, input) {
  const jobUuid = clean(input.jobUuid, 72);
  const domainStatus = clean(input.domainStatus, 80);
  const domainName = clean(input.domainName, 190).toLowerCase();
  const domainProvider = clean(input.domainProvider, 40);
  const domainOrderId = clean(input.domainOrderId, 120);
  const domainPurchaseCurrency = clean(input.domainPurchaseCurrency, 16).toUpperCase();
  const domainPurchaseAmountMinor = Number.isFinite(Number(input.domainPurchaseAmountMinor))
    ? Math.max(0, Math.floor(Number(input.domainPurchaseAmountMinor)))
    : null;
  const markPurchased = Boolean(input.markPurchased);
  const now = nowSql();

  const sets = ["updated_at = ?"];
  const params = [now];

  if (domainStatus) {
    sets.push("domain_status = ?");
    params.push(domainStatus);
  }
  if (Object.prototype.hasOwnProperty.call(input, "domainName")) {
    sets.push("domain_name = ?");
    params.push(domainName || null);
  }
  if (Object.prototype.hasOwnProperty.call(input, "domainProvider")) {
    sets.push("domain_provider = ?");
    params.push(domainProvider || null);
  }
  if (Object.prototype.hasOwnProperty.call(input, "domainOrderId")) {
    sets.push("domain_order_id = ?");
    params.push(domainOrderId || null);
  }
  if (Object.prototype.hasOwnProperty.call(input, "domainPurchaseCurrency")) {
    sets.push("domain_purchase_currency = ?");
    params.push(domainPurchaseCurrency || null);
  }
  if (Object.prototype.hasOwnProperty.call(input, "domainPurchaseAmountMinor")) {
    sets.push("domain_purchase_amount_minor = ?");
    params.push(domainPurchaseAmountMinor);
  }
  if (markPurchased) {
    sets.push("domain_purchased_at = ?");
    params.push(now);
  }

  params.push(jobUuid);
  const [res] = await pool.query(`UPDATE leadpage_jobs SET ${sets.join(", ")} WHERE job_uuid = ?`, params);
  const affected = Number(res && res.affectedRows ? res.affectedRows : 0);
  if (affected > 0) {
    await appendLeadpageEvent(pool, {
      jobUuid,
      eventType: "domain_state_changed",
      eventNote: domainStatus ? `Domain status changed to ${domainStatus}` : "Domain state updated",
      payload: {
        domainName: domainName || null,
        domainProvider: domainProvider || null,
        domainOrderId: domainOrderId || null,
        domainPurchaseCurrency: domainPurchaseCurrency || null,
        domainPurchaseAmountMinor,
      },
    });
  }
  return affected;
}

async function findPublishedLeadpageProject(pool, jobUuid) {
  const [rows] = await pool.query(
    `SELECT job_uuid,
            business_name,
            primary_goal,
            target_location,
            service_offer,
            cta_text,
            notes,
            copy_json,
            client_content_json,
            publish_status,
            publish_enabled,
            published_url,
            updated_at
     FROM leadpage_jobs
     WHERE job_uuid = ?
       AND payment_status = 'paid'
       AND publish_enabled = 1
       AND publish_status = 'published'
     LIMIT 1`,
    [clean(jobUuid, 72)]
  );

  return rows && rows.length ? rows[0] : null;
}

async function getLeadpagePublishUsage(pool, jobUuid) {
  const safeJobUuid = clean(jobUuid, 72);
  const perClientLimit = positiveInt(process.env.LEADPAGE_CLIENT_MONTHLY_PUBLISH_LIMIT, 12);

  const [jobRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM leadpage_job_events
     WHERE job_uuid = ?
       AND event_type = 'publish_state_changed'
       AND event_note = 'Publish status changed to published'
       AND YEAR(created_at) = YEAR(CURRENT_DATE())
       AND MONTH(created_at) = MONTH(CURRENT_DATE())`,
    [safeJobUuid]
  );
  const jobPublishedThisMonth = Number(jobRows && jobRows[0] ? jobRows[0].count : 0);

  const clientRemainingPublishes = Math.max(0, perClientLimit - jobPublishedThisMonth);
  const clientLimitReached = jobPublishedThisMonth >= perClientLimit;
  const globalPublishedThisMonth = 0;
  const netlifyMonthlyCredits = 0;
  const estimatedCreditsPerPublish = 0;
  const globalEstimatedCreditsUsed = 0;
  const globalEstimatedCreditsRemaining = 0;
  const globalCreditsExhausted = false;
  const globalCreditWarning = false;

  let warningMessage = "";
  if (clientLimitReached) {
    warningMessage = "Monthly publish limit reached for this project. Upgrade hosting on your Netlify account to continue publishing this month.";
  }

  return {
    perClientLimit,
    clientPublishedThisMonth: jobPublishedThisMonth,
    clientRemainingPublishes,
    globalPublishedThisMonth,
    netlifyMonthlyCredits,
    estimatedCreditsPerPublish,
    globalEstimatedCreditsUsed,
    globalEstimatedCreditsRemaining,
    clientLimitReached,
    globalCreditsExhausted,
    globalCreditWarning,
    canPublish: !clientLimitReached,
    warningMessage,
  };
}

async function markLeadpagePaymentInitiated(pool, input) {
  const jobUuid = clean(input.jobUuid, 72);
  const paymentReference = clean(input.paymentReference, 120);
  const paymentProvider = clean(input.paymentProvider, 40) || "paystack";
  const paymentCurrency = clean(input.paymentCurrency, 16) || "NGN";
  const amountMinor = Number(input.paymentAmountMinor || 0);
  const now = nowSql();

  const [res] = await pool.query(
    `UPDATE leadpage_jobs
     SET payment_status = 'payment_pending',
         payment_provider = ?,
         payment_reference = ?,
         payment_currency = ?,
         payment_amount_minor = ?,
         payment_initiated_at = ?,
         updated_at = ?
     WHERE job_uuid = ?`,
    [paymentProvider, paymentReference || null, paymentCurrency, amountMinor || null, now, now, jobUuid]
  );

  const affected = Number(res && res.affectedRows ? res.affectedRows : 0);
  if (affected > 0) {
    await appendLeadpageEvent(pool, {
      jobUuid,
      eventType: "payment_initiated",
      eventNote: "Leadpage payment initialized",
      payload: {
        paymentProvider,
        paymentReference: paymentReference || null,
        paymentCurrency,
        paymentAmountMinor: amountMinor || null,
      },
    });
  }

  return affected;
}

async function markLeadpagePaymentPaid(pool, input) {
  const jobUuid = clean(input.jobUuid, 72);
  const paymentReference = clean(input.paymentReference, 120);
  const paymentProvider = clean(input.paymentProvider, 40) || "paystack";
  const paymentOrderId = clean(input.paymentOrderId, 120);
  const paymentCurrency = clean(input.paymentCurrency, 16) || "NGN";
  const amountMinor = Number(input.paymentAmountMinor || 0);
  const now = nowSql();

  const [res] = await pool.query(
    `UPDATE leadpage_jobs
     SET payment_status = 'paid',
         payment_provider = ?,
         payment_reference = COALESCE(?, payment_reference),
         payment_order_id = ?,
         payment_currency = ?,
         payment_amount_minor = ?,
         payment_paid_at = ?,
         updated_at = ?
     WHERE job_uuid = ?`,
    [paymentProvider, paymentReference || null, paymentOrderId || null, paymentCurrency, amountMinor || null, now, now, jobUuid]
  );

  const affected = Number(res && res.affectedRows ? res.affectedRows : 0);
  if (affected > 0) {
    await appendLeadpageEvent(pool, {
      jobUuid,
      eventType: "payment_paid",
      eventNote: "Leadpage payment confirmed",
      payload: {
        paymentProvider,
        paymentReference: paymentReference || null,
        paymentOrderId: paymentOrderId || null,
        paymentCurrency,
        paymentAmountMinor: amountMinor || null,
      },
    });
  }

  return affected;
}

module.exports = {
  STATUS_DETAILS_PENDING,
  STATUS_DETAILS_COMPLETE,
  STATUS_COPY_GENERATED,
  STATUS_PAGE_BUILT,
  STATUS_QA_PASSED,
  STATUS_DELIVERED,
  VALID_STATUSES,
  normalizeStatus,
  ensureLeadpageTables,
  createLeadpageJob,
  listLeadpageJobs,
  findLeadpageJobByUuid,
  findLeadpageJobByPaymentReference,
  validateLeadpageClientAccess,
  validateLeadpageClientToken,
  getLeadpageDashboardData,
  findPublishedLeadpageProject,
  getLeadpagePublishUsage,
  updateLeadpageJob,
  updateLeadpageClientContent,
  updateLeadpageClientIntegrations,
  setLeadpagePublishState,
  setLeadpageDomainState,
  countLeadpageEventsSince,
  markLeadpagePaymentInitiated,
  markLeadpagePaymentPaid,
  appendLeadpageEvent,
};
