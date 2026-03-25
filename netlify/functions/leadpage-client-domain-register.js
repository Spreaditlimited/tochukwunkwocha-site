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
const { registerDomain, selectedDomainProviderName } = require("./_lib/domain-client");

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
  const years = Math.max(1, Math.min(Number(body.years) || 1, 10));
  if (!jobUuid || !accessToken) return json(400, { ok: false, error: "Missing dashboard access parameters" });
  if (!domainName) return json(400, { ok: false, error: "domainName is required" });

  const pool = getPool();
  try {
    await ensureLeadpageTables(pool);
    const access = await validateLeadpageClientAccess(pool, { jobUuid, accessToken });
    if (!access) return json(403, { ok: false, error: "Invalid dashboard access link" });

    const job = await findLeadpageJobByUuid(pool, jobUuid);
    if (!job) return json(404, { ok: false, error: "Job not found" });
    const paymentStatus = String(job.payment_status || "").toLowerCase();
    const intakeDomainStatus = String(job.domain_status || "").toLowerCase();
    if (paymentStatus !== "paid") {
      return json(400, { ok: false, error: "Domain registration is only available for paid projects." });
    }
    if (intakeDomainStatus === "has_domain") {
      return json(400, { ok: false, error: "This project already has a custom domain from intake. No purchase needed." });
    }
    if (intakeDomainStatus === "registered" && String(job.domain_name || "").toLowerCase() === domainName) {
      return json(200, {
        ok: true,
        provider: String(job.domain_provider || selectedDomainProviderName()),
        domainName,
        orderId: String(job.domain_order_id || ""),
        currency: String(job.domain_purchase_currency || "USD"),
        amountMinor: Number(job.domain_purchase_amount_minor || 0) || null,
        reason: "already_registered",
      });
    }
    if (intakeDomainStatus === "registration_in_progress") {
      return json(409, {
        ok: false,
        error: "Domain registration is already in progress for this project. Please wait.",
      });
    }
    if (intakeDomainStatus && intakeDomainStatus !== "needs_domain" && intakeDomainStatus !== "suggested_available" && intakeDomainStatus !== "available" && intakeDomainStatus !== "registration_failed" && intakeDomainStatus !== "suggestion_no_match" && intakeDomainStatus !== "unavailable") {
      return json(400, {
        ok: false,
        error: "Domain registration is only allowed for projects that requested a domain.",
      });
    }

    const registerWindowSeconds = positiveInt(process.env.LEADPAGE_DOMAIN_REGISTER_WINDOW_SECONDS, 900);
    const registerLimit = positiveInt(process.env.LEADPAGE_DOMAIN_REGISTER_LIMIT_PER_WINDOW, 2);
    const registerCount = await countLeadpageEventsSince(pool, {
      jobUuid,
      eventType: "client_domain_registered",
      seconds: registerWindowSeconds,
    });
    if (registerCount >= registerLimit) {
      return json(429, {
        ok: false,
        error: "Too many domain registration attempts. Please contact support before trying again.",
      });
    }

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

    await appendLeadpageEvent(pool, {
      jobUuid,
      eventType: "client_domain_registered",
      eventNote: "Client registered domain",
      payload: {
        domainName: result.domainName || domainName,
        orderId: result.orderId || "",
        provider: result.provider || selectedDomainProviderName(),
      },
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
