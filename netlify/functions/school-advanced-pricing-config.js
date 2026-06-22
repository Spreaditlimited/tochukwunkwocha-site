const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  SCHOOL_ORDERS_TABLE,
  ensureSchoolTables,
  requireSchoolAdminSession,
  isNigeriaCountry,
  schoolsAdvancedPricingConfigForPool,
  schoolsAdvancedPricingForPool,
  schoolsAdvancedStripePricingForPool,
} = require("./_lib/schools");

async function resolveSchoolCountry(pool, schoolId) {
  const id = Number(schoolId || 0);
  if (!(id > 0)) return "Nigeria";
  const [rows] = await pool.query(
    `SELECT country
     FROM ${SCHOOL_ORDERS_TABLE}
     WHERE school_id = ?
       AND country IS NOT NULL
       AND country <> ''
     ORDER BY paid_at DESC, id DESC
     LIMIT 1`,
    [id]
  );
  const country = String(rows && rows[0] && rows[0].country || "").trim();
  return country || "Nigeria";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const seatCount = Number(event.queryStringParameters && event.queryStringParameters.seat_count || 0);
  const pool = getPool();
  await ensureSchoolTables(pool);
  const session = await requireSchoolAdminSession(pool, event);
  if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });
  const country = await resolveSchoolCountry(pool, session.admin.schoolId);
  const provider = isNigeriaCountry(country) ? "paystack" : "stripe";
  const config = await schoolsAdvancedPricingConfigForPool(pool);
  const safeSeatCount = Number.isFinite(seatCount) && seatCount > 0 ? seatCount : config.minSeats;
  const quote = provider === "stripe"
    ? await schoolsAdvancedStripePricingForPool(pool, safeSeatCount, country)
    : await schoolsAdvancedPricingForPool(pool, safeSeatCount);
  return json(200, {
    ok: true,
    provider,
    country,
    config,
    quote,
  });
};
