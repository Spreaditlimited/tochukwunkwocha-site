const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { getLeadMagnetBySlug, createBlogLeadEvent } = require("./_lib/blog-lead-magnets");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 1000);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const eventName = clean(body.eventName || body.event_name, 80);
  const leadMagnetSlug = clean(body.leadMagnetSlug || body.lead_magnet_slug, 255);
  if (!eventName || !leadMagnetSlug) return json(400, { ok: false, error: "eventName and leadMagnetSlug are required." });

  const pool = getPool();
  try {
    await applyRuntimeSettings(pool).catch(() => {});
    const leadMagnet = await getLeadMagnetBySlug(pool, leadMagnetSlug);
    if (!leadMagnet) return json(404, { ok: false, error: "Lead magnet not found." });
    const result = await createBlogLeadEvent(pool, {
      eventName,
      magnetUuid: leadMagnet.magnetUuid,
      pidBlog: leadMagnet.pidBlog,
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
    return json(200, { ok: true, event: result });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not record lead event." });
  }
};
