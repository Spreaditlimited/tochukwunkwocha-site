const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLeadpageTables,
  findLeadpageJobByUuid,
  setLeadpagePublishState,
} = require("./_lib/leadpage-jobs");
const { triggerNetlifyPublish } = require("./_lib/netlify-publish");
const { siteBaseUrl } = require("./_lib/payments");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const jobUuid = clean(body.jobUuid, 72);
  if (!jobUuid) return json(400, { ok: false, error: "jobUuid is required" });

  const pool = getPool();
  try {
    await ensureLeadpageTables(pool);
    const job = await findLeadpageJobByUuid(pool, jobUuid);
    if (!job) return json(404, { ok: false, error: "Job not found" });
    if (String(job.payment_status || "").toLowerCase() !== "paid") {
      return json(400, { ok: false, error: "Only paid jobs can be first-published" });
    }

    await setLeadpagePublishState(pool, {
      jobUuid,
      publishStatus: "publishing",
      publishEnabled: 1,
    });

    const publish = await triggerNetlifyPublish();

    const liveUrl = `${siteBaseUrl()}/projects/${encodeURIComponent(jobUuid)}`;

    await setLeadpagePublishState(pool, {
      jobUuid,
      publishStatus: "published",
      publishEnabled: 1,
      publishedUrl: liveUrl,
    });

    return json(200, {
      ok: true,
      message: "First publish completed",
      buildId: publish.buildId,
      publishedUrl: liveUrl,
    });
  } catch (error) {
    try {
      await setLeadpagePublishState(pool, {
        jobUuid,
        publishStatus: "publish_failed",
        publishEnabled: 1,
      });
    } catch (_inner) {}
    return json(500, { ok: false, error: error.message || "Could not complete first publish" });
  }
};
