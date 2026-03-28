const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureCouponsTables, listCoupons } = require("./_lib/coupons");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();
  try {
    await ensureCouponsTables(pool);
    const items = await listCoupons(pool);
    return json(200, { ok: true, items });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load coupons" });
  }
};

