const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureCouponsTables, extendCouponValidity } = require("./_lib/coupons");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const pool = getPool();
  try {
    await ensureCouponsTables(pool);
    const coupon = await extendCouponValidity(pool, {
      id: body.id,
      code: body.code,
      extendMinutes: body.extendMinutes,
      endsAt: body.endsAt,
    });
    return json(200, { ok: true, coupon, message: "Coupon validity extended" });
  } catch (error) {
    return json(400, { ok: false, error: error.message || "Could not extend coupon validity" });
  }
};
