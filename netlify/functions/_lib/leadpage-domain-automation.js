const {
  appendLeadpageEvent,
  setLeadpageDomainState,
} = require("./leadpage-jobs");
const {
  buildDomainCandidates,
  checkAvailabilityMany,
  registerDomain,
  selectedDomainProviderName,
} = require("./domain-client");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

async function runLeadpageDomainAutomation(pool, input) {
  const jobUuid = clean(input && input.jobUuid, 72);
  const trigger = clean((input && input.trigger) || "manual", 80) || "manual";
  const requestedBy = clean((input && input.requestedBy) || "system", 80) || "system";
  const job = input && input.job ? input.job : null;

  if (!jobUuid) throw new Error("jobUuid is required");
  if (!job) throw new Error("job is required");

  const domainStatus = clean(job.domain_status, 80).toLowerCase();
  if (domainStatus !== "needs_domain") {
    return {
      attempted: false,
      success: false,
      skipped: true,
      reason: "job_does_not_need_domain_purchase",
    };
  }

  await appendLeadpageEvent(pool, {
    jobUuid,
    eventType: "domain_automation_started",
    eventNote: `Domain automation started (${trigger})`,
    payload: {
      requestedBy,
      provider: selectedDomainProviderName(),
    },
  });

  const candidates = buildDomainCandidates({
    preferredName: job.domain_name,
    businessName: job.business_name,
    businessType: job.business_type,
    serviceOffer: job.service_offer,
    targetLocation: job.target_location,
    limit: 12,
  });
  if (!candidates.length) throw new Error("No domain candidates generated");

  const checks = await checkAvailabilityMany({ domainNames: candidates });
  const available = (checks || []).find((x) => x && x.available);

  if (!available) {
    await setLeadpageDomainState(pool, {
      jobUuid,
      domainStatus: "no_available_domain_found",
      domainProvider: selectedDomainProviderName(),
    });
    return {
      attempted: true,
      success: false,
      skipped: false,
      reason: "no_available_domain_found",
      provider: selectedDomainProviderName(),
      candidatesChecked: checks.length,
    };
  }

  await setLeadpageDomainState(pool, {
    jobUuid,
    domainStatus: "registration_in_progress",
    domainName: available.domainName,
    domainProvider: available.provider || selectedDomainProviderName(),
  });

  const registered = await registerDomain({ domainName: available.domainName, years: 1 });
  if (!registered.success) {
    await setLeadpageDomainState(pool, {
      jobUuid,
      domainStatus: "registration_failed",
      domainName: available.domainName,
      domainProvider: registered.provider || selectedDomainProviderName(),
      domainOrderId: registered.orderId || "",
      domainPurchaseCurrency: registered.currency || "",
      domainPurchaseAmountMinor: registered.amountMinor,
    });
    return {
      attempted: true,
      success: false,
      skipped: false,
      reason: registered.reason || "registration_failed",
      provider: registered.provider || selectedDomainProviderName(),
      domainName: available.domainName,
    };
  }

  await setLeadpageDomainState(pool, {
    jobUuid,
    domainStatus: "registered",
    domainName: registered.domainName || available.domainName,
    domainProvider: registered.provider || selectedDomainProviderName(),
    domainOrderId: registered.orderId || "",
    domainPurchaseCurrency: registered.currency || "",
    domainPurchaseAmountMinor: registered.amountMinor,
    markPurchased: true,
  });

  await appendLeadpageEvent(pool, {
    jobUuid,
    eventType: "domain_automation_completed",
    eventNote: `Domain automation completed (${trigger})`,
    payload: {
      requestedBy,
      provider: registered.provider || selectedDomainProviderName(),
      domainName: registered.domainName || available.domainName,
      orderId: registered.orderId || "",
    },
  });

  return {
    attempted: true,
    success: true,
    skipped: false,
    reason: "registered",
    provider: registered.provider || selectedDomainProviderName(),
    domainName: registered.domainName || available.domainName,
    orderId: registered.orderId || "",
    currency: registered.currency || "USD",
    amountMinor: registered.amountMinor,
  };
}

module.exports = {
  runLeadpageDomainAutomation,
};
