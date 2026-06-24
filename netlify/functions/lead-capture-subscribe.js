const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { syncBrevoSubscriber } = require("./_lib/brevo");
const { createMarketingLead } = require("./_lib/marketing-leads");

const BREVO_LIST_ID = 17;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const firstName = clean(body.firstName || body.first_name, 120);
  const email = clean(body.email, 190).toLowerCase();

  if (!firstName) {
    return json(400, { ok: false, error: "First name is required." });
  }

  if (!EMAIL_RE.test(email)) {
    return json(400, { ok: false, error: "A valid email address is required." });
  }

  let pool;
  try {
    pool = getPool();
    await applyRuntimeSettings(pool);
  } catch (error) {
    return json(500, {
      ok: false,
      error: "Lead capture is not configured correctly.",
    });
  }

  const brevo = await syncBrevoSubscriber({
    fullName: firstName,
    email,
    listId: BREVO_LIST_ID,
  });

  if (!brevo.ok) {
    return json(502, {
      ok: false,
      error: brevo.error || "Could not subscribe right now.",
    });
  }

  try {
    await createMarketingLead(pool, {
      firstName,
      email,
      listId: BREVO_LIST_ID,
      source: clean(body.source, 100) || "lead_capture_popup",
      pageType: clean(body.pageType || body.page_type, 40),
      pageUrl: clean(body.pageUrl || body.page_url, 2000),
      pathname: clean(body.pathname, 500),
      referrer: clean(body.referrer, 2000),
      utmSource: clean(body.utmSource || body.utm_source, 190),
      utmMedium: clean(body.utmMedium || body.utm_medium, 190),
      utmCampaign: clean(body.utmCampaign || body.utm_campaign, 190),
      utmContent: clean(body.utmContent || body.utm_content, 190),
      utmTerm: clean(body.utmTerm || body.utm_term, 190),
      fbclid: clean(body.fbclid, 2000),
      fbp: clean(body.fbp, 190),
      fbc: clean(body.fbc, 190),
    });
  } catch (error) {
    console.error("Marketing lead save failed", error);
    return json(500, {
      ok: false,
      code: "MARKETING_LEAD_SAVE_FAILED",
      error: "We could not save your subscription details. Please try again.",
    });
  }

  return json(200, {
    ok: true,
    listId: BREVO_LIST_ID,
    message: "Subscription successful.",
  });
};
