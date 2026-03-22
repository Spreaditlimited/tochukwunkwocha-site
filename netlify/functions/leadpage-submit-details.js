const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureLeadpageTables, createLeadpageJob } = require("./_lib/leadpage-jobs");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const payload = {
    fullName: clean(body.fullName, 180),
    email: clean(body.email, 190).toLowerCase(),
    phone: clean(body.phone, 64),
    businessName: clean(body.businessName, 220),
    businessType: clean(body.businessType, 160),
    serviceOffer: clean(body.serviceOffer, 280),
    targetLocation: clean(body.targetLocation, 180),
    primaryGoal: clean(body.primaryGoal, 320),
    ctaText: clean(body.ctaText, 180),
    tone: clean(body.tone, 80),
    facebookPixelId: clean(body.facebookPixelId, 120),
    googleTagId: clean(body.googleTagId, 120),
    domainStatus: clean(body.domainStatus, 80),
    domainName: clean(body.domainName, 190),
    hostingerEmail: clean(body.hostingEmail || body.hostingerEmail, 190),
    notes: clean(body.notes, 4000),
    source: "site_offer",
  };

  if (!payload.fullName || !payload.email || !payload.phone || !payload.businessName || !payload.serviceOffer) {
    return json(400, { ok: false, error: "fullName, email, phone, businessName, and serviceOffer are required" });
  }

  if (!isEmail(payload.email)) {
    return json(400, { ok: false, error: "A valid email is required" });
  }

  const pool = getPool();

  try {
    await ensureLeadpageTables(pool);
    const created = await createLeadpageJob(pool, payload);
    return json(201, {
      ok: true,
      message: "Details submitted successfully. Your project has been queued.",
      jobUuid: created.jobUuid,
      status: created.status,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not submit details" });
  }
};
