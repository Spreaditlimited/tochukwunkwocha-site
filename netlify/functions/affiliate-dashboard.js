const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureAffiliateTables, getAffiliateDashboard, matureAffiliateCommissions } = require("./_lib/affiliates");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureAffiliateTables(pool);
    await matureAffiliateCommissions(pool).catch(function () {
      return null;
    });

    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const result = await getAffiliateDashboard(pool, session.account.id);
    return json(200, {
      ok: true,
      account: {
        accountUuid: session.account.accountUuid,
        fullName: session.account.fullName,
        email: session.account.email,
      },
      affiliate: result,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load affiliate dashboard" });
  }
};
