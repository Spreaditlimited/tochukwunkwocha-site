const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureAffiliateTables, upsertAffiliateCourseRule } = require("./_lib/affiliates");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const pool = getPool();
  try {
    await ensureAffiliateTables(pool);
    const rule = await upsertAffiliateCourseRule(pool, {
      courseSlug: clean(body.courseSlug, 120),
      isAffiliateEligible: !!body.isAffiliateEligible,
      commissionType: clean(body.commissionType, 20).toLowerCase(),
      commissionValue: Number(body.commissionValue || 0),
      commissionCurrency: clean(body.commissionCurrency, 10).toUpperCase() || "NGN",
      minOrderAmountMinor: Number(body.minOrderAmountMinor || 0),
      holdDays: Number(body.holdDays || 0),
      startsAt: clean(body.startsAt, 30),
      endsAt: clean(body.endsAt, 30),
      updatedBy: "admin",
    });
    return json(200, { ok: true, rule });
  } catch (error) {
    return json(400, { ok: false, error: error.message || "Could not save affiliate rule" });
  }
};
