const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const {
  ensureManualPaymentsTable,
  createManualPayment,
} = require("./_lib/manual-payments");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { assertBatchHasCapacity } = require("./_lib/batch-capacity");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug, getCourseDefaultAmountMinor } = require("./_lib/course-config");
const { ensureLearningTables, findLearningCourseBySlug, normalizePaymentMethods } = require("./_lib/learning");
const { ensureCouponsTables, evaluateCouponForOrder, normalizeCouponCode } = require("./_lib/coupons");
const { sendEmail } = require("./_lib/email");
const { siteBaseUrl } = require("./_lib/payments");
const {
  ensureStudentAuthTables,
  findStudentByEmail,
  createStudentAccount,
  createStudentSession,
  createPasswordResetToken,
  setStudentCookieHeader,
} = require("./_lib/student-auth");
const {
  ensureAffiliateTables,
  recordAffiliateAttribution,
} = require("./_lib/affiliates");
const { upsertWhatsAppContact } = require("./_lib/whatsapp-marketing");
const {
  ensureFamilyTables,
  familyEnrollmentEnabledForCourse,
  groupEnrollmentBaseAmountMinor,
  normalizeFamilyPayload,
  savePendingFamilyChildren,
} = require("./_lib/families");

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return ok ? email : "";
}

function randomPassword() {
  return crypto.randomBytes(6).toString("base64url") + "A9!";
}

function buildWelcomeEmail({ fullName, email, tempPassword, resetLink }) {
  const safeName = String(fullName || "there").trim();
  const safeEmail = String(email || "").trim();
  const safePass = String(tempPassword || "").trim();
  const safeLink = String(resetLink || "").trim();
  const html = [
    `<p>Hello ${safeName},</p>`,
    `<p>Your dashboard account has been created.</p>`,
    `<p><strong>Email:</strong> ${safeEmail}<br/><strong>Temporary password:</strong> <code>${safePass}</code></p>`,
    `<p>Please reset your password using the link below (required before you can sign in):</p>`,
    `<p><a href="${safeLink}">${safeLink}</a></p>`,
  ].join("\n");
  const text = [
    `Hello ${safeName},`,
    "",
    "Your dashboard account has been created.",
    `Email: ${safeEmail}`,
    `Temporary password: ${safePass}`,
    "",
    "Please reset your password using the link below (required before you can sign in):",
    safeLink,
  ].join("\n");
  return { html, text };
}

function requiresExplicitBatchSelection(courseSlug) {
  return String(courseSlug || "").trim().toLowerCase() === "prompt-to-profit-holiday";
}

function vatPercentFromSettings() {
  const raw = Number(process.env.SITE_VAT_PERCENT);
  return Number.isFinite(raw) && raw >= 0 ? raw : 7.5;
}

