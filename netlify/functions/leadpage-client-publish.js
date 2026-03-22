const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureLeadpageTables,
  validateLeadpageClientAccess,
  setLeadpagePublishState,
  getLeadpagePublishUsage,
} = require("./_lib/leadpage-jobs");
const { triggerNetlifyPublish } = require("./_lib/netlify-publish");
const { siteBaseUrl } = require("./_lib/payments");

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

  const pool = getPool();
  try {
    await ensureLeadpageTables(pool);
    const access = await validateLeadpageClientAccess(pool, { jobUuid, accessToken });
    if (!access) return json(403, { ok: false, error: "Invalid dashboard access link" });

    if (String(access.payment_status || "").toLowerCase() !== "paid") {
      return json(400, { ok: false, error: "Payment must be confirmed before publishing" });
    }
    if (Number(access.publish_enabled || 0) !== 1) {
      return json(400, {
        ok: false,
        error: "Publishing is not enabled yet. Our team will complete first publish before re-publish is available.",
      });
    }

    const usage = await getLeadpagePublishUsage(pool, jobUuid);
    if (!usage.canPublish) {
      return json(400, {
        ok: false,
        error: usage.warningMessage || "Publishing is not available right now.",
        usage,
      });
    }

    await setLeadpagePublishState(pool, {
      jobUuid,
      publishStatus: "publishing",
    });

    const publish = await triggerNetlifyPublish();

    const liveUrl = `${siteBaseUrl()}/projects/${encodeURIComponent(jobUuid)}`;

    await setLeadpagePublishState(pool, {
      jobUuid,
      publishStatus: "published",
      publishedUrl: liveUrl,
    });

    return json(200, {
      ok: true,
      message: "Publish triggered successfully",
      buildId: publish.buildId,
      publishedUrl: liveUrl,
      usage: await getLeadpagePublishUsage(pool, jobUuid),
    });
  } catch (error) {
    try {
      await setLeadpagePublishState(pool, {
        jobUuid,
        publishStatus: "publish_failed",
      });
    } catch (_innerError) {}
    return json(500, { ok: false, error: error.message || "Could not publish right now" });
  }
};
