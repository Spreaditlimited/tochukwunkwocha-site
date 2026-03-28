const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureCouponsTables, upsertCoupon } = require("./_lib/coupons");

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
    const coupon = await upsertCoupon(pool, {
      id: body.id,
      code: body.code,
      description: body.description,
      discountType: body.discountType,
      percentOff: body.percentOff,
      fixedNgnMinor: body.fixedNgnMinor,
      fixedGbpMinor: body.fixedGbpMinor,
      courseSlug: body.courseSlug,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      maxUses: body.maxUses,
      maxUsesPerEmail: body.maxUsesPerEmail,
      isActive: body.isActive,
    });
    return json(200, {
      ok: true,
      coupon,
      message: "Coupon saved",
    });
  } catch (error) {
    return json(400, { ok: false, error: error.message || "Could not save coupon" });
  }
};

