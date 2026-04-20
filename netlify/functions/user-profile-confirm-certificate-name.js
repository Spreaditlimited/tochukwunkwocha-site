const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureStudentAuthTables,
  requireStudentSession,
  confirmStudentCertificateName,
} = require("./_lib/user-auth");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    await confirmStudentCertificateName(pool, { accountId: Number(session.account.id) });
    return json(200, {
      ok: true,
      certificateNameConfirmedAt: new Date().toISOString(),
      message: "Certificate name confirmed.",
    });
  } catch (error) {
    const message = String(error && error.message || "Could not confirm certificate name");
    const locked = message.toLowerCase().indexOf("already been confirmed") !== -1;
    return json(locked ? 409 : 400, { ok: false, error: message });
  }
};
