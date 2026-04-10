const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureDomainTables } = require("./_lib/domains");
const { findDomainOrderByUuid, processDomainRegistrationForOrder } = require("./_lib/domain-registration");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const orderUuid = clean(body && body.orderUuid, 72);
  if (!orderUuid) return json(400, { ok: false, error: "orderUuid is required" });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureDomainTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const order = await findDomainOrderByUuid(pool, orderUuid);
    if (!order) return json(404, { ok: false, error: "Order not found" });
    if (Number(order.account_id || 0) !== Number(session.account.id || 0)) {
      return json(403, { ok: false, error: "Unauthorized" });
    }

    const status = clean(order.status, 40).toLowerCase();
    if (status === "registered") return json(200, { ok: true, alreadyRegistered: true, orderUuid, domainName: order.domain_name });

    const result = await processDomainRegistrationForOrder(pool, orderUuid);
    console.info("[domain-registration-retry] result", {
      orderUuid,
      accountId: Number(session.account.id || 0),
      ok: !!result.ok,
      error: result.ok ? "" : String(result.error || ""),
    });
    if (!result.ok) {
      return json(200, {
        ok: true,
        orderUuid,
        domainName: order.domain_name,
        status: "registration_failed",
        message: result.error || "Domain registration could not be completed yet.",
      });
    }

    return json(200, {
      ok: true,
      orderUuid,
      domainName: result.domainName || order.domain_name,
      status: result.alreadyRegistered ? "registered" : "registered",
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not retry domain registration" });
  }
};
