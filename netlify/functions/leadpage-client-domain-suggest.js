const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureLeadpageTables,
  validateLeadpageClientAccess,
  findLeadpageJobByUuid,
  appendLeadpageEvent,
  setLeadpageDomainState,
  countLeadpageEventsSince,
} = require("./_lib/leadpage-jobs");
const { buildDomainCandidates, checkAvailabilityMany, selectedDomainProviderName } = require("./_lib/domain-client");

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
  const preferredName = clean(body.preferredName || body.preferred_name, 160);
  const limit = Math.max(3, Math.min(Number(body.limit) || 10, 20));
  if (!jobUuid || !accessToken) return json(400, { ok: false, error: "Missing dashboard access parameters" });

  const pool = getPool();
  try {
    await ensureLeadpageTables(pool);
    const access = await validateLeadpageClientAccess(pool, { jobUuid, accessToken });
    if (!access) return json(403, { ok: false, error: "Invalid dashboard access link" });

    const suggestWindowSeconds = positiveInt(process.env.LEADPAGE_DOMAIN_SUGGEST_WINDOW_SECONDS, 120);
    const suggestLimit = positiveInt(process.env.LEADPAGE_DOMAIN_SUGGEST_LIMIT_PER_WINDOW, 8);
    const suggestCount = await countLeadpageEventsSince(pool, {
      jobUuid,
      eventType: "client_domain_suggestions_generated",
      seconds: suggestWindowSeconds,
    });
    if (suggestCount >= suggestLimit) {
      return json(429, {
        ok: false,
        error: "Too many domain suggestion attempts. Please wait a bit and try again.",
      });
    }

    const job = await findLeadpageJobByUuid(pool, jobUuid);
    if (!job) return json(404, { ok: false, error: "Job not found" });

    const candidates = buildDomainCandidates({
      preferredName,
      businessName: job.business_name,
      businessType: job.business_type,
      serviceOffer: job.service_offer,
      targetLocation: job.target_location,
      limit,
    });
    const availability = await checkAvailabilityMany({ domainNames: candidates });
    const firstAvailable = (availability || []).find((x) => x && x.available) || null;
    const actualProvider =
      (availability && availability[0] && availability[0].provider) || selectedDomainProviderName();

    await appendLeadpageEvent(pool, {
      jobUuid,
      eventType: "client_domain_suggestions_generated",
      eventNote: "Client generated domain suggestions",
      payload: {
        provider: actualProvider,
        candidates: (availability || []).slice(0, 10).map((x) => ({
          domainName: x.domainName,
          available: Boolean(x.available),
        })),
      },
    });

    if (firstAvailable && firstAvailable.domainName) {
      await setLeadpageDomainState(pool, {
        jobUuid,
        domainStatus: "suggested_available",
        domainName: firstAvailable.domainName,
        domainProvider: actualProvider,
      });
    } else {
      await setLeadpageDomainState(pool, {
        jobUuid,
        domainStatus: "suggestion_no_match",
        domainProvider: actualProvider,
      });
    }

    return json(200, {
      ok: true,
      provider: actualProvider,
      suggestions: availability || [],
      firstAvailable: firstAvailable ? firstAvailable.domainName : "",
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not suggest domains" });
  }
};
