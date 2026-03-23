const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/student-auth");
const { ensureInstallmentTables, findPlanByUuidForAccount, createInstallmentPayment } = require("./_lib/installments");
const { paystackInitialize, paystackPublicKey, siteBaseUrl } = require("./_lib/payments");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const planUuid = String(body.planUuid || "").trim();
  const amountMinor = Number(body.amountMinor || 0);
  if (!planUuid) return json(400, { ok: false, error: "planUuid is required" });
  if (!Number.isFinite(amountMinor) || amountMinor < 100) return json(400, { ok: false, error: "Enter a valid amount" });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureInstallmentTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const plan = await findPlanByUuidForAccount(pool, { planUuid, accountId: session.account.id });
    if (!plan) return json(404, { ok: false, error: "Plan not found" });
    if (String(plan.status || "").toLowerCase() !== "open") return json(400, { ok: false, error: "Plan is not open" });

    const remaining = Math.max(0, Number(plan.target_amount_minor || 0) - Number(plan.total_paid_minor || 0));
    const safeAmount = Math.min(amountMinor, remaining > 0 ? remaining : amountMinor);
    if (!Number.isFinite(safeAmount) || safeAmount < 100) return json(400, { ok: false, error: "Amount is too small" });

    const paymentUuidSeed = planUuid.replace(/[^a-zA-Z0-9]/g, "").slice(-12);
    const reference = `IWP_${paymentUuidSeed}_${Date.now().toString().slice(-8)}`;

    const checkout = await paystackInitialize({
      email: session.account.email,
      amountMinor: safeAmount,
      reference,
      callbackUrl: `${siteBaseUrl()}/.netlify/functions/installment-paystack-return`,
      metadata: {
        installment_plan_uuid: plan.plan_uuid,
        account_uuid: session.account.accountUuid,
        course_slug: plan.course_slug,
        batch_key: plan.batch_key,
      },
    });

    await createInstallmentPayment(pool, {
      planId: plan.id,
      provider: "paystack",
      providerReference: checkout.providerReference || reference,
      currency: "NGN",
      amountMinor: safeAmount,
    });

    return json(200, {
      ok: true,
      checkoutUrl: checkout.checkoutUrl,
      accessCode: checkout.accessCode || null,
      publicKey: paystackPublicKey(),
      reference: checkout.providerReference || reference,
      amountMinor: safeAmount,
      email: session.account.email,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not create installment payment" });
  }
};
