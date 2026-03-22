const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureLeadpageTables, getLeadpageDashboardData, getLeadpagePublishUsage } = require("./_lib/leadpage-jobs");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
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
        notes: data.project.notes,
        status: data.project.status,
        paymentStatus: data.project.payment_status,
        publishStatus: data.project.publish_status,
        publishEnabled: Number(data.project.publish_enabled || 0) === 1,
        publishedUrl: data.project.published_url,
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
