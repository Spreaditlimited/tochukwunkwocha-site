const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const {
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

async function repairMissingSchoolLink(pool, admin) {
  const adminId = Number(admin && admin.id);
  const schoolId = Number(admin && admin.school_id);
  const email = String(admin && admin.email || "").trim().toLowerCase();
  if (!Number.isFinite(adminId) || adminId <= 0) return;
  if (Number.isFinite(schoolId) && schoolId > 0) return;
  if (!email) return;

  const [rows] = await pool.query(
    `SELECT school_id
     FROM school_orders
     WHERE admin_email = ?
       AND status = 'paid'
       AND school_id IS NOT NULL
     ORDER BY paid_at DESC, id DESC
     LIMIT 1`,
    [email]
  );
  const recoveredSchoolId = Number(rows && rows[0] && rows[0].school_id || 0);
  if (!Number.isFinite(recoveredSchoolId) || recoveredSchoolId <= 0) return;

  await pool.query(
    `UPDATE school_admins
     SET school_id = ?, is_active = 1, updated_at = NOW()
     WHERE id = ?
     LIMIT 1`,
    [recoveredSchoolId, adminId]
  );
  admin.school_id = recoveredSchoolId;
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
    const admin = await verifySchoolAdminCredentials(pool, { email, password });
    if (!admin || !admin.id) return json(401, { ok: false, error: "Invalid credentials" });
    await repairMissingSchoolLink(pool, admin);
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