function manualPaymentAmountMinor(courseSlug, learningCourse, seatCount) {
  const courseNgnMinor = Number(learningCourse && learningCourse.price_ngn_minor);
  const standardCourseMinor = Number.isFinite(courseNgnMinor) && courseNgnMinor > 0
    ? Math.round(courseNgnMinor)
    : getCourseDefaultAmountMinor(courseSlug);
  const courseMinor = groupEnrollmentBaseAmountMinor(courseSlug, standardCourseMinor, seatCount);
  const vatMinor = Math.round((courseMinor * vatPercentFromSettings()) / 100);
  return courseMinor + vatMinor;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const firstName = String(body.firstName || "").trim().slice(0, 160);
  const email = normalizeEmail(body.email);
  const phone = String(body.phone || "").trim().slice(0, 40);
  const whatsappOptIn = body.whatsappOptIn === true;
  const optInTextVersion = String(body.optInTextVersion || "enrollment_whatsapp_v1").trim().slice(0, 80);
  const country = String(body.country || "").trim().slice(0, 120);
  const courseSlug = normalizeCourseSlug(body.courseSlug, DEFAULT_COURSE_SLUG);
  const couponCode = normalizeCouponCode(body.couponCode);
  const transferReference = String(body.transferReference || "").trim().slice(0, 190);
  const proofUrl = String(body.proofUrl || "").trim();
  const proofPublicId = String(body.proofPublicId || "").trim().slice(0, 255);
  const currency = "NGN";
  const affiliateCode = String(body.affiliateCode || body.affiliate_code || "").trim().toUpperCase().slice(0, 40);
  const family = normalizeFamilyPayload(body, firstName);

  if (!firstName || !email || !phone) {
    return json(400, { ok: false, error: "Full Name, valid email, and WhatsApp phone number are required" });
  }
  if (family.isFamily && !familyEnrollmentEnabledForCourse(courseSlug)) {
    return json(400, { ok: false, error: "Family enrollment is not available for this course." });
  }

  if (!proofUrl || !/^https:\/\//i.test(proofUrl)) {
    return json(400, { ok: false, error: "Valid payment proof is required" });
  }

  const pool = getPool();

  try {
    await applyRuntimeSettings(pool);
    await ensureLearningTables(pool);
    await ensureFamilyTables(pool);
    const learningCourse = await findLearningCourseBySlug(pool, courseSlug);
    if (!learningCourse) {
      return json(400, { ok: false, error: "Unknown course. Please choose a valid course." });
    }
    if (Number(learningCourse.is_enrollment_locked || 0) === 1) {
      return json(409, { ok: false, error: "Enrollment is currently locked for this course." });
    }
    const allowedMethods = normalizePaymentMethods(learningCourse && learningCourse.payment_methods).split(",");
    if (allowedMethods.indexOf("manual_transfer") === -1) {
      return json(400, { ok: false, error: "Manual transfer is not enabled for this course." });
    }
    await ensureManualPaymentsTable(pool);
    await ensureAffiliateTables(pool);
    await ensureCourseBatchesTable(pool);
    await ensureCouponsTables(pool);
    const enrollmentMode = String(learningCourse && learningCourse.enrollment_mode || "batch").trim().toLowerCase() === "immediate"
      ? "immediate"
      : "batch";
    const batch = enrollmentMode === "batch"
      ? await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey })
      : null;
    if (enrollmentMode === "batch" && !batch) return json(500, { ok: false, error: "No active batch configured" });
    if (enrollmentMode === "batch" && requiresExplicitBatchSelection(courseSlug)) {
      const requestedBatchKey = String(body.batchKey || "").trim();
      if (!requestedBatchKey) {
        return json(400, { ok: false, error: "Please choose a batch before submitting payment proof." });
      }
      if (String(batch.batch_key || "").toLowerCase() !== requestedBatchKey.toLowerCase()) {
        return json(400, { ok: false, error: "Selected batch is unavailable. Please choose another batch." });
      }
    }
    if (enrollmentMode === "batch" && batch) {
      const capacity = await assertBatchHasCapacity(pool, { courseSlug, batchKey: batch.batch_key });
      if (capacity && capacity.remainingSeats !== null && family.seatCount > capacity.remainingSeats) {
        return json(409, { ok: false, error: `Only ${capacity.remainingSeats} seats are left in this batch.` });
      }
    }
    const baseAmountMinor = manualPaymentAmountMinor(courseSlug, learningCourse, family.seatCount);
    let pricing = {
      currency: "NGN",
      baseAmountMinor,
      discountMinor: 0,
      finalAmountMinor: baseAmountMinor,
      couponCode: "",
      couponId: null,
    };

    if (couponCode) {
      const evaluated = await evaluateCouponForOrder(pool, {
        couponCode,
        courseSlug,
        email,
        currency: "NGN",
        baseAmountMinor,
      });
      if (!evaluated.ok) return json(400, { ok: false, error: evaluated.error || "Invalid coupon code." });
      pricing = {
        currency: "NGN",
        baseAmountMinor: Number(evaluated.pricing.baseAmountMinor || baseAmountMinor),
        discountMinor: Number(evaluated.pricing.discountMinor || 0),
        finalAmountMinor: Number(evaluated.pricing.finalAmountMinor || baseAmountMinor),
        couponCode: String((evaluated.coupon && evaluated.coupon.code) || couponCode),
        couponId: evaluated.coupon ? Number(evaluated.coupon.id) : null,
      };
    }

    const paymentUuid = await createManualPayment(pool, {
      courseSlug,
      batchKey: batch ? batch.batch_key : null,
      batchLabel: batch ? batch.batch_label : "Immediate Access",
      firstName,
      email,
      phone,
      country,
      currency,
      amountMinor: pricing.finalAmountMinor,
      baseAmountMinor: pricing.baseAmountMinor,
      discountMinor: pricing.discountMinor,
      finalAmountMinor: pricing.finalAmountMinor,
      couponCode: pricing.couponCode,
      couponId: pricing.couponId,
      transferReference,
      proofUrl,
      proofPublicId,
      buyerType: family.isFamily ? "family" : "student",
      seatCount: family.seatCount,
    });

    if (family.isFamily) {
      await savePendingFamilyChildren(pool, {
        sourceType: "manual_payment",
        sourceUuid: paymentUuid,
        courseSlug,
        batchKey: batch ? batch.batch_key : null,
        batchLabel: batch ? batch.batch_label : null,
        children: family.children,
      });
    }

    if (affiliateCode) {
      await recordAffiliateAttribution(pool, {
        orderUuid: paymentUuid,
        courseSlug,
        affiliateCode,
        buyerEmail: email,
        buyerCountry: country || "Nigeria",
        buyerCurrency: currency,
        orderAmountMinor: pricing.finalAmountMinor,
        requestHeaders: event && event.headers ? event.headers : {},
      }).catch(function () {
        return null;
      });
    }

    if (whatsappOptIn) {
      await upsertWhatsAppContact(pool, {
        email,
        fullName: firstName,
        phone,
        courseSlug,
        source: "manual_enrollment",
        optedIn: true,
        optInVersion: optInTextVersion,
      }).catch(function (error) {
        console.error("manual_whatsapp_contact_upsert_failed", error && error.message ? error.message : error);
      });
    }

    await ensureStudentAuthTables(pool);
    let account = await findStudentByEmail(pool, email);
    if (!account) {
      const tempPassword = randomPassword();
      account = await createStudentAccount(pool, {
        fullName: firstName,
        email,
        password: tempPassword,
        mustResetPassword: true,
      });
      const reset = await createPasswordResetToken(pool, email, { neverExpires: true });
      if (reset && reset.token) {
        try {
          const link = `${siteBaseUrl()}/dashboard/reset-password/?token=${encodeURIComponent(reset.token)}`;
          const mail = buildWelcomeEmail({
            fullName: firstName,
            email,
            tempPassword,
            resetLink: link,
          });
          await sendEmail({
            to: email,
            subject: "Your Dashboard Access (Password Reset Required)",
            html: mail.html,
            text: mail.text,
          });
        } catch (error) {
          console.warn("enrol_email_failed", {
            source: "manual-payment",
            email,
            error: error && error.message ? error.message : String(error || "unknown error"),
          });
        }
      }
    }
    let sessionToken = "";
    if (account && account.id) {
      sessionToken = await createStudentSession(pool, account.id, {
        event,
        enforceDeviceLimit: false,
      });
    }

    const payload = {
      ok: true,
      paymentUuid,
      pendingReview: true,
      flodeskPreSynced: false,
    };

    if (sessionToken) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": setStudentCookieHeader(event, sessionToken),
          "Cache-Control": "no-store",
        },
        body: JSON.stringify(payload),
      };
    }

    return json(200, payload);
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not submit manual payment" });
  }
};
