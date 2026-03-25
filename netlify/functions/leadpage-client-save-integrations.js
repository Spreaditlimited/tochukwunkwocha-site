const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureLeadpageTables,
  validateLeadpageClientAccess,
  updateLeadpageClientIntegrations,
} = require("./_lib/leadpage-jobs");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
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

  const netlifyApiToken = clean(body.netlifyApiToken || body.netlify_api_token, 400);
  const netlifySiteId = clean(body.netlifySiteId || body.netlify_site_id, 200);
  const brevoApiKey = clean(body.brevoApiKey || body.brevo_api_key, 400);
  const brevoListId = clean(body.brevoListId || body.brevo_list_id, 40);

  const hasAnyField =
    Object.prototype.hasOwnProperty.call(body, "netlifyApiToken") ||
    Object.prototype.hasOwnProperty.call(body, "netlify_api_token") ||
    Object.prototype.hasOwnProperty.call(body, "netlifySiteId") ||
    Object.prototype.hasOwnProperty.call(body, "netlify_site_id") ||
    Object.prototype.hasOwnProperty.call(body, "brevoApiKey") ||
    Object.prototype.hasOwnProperty.call(body, "brevo_api_key") ||
    Object.prototype.hasOwnProperty.call(body, "brevoListId") ||
    Object.prototype.hasOwnProperty.call(body, "brevo_list_id");
  if (!hasAnyField) {
    return json(400, { ok: false, error: "No integration fields provided" });
  }

  const pool = getPool();
  try {
    await ensureLeadpageTables(pool);
    const access = await validateLeadpageClientAccess(pool, { jobUuid, accessToken });
    if (!access) return json(403, { ok: false, error: "Invalid dashboard access link" });

    await updateLeadpageClientIntegrations(pool, {
      jobUuid,
      netlifyApiToken,
      netlifySiteId,
      brevoApiKey,
      brevoListId,
      hasNetlifyApiToken:
        Object.prototype.hasOwnProperty.call(body, "netlifyApiToken") ||
        Object.prototype.hasOwnProperty.call(body, "netlify_api_token"),
      hasNetlifySiteId:
        Object.prototype.hasOwnProperty.call(body, "netlifySiteId") ||
        Object.prototype.hasOwnProperty.call(body, "netlify_site_id"),
      hasBrevoApiKey:
        Object.prototype.hasOwnProperty.call(body, "brevoApiKey") ||
        Object.prototype.hasOwnProperty.call(body, "brevo_api_key"),
      hasBrevoListId:
        Object.prototype.hasOwnProperty.call(body, "brevoListId") ||
        Object.prototype.hasOwnProperty.call(body, "brevo_list_id"),
    });

    return json(200, { ok: true, message: "Integrations saved successfully" });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not save integration settings" });
  }
};

