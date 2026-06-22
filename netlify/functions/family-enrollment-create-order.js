const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { paystackInitialize, stripeCreateCheckoutSession, siteBaseUrl } = require("./_lib/payments");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { assertBatchHasCapacity } = require("./_lib/batch-capacity");
const { ensureLearningTables, findLearningCourseBySlug, normalizePaymentMethods } = require("./_lib/learning");
const { requireStudentSession } = require("./_lib/user-auth");
const {
  DEFAULT_COURSE_SLUG,
  normalizeCourseSlug,
  getCourseConfig,
  getCourseName,
  getCourseDefaultAmountMinor,
} = require("./_lib/course-config");
const {
  ensureFamilyTables,
  familyEnrollmentEnabledForCourse,
  groupEnrollmentBaseAmountMinor,
  normalizeFamilyPayload,
  consumeFamilySeatsForChildren,
  savePendingFamilyChildren,
} = require("./_lib/families");
const {
  grossUpStripeAmount,
  isNigeriaCountry,
  resolveStripeCurrency,
} = require("./_lib/installment-pricing");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function requiresExplicitBatchSelection(courseSlug) {
  return String(courseSlug || "").trim().toLowerCase() === "prompt-to-profit-holiday";
}

function resolveStripeBaseMinor({ learningCourse, courseSlug, currency }) {
  const cur = String(currency || "USD").toUpperCase();
  const slug = normalizeCourseSlug(courseSlug, DEFAULT_COURSE_SLUG);
  const fallbackMajor = {
    "prompt-to-profit": { GBP: 25, USD: 30, EUR: 25 },
    "prompt-to-production": { GBP: 100, USD: 150, EUR: 100 },
    "ai-for-everyday-business-owners": { GBP: 20, USD: 25, EUR: 20 },
    "prompt-to-profit-holiday": { GBP: 25, USD: 30, EUR: 25 },
  };
  const col = cur === "GBP" ? "price_gbp_minor" : (cur === "EUR" ? "price_eur_minor" : "price_usd_minor");
  const configured = Number(learningCourse && learningCourse[col]);
  const fallback = Number((fallbackMajor[slug] && (fallbackMajor[slug][cur] || fallbackMajor[slug].USD)) || 30) * 100;
  return Number.isFinite(configured) && configured > 0 ? Math.round(configured) : Math.round(fallback);
}

