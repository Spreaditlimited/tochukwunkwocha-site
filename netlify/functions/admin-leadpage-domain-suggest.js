const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLeadpageTables,
  findLeadpageJobByUuid,
  appendLeadpageEvent,
  setLeadpageDomainState,
} = require("./_lib/leadpage-jobs");
const { buildDomainCandidates, checkAvailabilityMany, selectedDomainProviderName } = require("./_lib/domain-client");

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
  const preferredName = clean(body.preferredName || body.preferred_name, 160);
  const limit = Math.max(3, Math.min(Number(body.limit) || 10, 20));
  if (!jobUuid) return json(400, { ok: false, error: "jobUuid is required" });

  const pool = getPool();
  try {
    await ensureLeadpageTables(pool);
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
      eventType: "domain_suggestions_generated",
      eventNote: "Generated domain suggestions",
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
