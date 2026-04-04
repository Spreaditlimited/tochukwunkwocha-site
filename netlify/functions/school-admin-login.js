const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const {
  ensureSchoolTables,
  verifySchoolAdminCredentials,
  createSchoolAdminSession,
  setSchoolAdminCookieHeader,
} = require("./_lib/schools");

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return json(400, { ok: false, error: "Email and password are required" });

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    const admin = await verifySchoolAdminCredentials(pool, { email, password });
    if (!admin || !admin.id) return json(401, { ok: false, error: "Invalid credentials" });
    const token = await createSchoolAdminSession(pool, Number(admin.id));
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie": setSchoolAdminCookieHeader(event, token),
      },
      body: JSON.stringify({ ok: true }),
    };
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not sign in." });
  }
};

