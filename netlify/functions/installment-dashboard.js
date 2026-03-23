const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/student-auth");
const { ensureInstallmentTables, listPlansForAccount, listPaymentsForPlan } = require("./_lib/installments");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureInstallmentTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const plans = await listPlansForAccount(pool, session.account.id);
    const out = [];
    for (const plan of plans) {
      const payments = await listPaymentsForPlan(pool, plan.id);
      out.push({
        planUuid: plan.plan_uuid,
        courseSlug: plan.course_slug,
        batchKey: plan.batch_key,
        batchLabel: plan.batch_label,
        currency: plan.currency,
        targetAmountMinor: Number(plan.target_amount_minor || 0),
        totalPaidMinor: Number(plan.total_paid_minor || 0),
        remainingMinor: Math.max(0, Number(plan.target_amount_minor || 0) - Number(plan.total_paid_minor || 0)),
        status: plan.status,
        enrolledOrderUuid: plan.enrolled_order_uuid || null,
        canEnrolNow:
          Number(plan.target_amount_minor || 0) > 0 &&
          Number(plan.total_paid_minor || 0) >= Number(plan.target_amount_minor || 0) &&
          String(plan.status || "").toLowerCase() === "open",
        payments: (payments || []).map((p) => ({
          paymentUuid: p.payment_uuid,
          provider: p.provider,
          providerReference: p.provider_reference,
          currency: p.currency,
          amountMinor: Number(p.amount_minor || 0),
          status: p.status,
          paidAt: p.paid_at,
          createdAt: p.created_at,
        })),
      });
    }

    return json(200, {
      ok: true,
      account: {
        accountUuid: session.account.accountUuid,
        fullName: session.account.fullName,
        email: session.account.email,
      },
      plans: out,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load dashboard" });
  }
};
