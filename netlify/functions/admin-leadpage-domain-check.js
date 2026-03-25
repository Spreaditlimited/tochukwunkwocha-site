const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureLeadpageTables, findLeadpageJobByUuid, setLeadpageDomainState } = require("./_lib/leadpage-jobs");
const { checkAvailability, selectedDomainProviderName } = require("./_lib/domain-client");

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
  const domainName = clean(body.domainName || body.domain_name, 190).toLowerCase();
  if (!jobUuid) return json(400, { ok: false, error: "jobUuid is required" });
  if (!domainName) return json(400, { ok: false, error: "domainName is required" });

  const pool = getPool();
  try {
    await ensureLeadpageTables(pool);
    const job = await findLeadpageJobByUuid(pool, jobUuid);
    if (!job) return json(404, { ok: false, error: "Job not found" });

    const result = await checkAvailability({ domainName });
    await setLeadpageDomainState(pool, {
      jobUuid,
      domainStatus: result.available ? "available" : "unavailable",
      domainName,
      domainProvider: result.provider || selectedDomainProviderName(),
    });

    return json(200, {
      ok: true,
      provider: result.provider || selectedDomainProviderName(),
      domainName,
      available: Boolean(result.available),
      reason: result.reason || "",
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not check domain" });
  }
};
