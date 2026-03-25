const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureLeadpageTables } = require("./_lib/leadpage-jobs");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureLeadpageTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const email = String(session.account.email || "").trim().toLowerCase();
    const [rows] = await pool.query(
      `SELECT job_uuid,
              business_name,
              status,
              payment_status,
              publish_status,
              created_at,
              updated_at,
              client_access_token
       FROM leadpage_jobs
       WHERE email = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [email]
    );

    const items = (rows || []).map(function (row) {
      const token = String(row.client_access_token || "").trim();
      return {
        jobUuid: row.job_uuid,
        businessName: row.business_name,
        status: row.status,
        paymentStatus: row.payment_status,
        publishStatus: row.publish_status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        dashboardUrl: token
          ? `/dashboard/project/index.html?job_uuid=${encodeURIComponent(row.job_uuid)}&access=${encodeURIComponent(token)}`
          : "",
      };
    });

    return json(200, {
      ok: true,
      account: {
        fullName: session.account.fullName,
        email: session.account.email,
      },
      items,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load lead projects" });
  }
};
