const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLeadpageTables,
  findLeadpageJobByUuid,
  setLeadpagePublishState,
} = require("./_lib/leadpage-jobs");
const { runLeadpageDomainAutomation } = require("./_lib/leadpage-domain-automation");
const { syncLeadpageJobToBrevo } = require("./_lib/leadpage-brevo");
const { triggerNetlifyPublish } = require("./_lib/netlify-publish");
const { siteBaseUrl } = require("./_lib/payments");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function domainAutomationEnabled() {
  return String(process.env.LEADPAGE_DOMAIN_AUTOMATION_ENABLED || "0").trim() !== "0";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  try {
    await applyRuntimeSettings(getPool());
  } catch (_error) {}

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
    const netlifyApiToken = clean(job.netlify_api_token, 400);
    const netlifySiteId = clean(job.netlify_site_id, 200);
    if (!netlifyApiToken || !netlifySiteId) {
      return json(400, {
        ok: false,
        error: "Customer Netlify credentials are required before first publish. Ask the customer to save Netlify API key and Site ID in dashboard.",
      });
    }

    let domainAutomation = {
      attempted: false,
      success: false,
      skipped: true,
      reason: "disabled",
    };
    if (domainAutomationEnabled()) {
      try {
        domainAutomation = await runLeadpageDomainAutomation(pool, {
          jobUuid,
          job,
          trigger: "admin_first_publish",
          requestedBy: "admin",
        });
      } catch (error) {
        domainAutomation = {
          attempted: true,
          success: false,
          skipped: false,
          reason: error.message || "domain_automation_failed",
        };
      }
    }

    const buildStatus = clean(job.status, 64).toLowerCase();
    if (buildStatus !== "page_built" && buildStatus !== "qa_passed" && buildStatus !== "delivered") {
      return json(400, {
        ok: false,
        error: "Landing page build is not complete yet. Customer must open dashboard and allow build process to finish first.",
      });
    }

    await setLeadpagePublishState(pool, {
      jobUuid,
      publishStatus: "publishing",
      publishEnabled: 1,
    });

    const publish = await triggerNetlifyPublish({
      apiToken: netlifyApiToken,
      siteId: netlifySiteId,
    });

    const liveUrl = `${siteBaseUrl()}/projects/${encodeURIComponent(jobUuid)}`;

    await setLeadpagePublishState(pool, {
      jobUuid,
      publishStatus: "published",
      publishEnabled: 1,
      publishedUrl: liveUrl,
    });

    let brevoAutomation = {
      attempted: false,
      success: false,
      skipped: true,
      reason: "not_run",
    };
    try {
      brevoAutomation = await syncLeadpageJobToBrevo(pool, {
        jobUuid,
        job,
        trigger: "admin_first_publish",
        requestedBy: "admin",
      });
    } catch (error) {
      brevoAutomation = {
        attempted: true,
        success: false,
        skipped: false,
        reason: error.message || "brevo_sync_failed",
      };
    }

    return json(200, {
      ok: true,
      message: "First publish completed",
      buildId: publish.buildId,
      publishedUrl: liveUrl,
      domainAutomation,
      brevoAutomation,
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
