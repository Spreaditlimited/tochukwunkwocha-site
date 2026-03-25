const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureLeadpageTables,
  validateLeadpageClientAccess,
  updateLeadpageClientContent,
} = require("./_lib/leadpage-jobs");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function cleanContent(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    headline: clean(source.headline, 180),
    subheadline: clean(source.subheadline, 500),
    cta: clean(source.cta, 80),
    offer: clean(source.offer, 500),
    testimonials: clean(source.testimonials, 2000),
    contactNote: clean(source.contactNote, 500),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const jobUuid = clean(body.jobUuid || body.job_uuid, 72);
  const accessToken = clean(body.accessToken || body.access, 96);
  if (!jobUuid || !accessToken) {
    return json(400, { ok: false, error: "Missing dashboard access parameters" });
  }

  const content = cleanContent(body.content);
  const facebookPixelId = clean(body.facebookPixelId || body.facebook_pixel_id, 120);
  const googleTagId = clean(body.googleTagId || body.google_tag_id, 120);
  if (!content.headline || !content.subheadline || !content.offer) {
    return json(400, { ok: false, error: "headline, subheadline, and offer are required" });
  }

  const pool = getPool();
  try {
    await ensureLeadpageTables(pool);
    const access = await validateLeadpageClientAccess(pool, { jobUuid, accessToken });
    if (!access) return json(403, { ok: false, error: "Invalid dashboard access link" });

    await updateLeadpageClientContent(pool, {
      jobUuid,
      contentJson: content,
      facebookPixelId,
      googleTagId,
      hasFacebookPixelId: Object.prototype.hasOwnProperty.call(body, "facebookPixelId") || Object.prototype.hasOwnProperty.call(body, "facebook_pixel_id"),
      hasGoogleTagId: Object.prototype.hasOwnProperty.call(body, "googleTagId") || Object.prototype.hasOwnProperty.call(body, "google_tag_id"),
    });

    return json(200, { ok: true, message: "Dashboard content saved" });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not save dashboard content" });
  }
};
