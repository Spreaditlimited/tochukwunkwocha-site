const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { paystackInitialize } = require("./_lib/payments");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { assertBatchHasCapacity } = require("./_lib/batch-capacity");
const { ensureLearningTables, findLearningCourseBySlug, normalizePaymentMethods } = require("./_lib/learning");
const { requireStudentSession } = require("./_lib/user-auth");
const {
  DEFAULT_COURSE_SLUG,
  normalizeCourseSlug,
  getCourseConfig,
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

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function requiresExplicitBatchSelection(courseSlug) {
  return String(courseSlug || "").trim().toLowerCase() === "prompt-to-profit-holiday";
}

function priceConfig({ provider, courseSlug, batch, learningCourse, enrollmentMode, seatCount }) {
  const mode = String(enrollmentMode || "batch").trim().toLowerCase() === "immediate" ? "immediate" : "batch";
  const qty = Math.max(1, Math.round(Number(seatCount || 1)));
  const courseNgnMinor = Number(learningCourse && learningCourse.price_ngn_minor);
  const singleCourseMinor = mode === "immediate"
    ? (Number.isFinite(courseNgnMinor) && courseNgnMinor > 0 ? Math.round(courseNgnMinor) : getCourseDefaultAmountMinor(courseSlug))
    : (Number.isFinite(courseNgnMinor) && courseNgnMinor > 0
      ? Math.round(courseNgnMinor)
      : Number((batch && batch.paystack_amount_minor) || getCourseDefaultAmountMinor(courseSlug)));
  if (provider !== "paystack") throw new Error("Only Paystack is supported.");
  const vatPercentRaw = Number(process.env.SITE_VAT_PERCENT);
  const vatPercent = Number.isFinite(vatPercentRaw) && vatPercentRaw >= 0 ? vatPercentRaw : 7.5;
  const courseMinor = groupEnrollmentBaseAmountMinor(courseSlug, singleCourseMinor, qty);
  const vatMinor = Math.round((Math.max(0, Number(courseMinor || 0)) * vatPercent) / 100);
  const priceMinor = Math.max(0, Number(courseMinor || 0)) + vatMinor;
  const applicableAtPrice = Math.round(priceMinor * 0.015) + (priceMinor < 250000 ? 0 : 10000);
  const amountMinor = applicableAtPrice > 200000
    ? (priceMinor + 200000)
    : Math.ceil(((priceMinor + (priceMinor < 250000 ? 0 : 10000)) / (1 - 0.015)) + 1);
  return { currency: "NGN", amountMinor };
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
  const provider = "paystack";
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
    if (allowedMethods.indexOf(provider) === -1) {
      return json(400, { ok: false, error: "Paystack is not available for this course." });
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

    const price = priceConfig({ provider, courseSlug, batch, learningCourse, enrollmentMode, seatCount: family.seatCount });
    const amountMinor = Number(price.amountMinor || 0);
    const orderUuid = crypto.randomUUID();
    const courseConfig = getCourseConfig(courseSlug);
    const prefix = String((batch && batch.paystack_reference_prefix) || (courseConfig && courseConfig.defaultPrefix) || "PTP").trim().toUpperCase();
    const reference = `${prefix}_${orderUuid.replace(/-/g, "").slice(0, 24)}`;

    await pool.query(
      `INSERT INTO course_orders
       (order_uuid, course_slug, first_name, email, phone, country, currency, amount_minor, base_amount_minor, discount_minor, final_amount_minor, provider, buyer_type, seat_count, status, batch_key, batch_label)
       VALUES (?, ?, ?, ?, ?, ?, 'NGN', ?, ?, 0, ?, ?, 'family', ?, 'pending', ?, ?)`,
      [
        orderUuid,
        courseSlug,
        parentName,
        parentEmail,
        parentPhone || null,
        null,
        amountMinor,
        amountMinor,
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

    const payment = await paystackInitialize({
      email: parentEmail,
      amountMinor,
      reference,
      metadata: {
        order_uuid: orderUuid,
        first_name: parentName,
        course_slug: courseSlug,
        batch_key: batch ? batch.batch_key : null,
        batch_label: batch ? batch.batch_label : null,
        buyer_type: "family",
        seat_count: family.seatCount,
      },
    });

    await pool.query(
      `UPDATE course_orders
       SET provider_reference = ?
       WHERE order_uuid = ?`,
      [payment.providerReference, orderUuid]
    );

    return json(200, {
      ok: true,
      orderUuid,
      checkoutUrl: payment.checkoutUrl,
      pricing: {
        currency: "NGN",
        finalAmountMinor: amountMinor,
        seatCount: family.seatCount,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not create group enrollment" });
  }
};
