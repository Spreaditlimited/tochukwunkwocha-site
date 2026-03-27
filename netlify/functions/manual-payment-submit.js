const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureManualPaymentsTable,
  createManualPayment,
  markPreSynced,
} = require("./_lib/manual-payments");
const { syncFlodeskPreEnrolSubscriber } = require("./_lib/flodesk");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug, getCourseDefaultAmountMinor } = require("./_lib/course-config");
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

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const firstName = String(body.firstName || "").trim().slice(0, 160);
  const email = normalizeEmail(body.email);
  const country = String(body.country || "").trim().slice(0, 120);
  const courseSlug = normalizeCourseSlug(body.courseSlug, DEFAULT_COURSE_SLUG);
  const transferReference = String(body.transferReference || "").trim().slice(0, 190);
  const proofUrl = String(body.proofUrl || "").trim();
  const proofPublicId = String(body.proofPublicId || "").trim().slice(0, 255);
  const currency = "NGN";

  if (!firstName || !email) {
    return json(400, { ok: false, error: "Full Name and valid email are required" });
  }

  if (!proofUrl || !/^https:\/\//i.test(proofUrl)) {
    return json(400, { ok: false, error: "Valid payment proof is required" });
  }

  const pool = getPool();

  try {
    await ensureManualPaymentsTable(pool);
    await ensureCourseBatchesTable(pool);
    const batch = await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey });
    if (!batch) return json(500, { ok: false, error: "No active batch configured" });
    const amountMinor = Number(batch.paystack_amount_minor || getCourseDefaultAmountMinor(courseSlug));

    const paymentUuid = await createManualPayment(pool, {
      courseSlug,
      batchKey: batch.batch_key,
      batchLabel: batch.batch_label,
      firstName,
      email,
      country,
      currency,
      amountMinor,
      transferReference,
      proofUrl,
      proofPublicId,
    });

    const synced = await syncFlodeskPreEnrolSubscriber({ firstName, email });
    if (synced.ok) {
      await markPreSynced(pool, paymentUuid);
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
      sessionToken = await createStudentSession(pool, account.id);
    }

    const payload = {
      ok: true,
      paymentUuid,
      pendingReview: true,
      flodeskPreSynced: !!synced.ok,
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
