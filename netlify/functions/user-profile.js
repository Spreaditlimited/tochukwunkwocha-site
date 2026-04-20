const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    return json(200, {
      ok: true,
      profile: {
        accountUuid: session.account.accountUuid,
        fullName: session.account.fullName,
        email: session.account.email,
        certificateNameConfirmedAt: session.account.certificateNameConfirmedAt || null,
        certificateNameUpdatedAt: session.account.certificateNameUpdatedAt || null,
        certificateNameNeedsConfirmation: session.account.certificateNameNeedsConfirmation === true,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load profile" });
  }
};
