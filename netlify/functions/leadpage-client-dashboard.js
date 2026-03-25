const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureLeadpageTables, getLeadpageDashboardData, getLeadpagePublishUsage } = require("./_lib/leadpage-jobs");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function registrarMode() {
  const provider = clean(process.env.LEADPAGE_DOMAIN_PROVIDER || "namecheap", 40).toLowerCase();
  if (provider === "mock") return "mock";
  const sandbox = String(process.env.NAMECHEAP_USE_SANDBOX || "1").trim() !== "0";
  return sandbox ? "sandbox" : "live";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const qs = event.queryStringParameters || {};
  const jobUuid = clean(qs.job_uuid || qs.jobUuid, 72);
  const accessToken = clean(qs.access || qs.token, 96);
  if (!jobUuid || !accessToken) {
    return json(400, { ok: false, error: "Missing dashboard access parameters" });
  }

  const pool = getPool();
  try {
    await ensureLeadpageTables(pool);
    const data = await getLeadpageDashboardData(pool, { jobUuid, accessToken });
    if (!data) return json(403, { ok: false, error: "Invalid dashboard access link" });

    let content = null;
    try {
      content = data.project && data.project.client_content_json ? JSON.parse(data.project.client_content_json) : null;
    } catch (_error) {
      content = null;
    }

    return json(200, {
      ok: true,
      project: {
        jobUuid: data.project.job_uuid,
        fullName: data.project.full_name,
        email: data.project.email,
        phone: data.project.phone,
        businessName: data.project.business_name,
        businessType: data.project.business_type,
        serviceOffer: data.project.service_offer,
        targetLocation: data.project.target_location,
        primaryGoal: data.project.primary_goal,
        ctaText: data.project.cta_text,
        tone: data.project.tone,
        facebookPixelId: data.project.facebook_pixel_id,
        googleTagId: data.project.google_tag_id,
        domainStatus: data.project.domain_status,
        domainName: data.project.domain_name,
        domainProvider: data.project.domain_provider,
        domainOrderId: data.project.domain_order_id,
        domainPurchaseCurrency: data.project.domain_purchase_currency,
        domainPurchaseAmountMinor: data.project.domain_purchase_amount_minor,
        domainPurchasedAt: data.project.domain_purchased_at,
        domainRegistrarMode: registrarMode(),
        notes: data.project.notes,
        status: data.project.status,
        paymentStatus: data.project.payment_status,
        publishStatus: data.project.publish_status,
        publishEnabled: Number(data.project.publish_enabled || 0) === 1,
        publishedUrl: data.project.published_url,
        netlifySiteId: data.project.netlify_site_id,
        hasNetlifyApiToken: Number(data.project.has_netlify_api_token || 0) === 1,
        brevoListId: data.project.brevo_list_id,
        hasBrevoApiKey: Number(data.project.has_brevo_api_key || 0) === 1,
        createdAt: data.project.created_at,
        updatedAt: data.project.updated_at,
      },
      usage: await getLeadpagePublishUsage(pool, jobUuid),
      content,
      events: data.events || [],
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load dashboard data" });
  }
};
