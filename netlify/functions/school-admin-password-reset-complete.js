const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  consumeSchoolAdminPasswordResetToken,
  createSchoolAdminSession,
  setSchoolAdminCookieHeader,
} = require("./_lib/schools");

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
    const admin = await consumeSchoolAdminPasswordResetToken(pool, { token, password });
    const sessionToken = await createSchoolAdminSession(pool, Number(admin.id));
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": setSchoolAdminCookieHeader(event, sessionToken),
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        ok: true,
        admin: {
          id: admin.id,
          email: admin.email,
          fullName: admin.fullName,
        },
      }),
    };
  } catch (error) {
    return json(400, { ok: false, error: error.message || "Could not reset password." });
  }
};
