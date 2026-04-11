const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureStudentAuthTables,
  consumePasswordResetToken,
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

  const token = String(body.token || "").trim();
  const password = String(body.password || "");
  if (!token || password.length < 8) {
    return json(400, { ok: false, error: "Valid token and password (8+ chars) are required" });
  }

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    const account = await consumePasswordResetToken(pool, { token, password });
    const sessionToken = await createStudentSession(pool, account.id, {
      event,
      enforceDeviceLimit: true,
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": setStudentCookieHeader(event, sessionToken),
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        ok: true,
        account: {
          id: account.id,
          email: account.email,
          fullName: account.fullName,
        },
      }),
    };
  } catch (error) {
    if (error && error.code === "DEVICE_LIMIT_EXCEEDED") {
      return json(Number(error.statusCode || 429), { ok: false, code: error.code, error: error.message || "Device limit reached" });
    }
    return json(400, { ok: false, error: error.message || "Could not reset password" });
  }
};
