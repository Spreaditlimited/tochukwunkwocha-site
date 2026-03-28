const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/student-auth");
const { ensureInstallmentTables, listPlansForAccount } = require("./_lib/installments");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureInstallmentTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const plans = await listPlansForAccount(pool, session.account.id);
    return json(200, {
      ok: true,
      account: {
        accountUuid: session.account.accountUuid,
        fullName: session.account.fullName,
        email: session.account.email,
      },
      plans: (plans || []).map((item) => ({
        planUuid: item.plan_uuid,
        courseSlug: item.course_slug,
        batchKey: item.batch_key,
        batchLabel: item.batch_label,
        currency: item.currency,
        baseAmountMinor: Number(item.base_amount_minor || item.target_amount_minor || 0),
        discountMinor: Number(item.discount_minor || 0),
        couponCode: item.coupon_code || null,
        targetAmountMinor: Number(item.target_amount_minor || 0),
        totalPaidMinor: Number(item.total_paid_minor || 0),
        status: item.status,
        enrolledOrderUuid: item.enrolled_order_uuid || null,
      })),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load session" });
  }
};
