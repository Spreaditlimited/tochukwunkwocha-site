const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureSchoolTables } = require("./_lib/schools");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}
    await ensureSchoolTables(pool);

    const [rows] = await pool.query(
      `SELECT
         sc.id,
         sc.school_name,
         sc.course_slug,
         sc.status,
         sc.seats_purchased,
         sc.price_per_student_minor,
         sc.vat_bps,
         sc.total_minor,
         sc.paid_at,
         sc.access_starts_at,
         sc.access_expires_at,
         sa.full_name AS admin_name,
         sa.email AS admin_email,
         (
           SELECT COUNT(*)
           FROM school_students ss
           WHERE ss.school_id = sc.id
             AND ss.status = 'active'
         ) AS seats_used,
         (
           SELECT COUNT(*)
           FROM school_students ss
           WHERE ss.school_id = sc.id
         ) AS students_total
       FROM school_accounts sc
       LEFT JOIN school_admins sa ON sa.school_id = sc.id AND sa.is_active = 1
       ORDER BY COALESCE(sc.paid_at, sc.created_at) DESC, sc.id DESC`
    );

    return json(200, {
      ok: true,
      schools: Array.isArray(rows) ? rows : [],
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load schools." });
  }
};

