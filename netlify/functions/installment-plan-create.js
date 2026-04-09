const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/student-auth");
const { ensureInstallmentTables, findOpenPlan, createInstallmentPlan } = require("./_lib/installments");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { evaluateCouponForOrder, normalizeCouponCode, ensureCouponsTables } = require("./_lib/coupons");
const { getCoursePaymentLock } = require("./_lib/course-payment-lock");
const { ensureLearningTables, findLearningCourseBySlug } = require("./_lib/learning");

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

  const pool = getPool();
  try {
    await ensureLearningTables(pool);
    const learningCourse = await findLearningCourseBySlug(pool, courseSlug);
    if (!learningCourse) {
      return json(400, { ok: false, error: "Unknown course. Please choose a valid course." });
    }
    await ensureStudentAuthTables(pool);
    await ensureInstallmentTables(pool);
    await ensureCourseBatchesTable(pool);
    await ensureCouponsTables(pool);

    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const paymentLock = await getCoursePaymentLock(pool, {
      email: session.account.email,
      courseSlug,
    });
    if (paymentLock && paymentLock.locked) {
      return json(409, {
        ok: false,
        code: "payment_lock_active",
        reason: paymentLock.reason || "payment_lock",
        error:
          "You already have a payment record for this course. Installment plan start is disabled.",
      });
    }

    const batch = await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey });
    if (!batch) return json(404, { ok: false, error: "Batch not found" });

    const baseAmountMinor = Number(batch.paystack_amount_minor || 0);
    const rawSurcharge = Number(process.env.INSTALLMENT_SURCHARGE_PERCENT || "20");
    const surchargePercent = Number.isFinite(rawSurcharge) && rawSurcharge >= 0 ? rawSurcharge : 0;
    const baseTargetAmountMinor = Math.round(baseAmountMinor * (1 + surchargePercent / 100));
    let discountMinor = 0;
    let finalTargetAmountMinor = baseTargetAmountMinor;
    let couponId = null;
    let appliedCouponCode = "";

    if (couponCode) {
      const evaluated = await evaluateCouponForOrder(pool, {
        couponCode,
        courseSlug,
        email: session.account.email,
        currency: "NGN",
        baseAmountMinor: baseTargetAmountMinor,
      });
      if (!evaluated.ok) {
        return json(400, { ok: false, error: evaluated.error || "Invalid coupon code." });
      }
      discountMinor = Number(evaluated.pricing.discountMinor || 0);
      finalTargetAmountMinor = Number(evaluated.pricing.finalAmountMinor || baseTargetAmountMinor);
      couponId = evaluated.coupon ? Number(evaluated.coupon.id) : null;
      appliedCouponCode = String((evaluated.coupon && evaluated.coupon.code) || couponCode);
    }

    const existing = await findOpenPlan(pool, {
      accountId: session.account.id,
      courseSlug,
      batchKey: batch.batch_key,
    });
    if (existing) {
      return json(200, {
        ok: true,
        reused: true,
        plan: {
          planUuid: existing.plan_uuid,
          courseSlug: existing.course_slug,
          batchKey: existing.batch_key,
          batchLabel: existing.batch_label,
          currency: existing.currency,
          baseAmountMinor: Number(existing.base_amount_minor || existing.target_amount_minor || 0),
          discountMinor: Number(existing.discount_minor || 0),
          couponCode: existing.coupon_code || null,
          targetAmountMinor: Number(existing.target_amount_minor || 0),
          totalPaidMinor: Number(existing.total_paid_minor || 0),
          status: existing.status,
        },
      });
    }

    const created = await createInstallmentPlan(pool, {
      accountId: session.account.id,
      courseSlug,
      batchKey: batch.batch_key,
      batchLabel: batch.batch_label,
      currency: "NGN",
      targetAmountMinor: finalTargetAmountMinor,
      baseAmountMinor: baseTargetAmountMinor,
      discountMinor: discountMinor,
      couponCode: appliedCouponCode || null,
      couponId: couponId,
    });

    return json(200, {
      ok: true,
      reused: false,
      plan: {
        planUuid: created.plan_uuid,
        courseSlug: created.course_slug,
        batchKey: created.batch_key,
        batchLabel: created.batch_label,
        currency: created.currency,
        baseAmountMinor: Number(created.base_amount_minor || created.target_amount_minor || 0),
        discountMinor: Number(created.discount_minor || 0),
        couponCode: created.coupon_code || null,
        targetAmountMinor: Number(created.target_amount_minor || 0),
        totalPaidMinor: Number(created.total_paid_minor || 0),
        status: created.status,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not create plan" });
  }
};
