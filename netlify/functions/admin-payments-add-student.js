const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureManualPaymentsTable, createManualPayment, reviewManualPayment, markMainSynced, STATUS_APPROVED } = require("./_lib/manual-payments");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { syncBrevoSubscriber } = require("./_lib/brevo");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug, getCourseDefaultAmountMinor } = require("./_lib/course-config");
const { sendEmail } = require("./_lib/email");
const { siteBaseUrl } = require("./_lib/payments");
const { evaluateCouponForOrder, normalizeCouponCode } = require("./_lib/coupons");
const {
  ensureStudentAuthTables,
  findStudentByEmail,
  createStudentAccount,
  createPasswordResetToken,
} = require("./_lib/student-auth");
const ADMIN_ADD_MARKER = "[ADMIN_ADD_STUDENT]";

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
    `<p>This link expires in 1 hour.</p>`,
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
    "",
    "This link expires in 1 hour.",
  ].join("\n");
  return { html, text };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  try {
    await applyRuntimeSettings(getPool());
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const firstName = String(body.firstName || "").trim().slice(0, 160);
  const email = normalizeEmail(body.email);
  const country = String(body.country || "").trim().slice(0, 120);
  const adminNote = String(body.adminNote || "").trim().slice(0, 500);
  const proofUrl = String(body.proofUrl || "").trim();
  const proofPublicId = String(body.proofPublicId || "").trim().slice(0, 255);
  const courseSlug = normalizeCourseSlug(body.courseSlug, DEFAULT_COURSE_SLUG);
  const hasDiscount =
    body && (body.hasDiscount === true || String(body.hasDiscount || "").trim().toLowerCase() === "yes");
  const couponCode = normalizeCouponCode(body && body.couponCode);

  if (!firstName || !email) {
    return json(400, { ok: false, error: "Full Name and valid email are required" });
  }
  if (hasDiscount && !couponCode) {
    return json(400, { ok: false, error: "Select a valid discount code." });
  }

  const pool = getPool();

  try {
    await ensureManualPaymentsTable(pool);
    await ensureCourseOrdersBatchColumns(pool);
    await ensureCourseBatchesTable(pool);
    await ensureStudentAuthTables(pool);
    const batch = await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey });
    if (!batch) return json(500, { ok: false, error: "No active batch configured" });
    const baseAmountMinor = Number(batch.paystack_amount_minor || getCourseDefaultAmountMinor(courseSlug));
    const currency = "NGN";
    const pricing = {
      baseAmountMinor,
      discountMinor: 0,
      finalAmountMinor: baseAmountMinor,
      couponCode: "",
      couponId: null,
    };

    if (hasDiscount) {
      const evaluated = await evaluateCouponForOrder(
        pool,
        {
          couponCode,
          courseSlug,
          email,
          currency,
          baseAmountMinor,
        },
        { ignoreExpiry: true }
      );
      if (!evaluated || !evaluated.ok || !evaluated.pricing || !evaluated.coupon) {
        return json(400, { ok: false, error: (evaluated && evaluated.error) || "Invalid discount code." });
      }
      pricing.discountMinor = Number(evaluated.pricing.discountMinor || 0);
      pricing.finalAmountMinor = Number(evaluated.pricing.finalAmountMinor || baseAmountMinor);
      pricing.couponCode = String((evaluated.coupon && evaluated.coupon.code) || couponCode || "").trim().toUpperCase();
      pricing.couponId = Number((evaluated.coupon && evaluated.coupon.id) || 0) || null;
    }

    const [existingManual] = await pool.query(
      `SELECT id
       FROM course_manual_payments
       WHERE course_slug = ?
         AND batch_key = ?
         AND email = ?
         AND status = 'approved'
       ORDER BY id DESC
       LIMIT 1`,
      [courseSlug, batch.batch_key, email]
    );
    if (existingManual && existingManual.length) {
      return json(409, {
        ok: false,
        error: `This email already has an approved payment in ${batch.batch_label}.`,
      });
    }

    const [existingOrder] = await pool.query(
      `SELECT id
       FROM course_orders
       WHERE course_slug = ?
         AND batch_key = ?
         AND email = ?
         AND status = 'paid'
       ORDER BY id DESC
       LIMIT 1`,
      [courseSlug, batch.batch_key, email]
    );
    if (existingOrder && existingOrder.length) {
      return json(409, {
        ok: false,
        error: `This email already has a paid order in ${batch.batch_label}.`,
      });
    }

    const paymentUuid = await createManualPayment(pool, {
      courseSlug,
      batchKey: batch.batch_key,
      batchLabel: batch.batch_label,
      firstName,
      email,
      country,
      currency,
      amountMinor: pricing.finalAmountMinor,
      baseAmountMinor: pricing.baseAmountMinor,
      discountMinor: pricing.discountMinor,
      finalAmountMinor: pricing.finalAmountMinor,
      couponCode: pricing.couponCode || null,
      couponId: pricing.couponId,
      transferReference: "",
      proofUrl,
      proofPublicId,
    });

    const baseNote = `Added by admin as external bank payment (${batch.batch_label})`;
    const reviewNote = adminNote
      ? `${ADMIN_ADD_MARKER} ${baseNote}. Note: ${adminNote}`
      : `${ADMIN_ADD_MARKER} ${baseNote}`;
    await reviewManualPayment(pool, {
      paymentUuid,
      nextStatus: STATUS_APPROVED,
      reviewedBy: "admin",
      reviewNote,
    });
    await pool.query(
      `UPDATE course_manual_payments
       SET status = 'rejected',
           reviewed_by = 'admin',
           review_note = ?,
           reviewed_at = ?,
           updated_at = ?
       WHERE course_slug = ?
         AND batch_key = ?
         AND email = ?
         AND status = 'pending_verification'
         AND payment_uuid <> ?`,
      [
        `[ADMIN_ADD_STUDENT] Superseded by admin-added approved payment ${paymentUuid}.`,
        nowSql(),
        nowSql(),
        courseSlug,
        batch.batch_key,
        email,
        paymentUuid,
      ]
    );

    let createdAccount = false;
    let welcomeEmailSent = false;
    let account = await findStudentByEmail(pool, email);
    if (!account) {
      const tempPassword = randomPassword();
      account = await createStudentAccount(pool, {
        fullName: firstName,
        email,
        password: tempPassword,
        mustResetPassword: true,
      });
      createdAccount = !!(account && account.id);

      const reset = await createPasswordResetToken(pool, email);
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
          welcomeEmailSent = true;
        } catch (error) {
          console.warn("enrol_email_failed", {
            source: "admin-add-student",
            email,
            error: error && error.message ? error.message : String(error || "unknown error"),
          });
        }
      }
    }

    const synced = await syncBrevoSubscriber({ fullName: firstName, email, listId: batch.brevo_list_id || null });
    if (synced.ok) {
      await markMainSynced(pool, paymentUuid);
    }

    return json(200, {
      ok: true,
      paymentUuid,
      batchKey: batch.batch_key,
      batchLabel: batch.batch_label,
      flodeskMainSynced: !!synced.ok,
      accountCreated: createdAccount,
      welcomeEmailSent,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not add student" });
  }
};
