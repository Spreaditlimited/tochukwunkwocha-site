const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureAffiliateTables, runAffiliatePayoutBatch } = require("./_lib/affiliates");

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
    const result = await runAffiliatePayoutBatch(pool, {
      periodMode: clean(body.periodMode, 40),
      periodStart: clean(body.periodStart, 30),
      periodEnd: clean(body.periodEnd, 30),
      scheduledFor: clean(body.scheduledFor, 10),
      countryCode: clean(body.countryCode, 2) || "NG",
      currency: clean(body.currency, 10) || "NGN",
      payoutProvider: clean(body.payoutProvider, 40) || "paystack",
      initiatedBy: "admin",
    });
    return json(200, { ok: true, result });
  } catch (error) {
    return json(400, { ok: false, error: error.message || "Could not run payout batch" });
  }
};
