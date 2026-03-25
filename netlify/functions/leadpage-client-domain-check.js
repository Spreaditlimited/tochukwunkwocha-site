const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureLeadpageTables,
  validateLeadpageClientAccess,
  findLeadpageJobByUuid,
  setLeadpageDomainState,
  appendLeadpageEvent,
  countLeadpageEventsSince,
} = require("./_lib/leadpage-jobs");
const { checkAvailability, selectedDomainProviderName } = require("./_lib/domain-client");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function positiveInt(input, fallback) {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return Number(fallback) || 1;
  return Math.floor(n);
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
  const domainName = clean(body.domainName || body.domain_name, 190).toLowerCase();
  if (!jobUuid || !accessToken) return json(400, { ok: false, error: "Missing dashboard access parameters" });
  if (!domainName) return json(400, { ok: false, error: "domainName is required" });

  const pool = getPool();
  try {
    await ensureLeadpageTables(pool);
    const access = await validateLeadpageClientAccess(pool, { jobUuid, accessToken });
    if (!access) return json(403, { ok: false, error: "Invalid dashboard access link" });

    const checkWindowSeconds = positiveInt(process.env.LEADPAGE_DOMAIN_CHECK_WINDOW_SECONDS, 120);
    const checkLimit = positiveInt(process.env.LEADPAGE_DOMAIN_CHECK_LIMIT_PER_WINDOW, 20);
    const checkCount = await countLeadpageEventsSince(pool, {
      jobUuid,
      eventType: "client_domain_checked",
      seconds: checkWindowSeconds,
    });
    if (checkCount >= checkLimit) {
      return json(429, {
        ok: false,
        error: "Too many domain availability checks. Please wait a bit and try again.",
      });
    }

    const job = await findLeadpageJobByUuid(pool, jobUuid);
    if (!job) return json(404, { ok: false, error: "Job not found" });

    const result = await checkAvailability({ domainName });
    await setLeadpageDomainState(pool, {
      jobUuid,
      domainStatus: result.available ? "available" : "unavailable",
      domainName,
      domainProvider: result.provider || selectedDomainProviderName(),
    });

    await appendLeadpageEvent(pool, {
      jobUuid,
      eventType: "client_domain_checked",
      eventNote: "Client checked domain availability",
      payload: {
        domainName,
        available: Boolean(result.available),
        provider: result.provider || selectedDomainProviderName(),
      },
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
