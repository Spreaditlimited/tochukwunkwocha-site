const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureAffiliateTables, sendAffiliatePayoutChangeOtp } = require("./_lib/affiliates");

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

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureAffiliateTables(pool);

    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const result = await sendAffiliatePayoutChangeOtp(pool, {
      accountId: session.account.id,
      accountEmail: session.account.email,
      accountFullName: session.account.fullName,
      countryCode: "NG",
      currency: "NGN",
      payoutProvider: "paystack",
      bankCode: clean(body.bankCode, 40),
      accountNumber: clean(body.accountNumber, 40),
    });
    return json(200, { ok: true, result });
  } catch (error) {
    return json(400, { ok: false, error: error.message || "Could not send verification code" });
  }
};
