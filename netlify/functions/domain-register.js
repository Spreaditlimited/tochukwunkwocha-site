const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { checkAvailability, registerDomain, selectedDomainProviderName } = require("./_lib/domain-client");
const {
  normalizeDomain,
  normalizeSelectedServices,
  normalizeAutoRenew,
  ensureDomainTables,
  findDomainForAccount,
  createDomainOrder,
  markDomainOrder,
  upsertUserDomain,
  addYearsSql,
} = require("./_lib/domains");

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

  const domainName = normalizeDomain(body.domainName || body.domain_name);
  const years = Math.max(1, Math.min(Number(body.years) || 1, 10));
  const selectedServices = normalizeSelectedServices(body.selectedServices);
  const autoRenewEnabled = normalizeAutoRenew(body.autoRenewEnabled, true);
  if (!domainName) return json(400, { ok: false, error: "domainName is required" });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureDomainTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const accountId = Number(session.account.id);
    const email = String(session.account.email || "").trim().toLowerCase();

    const existing = await findDomainForAccount(pool, { accountId, domainName });
    if (existing && String(existing.status || "").toLowerCase() === "registered") {
      return json(200, {
        ok: true,
        alreadyOwned: true,
        domain: {
          domainName: existing.domain_name,
          provider: existing.provider,
          renewalDueAt: existing.renewal_due_at,
          purchaseCurrency: existing.purchase_currency,
          purchaseAmountMinor: Number(existing.purchase_amount_minor || 0) || null,
          providerOrderId: existing.provider_order_id || "",
        },
      });
    }

    const availability = await checkAvailability({ domainName });
    if (!availability.available) {
      return json(400, {
        ok: false,
        error: `${domainName} is not available.`,
        reason: availability.reason || "unavailable",
        provider: availability.provider || selectedDomainProviderName(),
      });
    }

    const orderUuid = await createDomainOrder(pool, {
      accountId,
      email,
      domainName,
      years,
      provider: availability.provider || selectedDomainProviderName(),
      status: "registration_in_progress",
      paymentProvider: "direct",
      paymentStatus: "paid",
      selectedServices,
      autoRenewEnabled,
    });

    const result = await registerDomain({ domainName, years });
    if (!result.success) {
      await markDomainOrder(pool, {
        orderUuid,
        status: "registration_failed",
        provider: result.provider || availability.provider || selectedDomainProviderName(),
        purchaseCurrency: result.currency || "USD",
        purchaseAmountMinor: result.amountMinor,
        providerOrderId: result.orderId || "",
        selectedServices,
        autoRenewEnabled,
        note: clean(result.reason || "registration_failed", 500),
        setRegisteredAt: false,
      });
      return json(400, {
        ok: false,
        error: "Domain registration failed. Please try another name.",
        reason: result.reason || "registration_failed",
      });
    }

    const provider = result.provider || availability.provider || selectedDomainProviderName();
    await markDomainOrder(pool, {
      orderUuid,
      status: "registered",
      provider,
      purchaseCurrency: result.currency || "USD",
      purchaseAmountMinor: result.amountMinor,
      providerOrderId: result.orderId || "",
      selectedServices,
      autoRenewEnabled,
      setRegisteredAt: true,
    });

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    await upsertUserDomain(pool, {
      accountId,
      email,
      domainName: result.domainName || domainName,
      provider,
      status: "registered",
      years,
      purchaseCurrency: result.currency || "USD",
      purchaseAmountMinor: result.amountMinor,
      providerOrderId: result.orderId || "",
      selectedServices,
      autoRenewEnabled,
      registeredAt: now,
      renewalDueAt: addYearsSql(now, years),
    });

    return json(200, {
      ok: true,
      orderUuid,
      domainName: result.domainName || domainName,
      provider,
      currency: result.currency || "USD",
      amountMinor: result.amountMinor,
      orderId: result.orderId || "",
      reason: result.reason || "registered",
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not register domain" });
  }
};
