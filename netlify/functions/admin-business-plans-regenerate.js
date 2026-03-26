const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureBusinessPlanTables, listBusinessPlansForInternal } = require("./_lib/business-plans");
const { handler: generateBackgroundHandler } = require("./business-plan-generate-background");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const planUuid = clean(body.planUuid, 64);
  if (!planUuid) return json(400, { ok: false, error: "planUuid is required" });

  try {
    await ensureBusinessPlanTables(pool);
    const rows = await listBusinessPlansForInternal(pool, { status: "all" });
    const plan = (rows || []).find((row) => String(row.plan_uuid || "") === planUuid);
    if (!plan) return json(404, { ok: false, error: "Plan not found" });

    const reference = clean(plan.payment_reference, 120);
    if (!reference) return json(400, { ok: false, error: "No payment reference found for this plan" });

    const invokeEvent = {
      ...event,
      httpMethod: "POST",
      body: JSON.stringify({
        reference,
        forceRegenerate: true,
      }),
    };
    const regenResponse = await generateBackgroundHandler(invokeEvent);
    let regenJson = null;
    try {
      regenJson = regenResponse && regenResponse.body ? JSON.parse(regenResponse.body) : null;
    } catch (_error) {
      regenJson = null;
    }

    if (!regenResponse || Number(regenResponse.statusCode || 500) >= 400 || !regenJson || !regenJson.ok) {
      throw new Error((regenJson && regenJson.error) || "Could not regenerate business plan");
    }

    return json(200, {
      ok: true,
      planUuid: regenJson.planUuid || planUuid,
      verificationStatus: regenJson.verificationStatus || "awaiting_verification",
      regenerated: true,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not regenerate business plan" });
  }
};
