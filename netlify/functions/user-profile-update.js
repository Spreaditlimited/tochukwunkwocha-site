const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureStudentAuthTables,
  requireStudentSession,
  updateStudentProfileName,
} = require("./_lib/user-auth");

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
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const account = await updateStudentProfileName(pool, {
      accountId: Number(session.account.id),
      fullName: body.fullName,
    });

    return json(200, {
      ok: true,
      profile: {
        accountUuid: account.accountUuid,
        fullName: account.fullName,
        email: account.email,
        certificateNameConfirmedAt: account.certificateNameConfirmedAt || null,
        certificateNameUpdatedAt: account.certificateNameUpdatedAt || null,
        certificateNameNeedsConfirmation: true,
      },
      message: "Profile updated. Please reconfirm your certificate name.",
    });
  } catch (error) {
    const message = String(error && error.message || "Could not update profile");
    const locked = message.toLowerCase().indexOf("confirmed and locked") !== -1;
    return json(locked ? 409 : 400, { ok: false, error: message });
  }
};
