const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureStudentAuthTables,
  requireStudentSession,
  verifyStudentCredentials,
  setStudentPassword,
} = require("./_lib/user-auth");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  if (newPassword.length < 8) {
    return json(400, { ok: false, error: "New password must be at least 8 characters" });
  }
  if (currentPassword === newPassword) {
    return json(400, { ok: false, error: "New password must be different from current password" });
  }

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const account = await verifyStudentCredentials(pool, {
      email: session.account.email,
      password: currentPassword,
    });
    if (!account || Number(account.id || 0) !== Number(session.account.id || 0)) {
      return json(401, { ok: false, error: "Current password is incorrect" });
    }

    await setStudentPassword(pool, {
      accountId: Number(session.account.id),
      password: newPassword,
    });
    return json(200, { ok: true, message: "Password updated successfully." });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not change password" });
  }
};
