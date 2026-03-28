const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { evaluateCouponForOrder, normalizeCouponCode, ensureCouponsTables } = require("./_lib/coupons");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/student-auth");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const courseSlug = String(body.courseSlug || "prompt-to-profit").trim().slice(0, 120) || "prompt-to-profit";
  const couponCode = normalizeCouponCode(body.couponCode);
  if (!couponCode) return json(400, { ok: false, error: "Enter a valid coupon code." });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    await ensureCourseBatchesTable(pool);
    await ensureCouponsTables(pool);
    const batch = await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey });
    if (!batch) return json(404, { ok: false, error: "Batch not found" });

    const baseAmountMinor = Number(batch.paystack_amount_minor || 0);
    const rawSurcharge = Number(process.env.INSTALLMENT_SURCHARGE_PERCENT || "20");
    const surchargePercent = Number.isFinite(rawSurcharge) && rawSurcharge >= 0 ? rawSurcharge : 0;
    const installmentTotalMinor = Math.round(baseAmountMinor * (1 + surchargePercent / 100));

    const evaluated = await evaluateCouponForOrder(pool, {
      couponCode,
      courseSlug,
      email: session.account.email,
      currency: "NGN",
      baseAmountMinor: installmentTotalMinor,
    });
    if (!evaluated.ok) return json(400, { ok: false, error: evaluated.error || "Invalid coupon code." });

    return json(200, {
      ok: true,
      coupon: evaluated.coupon,
      pricing: evaluated.pricing,
      meta: {
        surchargePercent,
        batchKey: batch.batch_key,
        batchLabel: batch.batch_label,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not preview coupon" });
  }
};
