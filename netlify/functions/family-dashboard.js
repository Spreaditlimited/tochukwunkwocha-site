const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/student-auth");
const { listFamilyDashboard } = require("./_lib/families");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });
    const dashboard = await listFamilyDashboard(pool, Number(session.account.id));
    return json(200, {
      ok: true,
      account: {
        accountUuid: session.account.accountUuid,
        fullName: session.account.fullName,
        email: session.account.email,
      },
      family: dashboard.family,
      children: dashboard.children,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load family dashboard" });
  }
};
