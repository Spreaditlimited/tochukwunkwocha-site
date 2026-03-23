const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureStudentAuthTables,
  createStudentAccount,
  createStudentSession,
  setStudentCookieHeader,
} = require("./_lib/student-auth");

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
    const account = await createStudentAccount(pool, {
      fullName: body.fullName,
      email: body.email,
      password: body.password,
    });
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
    const msg = String(error && error.message ? error.message : "Could not create account");
    const conflict = /duplicate|unique|email/i.test(msg);
    return json(conflict ? 409 : 500, { ok: false, error: conflict ? "Email already exists" : msg });
  }
};
