const { appendLeadpageEvent } = require("./leadpage-jobs");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function toInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function brevoEnabled() {
  return String(process.env.LEADPAGE_BREVO_ENABLED || "0").trim() !== "0";
}

function brevoAllowMock() {
  return String(process.env.LEADPAGE_BREVO_ALLOW_MOCK || "0").trim() !== "0";
}

function followupCount() {
  return toInt(process.env.BREVO_LEADPAGE_FOLLOWUP_EMAIL_COUNT, 5, 1, 7);
}

function dailySendLimit() {
  return toInt(process.env.BREVO_FREE_TIER_DAILY_SEND_LIMIT, 300, 10, 1000000);
}

function splitName(fullName) {
  const raw = clean(fullName, 180);
  if (!raw) return { firstName: "", lastName: "" };
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

async function brevoRequest(path, payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const key = clean(source.__apiKey, 400);
  const bodyPayload = Object.assign({}, source);
  delete bodyPayload.__apiKey;
  const res = await fetch(`https://api.brevo.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": key,
      Accept: "application/json",
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API error (${res.status}): ${clean(body, 500) || "request failed"}`);
  }

  const json = await res.json().catch(() => ({}));
  return json || {};
}

async function todayScheduledSequences(pool) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM leadpage_job_events
     WHERE event_type = 'brevo_followup_scheduled'
       AND created_at >= CURDATE()`
  );
  return Number(rows && rows[0] ? rows[0].count : 0);
}

async function syncLeadpageJobToBrevo(pool, input) {
  const job = input && input.job ? input.job : null;
  const jobUuid = clean((input && input.jobUuid) || (job && job.job_uuid), 72);
  const trigger = clean((input && input.trigger) || "unknown", 80) || "unknown";
  const requestedBy = clean((input && input.requestedBy) || "system", 80) || "system";

  if (!jobUuid || !job) {
    throw new Error("job is required");
  }

  if (!brevoEnabled()) {
    return { attempted: false, success: false, skipped: true, reason: "disabled" };
  }

  const key = clean(job.brevo_api_key, 400);
  const listId = toInt(job.brevo_list_id, 0, 0, 2147483647);
  const emailsPerSequence = followupCount();
  const limitPerDay = dailySendLimit();

  if (!listId) {
    return { attempted: false, success: false, skipped: true, reason: "missing_customer_list_id" };
  }

  if (!key && brevoAllowMock()) {
    await appendLeadpageEvent(pool, {
      jobUuid,
      eventType: "brevo_followup_scheduled",
      eventNote: `Brevo mock scheduling (${trigger})`,
      payload: {
        requestedBy,
        trigger,
        mock: true,
        listId,
        followupEmailCount: emailsPerSequence,
      },
    });
    return {
      attempted: true,
      success: true,
      skipped: false,
      mock: true,
      listId,
      followupEmailCount: emailsPerSequence,
    };
  }

  if (!key) {
    return { attempted: true, success: false, skipped: true, reason: "missing_customer_api_key" };
  }

  const scheduledToday = await todayScheduledSequences(pool);
  const projectedEmailsToday = (scheduledToday + 1) * emailsPerSequence;
  if (projectedEmailsToday > limitPerDay) {
    await appendLeadpageEvent(pool, {
      jobUuid,
      eventType: "brevo_guardrail_blocked",
      eventNote: "Brevo free-tier daily send guardrail blocked scheduling",
      payload: {
        requestedBy,
        trigger,
        scheduledToday,
        followupEmailCount: emailsPerSequence,
        projectedEmailsToday,
        dailySendLimit: limitPerDay,
      },
    });
    return {
      attempted: true,
      success: false,
      skipped: true,
      reason: "daily_limit_guardrail",
      scheduledToday,
      projectedEmailsToday,
      dailySendLimit: limitPerDay,
    };
  }

  const names = splitName(job.full_name);
  const contactPayload = {
    __apiKey: key,
    email: clean(job.email, 190).toLowerCase(),
    ext_id: jobUuid,
    updateEnabled: true,
    listIds: [listId],
    attributes: {
      FIRSTNAME: clean(names.firstName, 90),
      LASTNAME: clean(names.lastName, 90),
      PHONE: clean(job.phone, 64),
      BUSINESS_NAME: clean(job.business_name, 220),
      SERVICE_OFFER: clean(job.service_offer, 280),
      TARGET_LOCATION: clean(job.target_location, 180),
      JOB_UUID: jobUuid,
    },
  };

  await appendLeadpageEvent(pool, {
    jobUuid,
    eventType: "brevo_sync_started",
    eventNote: `Brevo sync started (${trigger})`,
    payload: {
      requestedBy,
      trigger,
      listId,
      followupEmailCount: emailsPerSequence,
      dailySendLimit: limitPerDay,
    },
  });

  await brevoRequest("/v3/contacts", contactPayload);

  await appendLeadpageEvent(pool, {
    jobUuid,
    eventType: "brevo_followup_scheduled",
    eventNote: `Brevo follow-up sequence scheduled (${trigger})`,
    payload: {
      requestedBy,
      trigger,
      listId,
      followupEmailCount: emailsPerSequence,
      projectedEmailsToday,
      dailySendLimit: limitPerDay,
      mock: false,
    },
  });

  return {
    attempted: true,
    success: true,
    skipped: false,
    mock: false,
    listId,
    followupEmailCount: emailsPerSequence,
    projectedEmailsToday,
    dailySendLimit: limitPerDay,
  };
}

module.exports = {
  syncLeadpageJobToBrevo,
};
