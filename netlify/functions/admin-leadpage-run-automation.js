const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { runLeadpageAutomation } = require("./_lib/leadpage-automation");
const { ensureLeadpageTables, findLeadpageJobByUuid } = require("./_lib/leadpage-jobs");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
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

  const jobUuid = clean(body.jobUuid || body.job_uuid, 72);
  const dryRun = Boolean(body.dryRun || body.dry_run);

  if (!jobUuid) return json(400, { ok: false, error: "jobUuid is required" });

  const pool = getPool();
  try {
    await ensureLeadpageTables(pool);
    const job = await findLeadpageJobByUuid(pool, jobUuid);
    if (!job) return json(404, { ok: false, error: "Job not found" });
    if (String(job.payment_status || "").toLowerCase() !== "paid") {
      return json(400, { ok: false, error: "Automation can only run after payment is confirmed" });
    }

    const result = await runLeadpageAutomation(pool, {
      jobUuid,
      dryRun,
      trigger: "admin_manual",
      requestedBy: "admin",
    });

    return json(200, {
      ok: true,
      result,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error.message || "Could not run automation",
    });
  }
};
