const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureLeadpageTables,
  validateLeadpageClientAccess,
  findLeadpageJobByUuid,
  updateLeadpageJob,
} = require("./_lib/leadpage-jobs");
const { runLeadpageAutomation } = require("./_lib/leadpage-automation");

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

    const job = await findLeadpageJobByUuid(pool, jobUuid);
    if (!job) return json(404, { ok: false, error: "Job not found" });

    const status = clean(job.status, 64).toLowerCase();
    if (status === "page_built" || status === "qa_passed" || status === "delivered") {
      return json(200, { ok: true, started: false, status });
    }

    if (status === "details_pending") {
      await updateLeadpageJob(pool, {
        jobUuid,
        status: "details_complete",
        adminNote: "Payment confirmed; build started from client dashboard",
      });
    }

    await runLeadpageAutomation(pool, {
      jobUuid,
      dryRun: false,
      trigger: "client_dashboard_paid",
      requestedBy: "client",
    });

    return json(200, { ok: true, started: true, status: "page_built" });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not start build" });
  }
};

