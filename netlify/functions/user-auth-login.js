const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureStudentAuthTables,
  verifyStudentCredentials,
  createStudentSession,
  setStudentCookieHeader,
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
    const account = await verifyStudentCredentials(pool, {
      email: body.email,
      password: body.password,
    });
    if (!account) return json(401, { ok: false, error: "Invalid email or password" });
    if (Number(account.must_reset_password || 0) === 1) {
      return json(403, {
        ok: false,
        code: "PASSWORD_RESET_REQUIRED",
        error: "Password reset required before sign in",
      });
    }
    const token = await createStudentSession(pool, account.id);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": setStudentCookieHeader(event, token),
      },
      body: JSON.stringify({
        ok: true,
        account: {
          accountUuid: account.account_uuid,
          fullName: account.full_name,
          email: account.email,
        },
      }),
    };
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not sign in" });
  }
};
