const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureDomainTables, listUserDomains, listDomainOrders } = require("./_lib/domains");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureDomainTables(pool);

    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const accountId = Number(session.account.id);
    const domains = await listUserDomains(pool, { accountId, limit: 200 });
    const orders = await listDomainOrders(pool, { accountId, limit: 60 });

    return json(200, {
      ok: true,
      account: {
        accountUuid: session.account.accountUuid,
        fullName: session.account.fullName,
        email: session.account.email,
      },
      domains: (domains || []).map((row) => ({
        domainName: row.domain_name,
        provider: row.provider,
        status: row.status,
        years: Number(row.years || 1),
        purchaseCurrency: row.purchase_currency,
        purchaseAmountMinor: Number(row.purchase_amount_minor || 0) || null,
        providerOrderId: row.provider_order_id,
        registeredAt: row.registered_at,
        renewalDueAt: row.renewal_due_at,
        lastSyncedAt: row.last_synced_at,
      })),
      orders: (orders || []).map((row) => ({
        orderUuid: row.order_uuid,
        domainName: row.domain_name,
        years: Number(row.years || 1),
        provider: row.provider,
        status: row.status,
        paymentProvider: row.payment_provider,
        paymentStatus: row.payment_status,
        purchaseCurrency: row.purchase_currency,
        purchaseAmountMinor: Number(row.purchase_amount_minor || 0) || null,
        providerOrderId: row.provider_order_id,
        notes: row.notes,
        registeredAt: row.registered_at,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load domains" });
  }
};
