const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureLeadpageTables, findLeadpageJobByUuid, setLeadpageDomainState } = require("./_lib/leadpage-jobs");
const { registerDomain, selectedDomainProviderName } = require("./_lib/domain-client");

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
  const years = Math.max(1, Math.min(Number(body.years) || 1, 10));
  if (!jobUuid) return json(400, { ok: false, error: "jobUuid is required" });
  if (!domainName) return json(400, { ok: false, error: "domainName is required" });

  const pool = getPool();
  try {
    await ensureLeadpageTables(pool);
    const job = await findLeadpageJobByUuid(pool, jobUuid);
    if (!job) return json(404, { ok: false, error: "Job not found" });

    await setLeadpageDomainState(pool, {
      jobUuid,
      domainStatus: "registration_in_progress",
      domainName,
      domainProvider: selectedDomainProviderName(),
    });

    const result = await registerDomain({ domainName, years });
    if (!result.success) {
      await setLeadpageDomainState(pool, {
        jobUuid,
        domainStatus: "registration_failed",
        domainName,
        domainProvider: result.provider || selectedDomainProviderName(),
        domainOrderId: result.orderId || "",
        domainPurchaseCurrency: result.currency || "",
        domainPurchaseAmountMinor: result.amountMinor,
      });
      return json(400, {
        ok: false,
        provider: result.provider || selectedDomainProviderName(),
        domainName,
        reason: result.reason || "registration_failed",
      });
    }

    await setLeadpageDomainState(pool, {
      jobUuid,
      domainStatus: "registered",
      domainName: result.domainName || domainName,
      domainProvider: result.provider || selectedDomainProviderName(),
      domainOrderId: result.orderId || "",
      domainPurchaseCurrency: result.currency || "",
      domainPurchaseAmountMinor: result.amountMinor,
      markPurchased: true,
    });

    return json(200, {
      ok: true,
      provider: result.provider || selectedDomainProviderName(),
      domainName: result.domainName || domainName,
      orderId: result.orderId || "",
      currency: result.currency || "USD",
      amountMinor: result.amountMinor,
      reason: result.reason || "registered",
    });
  } catch (error) {
    try {
      await setLeadpageDomainState(pool, {
        jobUuid,
        domainStatus: "registration_failed",
        domainName,
        domainProvider: selectedDomainProviderName(),
      });
    } catch (_inner) {}
    return json(500, { ok: false, error: error.message || "Could not register domain" });
  }
};
