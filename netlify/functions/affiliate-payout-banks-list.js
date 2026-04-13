const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureAffiliateTables, listAffiliatePayoutBanks } = require("./_lib/affiliates");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureAffiliateTables(pool);

    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const result = await listAffiliatePayoutBanks(pool, {
      countryCode: "NG",
      currency: "NGN",
      payoutProvider: "paystack",
      includeMeta: true,
    });
    return json(200, {
      ok: true,
      banks: Array.isArray(result && result.banks) ? result.banks : [],
      meta: result && result.meta ? result.meta : null,
    });
  } catch (error) {
    return json(400, { ok: false, error: error.message || "Could not load payout banks" });
  }
};