function priceConfig({ provider, country, courseSlug, batch, learningCourse, enrollmentMode, seatCount }) {
  const mode = String(enrollmentMode || "batch").trim().toLowerCase() === "immediate" ? "immediate" : "batch";
  const qty = Math.max(1, Math.round(Number(seatCount || 1)));
  const isStripe = provider === "stripe";
  const courseNgnMinor = Number(learningCourse && learningCourse.price_ngn_minor);
  const singlePaystackMinor = mode === "immediate"
    ? (Number.isFinite(courseNgnMinor) && courseNgnMinor > 0 ? Math.round(courseNgnMinor) : getCourseDefaultAmountMinor(courseSlug))
    : (Number.isFinite(courseNgnMinor) && courseNgnMinor > 0
      ? Math.round(courseNgnMinor)
      : Number((batch && batch.paystack_amount_minor) || getCourseDefaultAmountMinor(courseSlug)));
  if (provider !== "paystack" && !isStripe) throw new Error("Unsupported payment provider.");
  const currency = isStripe ? resolveStripeCurrency(country) : "NGN";
  const singleCourseMinor = isStripe
    ? resolveStripeBaseMinor({ learningCourse, courseSlug, currency })
    : singlePaystackMinor;
  const vatPercentRaw = Number(isStripe ? process.env.INTL_VAT_PERCENT : process.env.SITE_VAT_PERCENT);
  const vatPercent = Number.isFinite(vatPercentRaw) && vatPercentRaw >= 0 ? vatPercentRaw : (isStripe ? 20 : 7.5);
  const courseMinor = groupEnrollmentBaseAmountMinor(courseSlug, singleCourseMinor, qty);
  const vatMinor = Math.round((Math.max(0, Number(courseMinor || 0)) * vatPercent) / 100);
  const priceMinor = Math.max(0, Number(courseMinor || 0)) + vatMinor;
  if (isStripe) {
    const amountMinor = grossUpStripeAmount(priceMinor, currency);
    return {
      currency,
      baseAmountMinor: courseMinor,
      vatMinor,
      processingFeeMinor: amountMinor - priceMinor,
      amountMinor,
    };
  }
  const applicableAtPrice = Math.round(priceMinor * 0.015) + (priceMinor < 250000 ? 0 : 10000);
  const amountMinor = applicableAtPrice > 200000
    ? (priceMinor + 200000)
    : Math.ceil(((priceMinor + (priceMinor < 250000 ? 0 : 10000)) / (1 - 0.015)) + 1);
  return { currency: "NGN", baseAmountMinor: courseMinor, vatMinor, processingFeeMinor: amountMinor - priceMinor, amountMinor };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const pool = getPool();
  const session = await requireStudentSession(pool, event);
  if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

  const courseSlug = normalizeCourseSlug(body.courseSlug, DEFAULT_COURSE_SLUG);
  const country = clean(body.country || "Nigeria", 120) || "Nigeria";
  const provider = isNigeriaCountry(country) ? "paystack" : "stripe";
  const parentName = clean(session.account.fullName, 180);
  const parentEmail = clean(session.account.email, 220).toLowerCase();
  const parentPhone = clean(session.account.phone, 40);
  const family = normalizeFamilyPayload({
    familyEnrollment: true,
    children: body.children,
  }, "");

  if (!family.children.length) return json(400, { ok: false, error: "Add at least one learner." });
  if (!familyEnrollmentEnabledForCourse(courseSlug)) {
    return json(400, { ok: false, error: "Group enrollment is not available for this course." });
  }

  try {
    await applyRuntimeSettings(pool);
    await ensureLearningTables(pool);
    await ensureFamilyTables(pool);
    await ensureCourseOrdersBatchColumns(pool);
    await ensureCourseBatchesTable(pool);

    const learningCourse = await findLearningCourseBySlug(pool, courseSlug);
    if (!learningCourse) return json(400, { ok: false, error: "Unknown course. Please choose a valid course." });
    if (Number(learningCourse.is_enrollment_locked || 0) === 1) {
      return json(409, { ok: false, error: "Enrollment is currently locked for this course." });
    }
    const allowedMethods = normalizePaymentMethods(learningCourse && learningCourse.payment_methods).split(",");
    if (provider === "stripe" && allowedMethods.indexOf("stripe") === -1) allowedMethods.push("stripe");
    if (allowedMethods.indexOf(provider) === -1) {
      return json(400, { ok: false, error: "Selected payment method is not available for this course." });
    }

    const enrollmentMode = String(learningCourse && learningCourse.enrollment_mode || "batch").trim().toLowerCase() === "immediate"
      ? "immediate"
      : "batch";
    const batch = enrollmentMode === "batch"
      ? await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey })
      : null;
    if (enrollmentMode === "batch" && !batch) return json(500, { ok: false, error: "No active batch configured" });
    if (enrollmentMode === "batch" && requiresExplicitBatchSelection(courseSlug)) {
      const requestedBatchKey = clean(body.batchKey, 64);
      if (!requestedBatchKey) return json(400, { ok: false, error: "Please choose a batch." });
      if (String(batch.batch_key || "").toLowerCase() !== requestedBatchKey.toLowerCase()) {
        return json(400, { ok: false, error: "Selected batch is unavailable. Please choose another batch." });
      }
    }

    try {
      const consumed = await consumeFamilySeatsForChildren(pool, {
        parentAccountId: Number(session.account.id),
        parentName,
        parentEmail,
        parentPhone,
        courseSlug,
        batchKey: batch ? batch.batch_key : "",
        batchLabel: batch ? batch.batch_label : "",
        children: family.children,
      });
      return json(200, {
        ok: true,
        usedExistingSeats: true,
        created: Number(consumed.created || 0),
        seats: {
          purchased: Number(consumed.seatsPurchased || 0),
          used: Number(consumed.seatsUsed || 0),
          available: Math.max(0, Number(consumed.seatsPurchased || 0) - Number(consumed.seatsUsed || 0)),
        },
      });
    } catch (consumeError) {
      const msg = String(consumeError && consumeError.message || "");
      if (msg.indexOf("purchased seat") === -1) throw consumeError;
    }

    if (enrollmentMode === "batch" && batch) {
      const capacity = await assertBatchHasCapacity(pool, { courseSlug, batchKey: batch.batch_key });
      if (capacity && capacity.remainingSeats !== null && family.seatCount > capacity.remainingSeats) {
        return json(409, { ok: false, error: `Only ${capacity.remainingSeats} seats are left in this batch.` });
      }
    }

    const price = priceConfig({ provider, country, courseSlug, batch, learningCourse, enrollmentMode, seatCount: family.seatCount });
    const amountMinor = Number(price.amountMinor || 0);
    const orderUuid = crypto.randomUUID();
    const courseConfig = getCourseConfig(courseSlug);
    const prefix = String((batch && batch.paystack_reference_prefix) || (courseConfig && courseConfig.defaultPrefix) || "PTP").trim().toUpperCase();
    const reference = `${prefix}_${orderUuid.replace(/-/g, "").slice(0, 24)}`;

    await pool.query(
      `INSERT INTO course_orders
       (order_uuid, course_slug, first_name, email, phone, country, currency, amount_minor, base_amount_minor, discount_minor, final_amount_minor, provider, buyer_type, seat_count, status, batch_key, batch_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'family', ?, 'pending', ?, ?)`,
      [
        orderUuid,
        courseSlug,
        parentName,
        parentEmail,
        parentPhone || null,
        country,
        price.currency,
        amountMinor,
        Number(price.baseAmountMinor || amountMinor),
        amountMinor,
        provider,
        family.seatCount,
        batch ? batch.batch_key : null,
        batch ? batch.batch_label : null,
      ]
    );

    await savePendingFamilyChildren(pool, {
      sourceType: "course_order",
      sourceUuid: orderUuid,
      courseSlug,
      batchKey: batch ? batch.batch_key : null,
      batchLabel: batch ? batch.batch_label : null,
      children: family.children,
    });

    const metadata = {
        order_uuid: orderUuid,
        first_name: parentName,
        course_slug: courseSlug,
        batch_key: batch ? batch.batch_key : null,
        batch_label: batch ? batch.batch_label : null,
        buyer_type: "family",
        seat_count: family.seatCount,
    };
    const payment = provider === "stripe"
      ? await stripeCreateCheckoutSession({
          email: parentEmail,
          amountMinor,
          currency: price.currency,
          courseName: `${getCourseName(courseSlug)} group enrollment`,
          orderUuid,
          metadata,
          successUrl: `${siteBaseUrl()}/.netlify/functions/stripe-return?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${siteBaseUrl()}/dashboard/family/?payment=cancelled`,
        })
      : await paystackInitialize({
          email: parentEmail,
          amountMinor,
          reference,
          metadata,
          callbackUrl: `${siteBaseUrl()}/.netlify/functions/paystack-return`,
        });

    await pool.query(
      `UPDATE course_orders
       SET provider_reference = ?,
           provider_order_id = ?
       WHERE order_uuid = ?`,
      [payment.providerReference, payment.providerOrderId || null, orderUuid]
    );

    return json(200, {
      ok: true,
      orderUuid,
      provider,
      checkoutUrl: payment.checkoutUrl,
      pricing: {
        currency: price.currency,
        baseAmountMinor: Number(price.baseAmountMinor || amountMinor),
        finalAmountMinor: amountMinor,
        seatCount: family.seatCount,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not create group enrollment" });
  }
};
