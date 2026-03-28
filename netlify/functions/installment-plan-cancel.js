const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/student-auth");
const {
  ensureInstallmentTables,
  findPlanByUuidForAccount,
  cancelPlanIfUnpaid,
} = require("./_lib/installments");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const planUuid = String(body.planUuid || "").trim();
  if (!planUuid) return json(400, { ok: false, error: "planUuid is required" });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureInstallmentTables(pool);

    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const plan = await findPlanByUuidForAccount(pool, { planUuid, accountId: session.account.id });
    if (!plan) return json(404, { ok: false, error: "Plan not found" });

    const cancelled = await cancelPlanIfUnpaid(pool, { planId: plan.id });
    if (!cancelled.ok) {
      return json(400, {
        ok: false,
        code: "cancel_not_allowed",
        error: cancelled.error || "Plan cannot be cancelled",
      });
    }

    return json(200, { ok: true, planUuid });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not cancel plan" });
  }
};
