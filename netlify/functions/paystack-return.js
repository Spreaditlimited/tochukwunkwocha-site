const crypto = require("crypto");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { siteBaseUrl, paystackVerifyTransaction } = require("./_lib/payments");
const { sendEmail } = require("./_lib/email");
const { markOrderPaidBy } = require("./_lib/orders");
const { getCourseLandingPath, normalizeCourseSlug } = require("./_lib/course-config");
const {
  ensureStudentAuthTables,
  findStudentByEmail,
  createStudentAccount,
  createStudentSession,
  createPasswordResetToken,
  setStudentCookieHeader,
} = require("./_lib/student-auth");

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
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: "Method not allowed",
    };
  }

  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  const qs = event.queryStringParameters || {};
  const reference = String(qs.reference || qs.trxref || "").trim();

  if (!reference) {
    const fallbackPath = getCourseLandingPath("prompt-to-profit");
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}${fallbackPath}?payment=failed` },
      body: "",
    };
  }

  try {
    const tx = await paystackVerifyTransaction(reference);
    const status = String(tx.status || "").toLowerCase();

    if (status !== "success") {
      const txCourseSlug = normalizeCourseSlug(tx && tx.metadata && tx.metadata.course_slug, "prompt-to-profit");
      return {
        statusCode: 302,
        headers: { Location: `${siteBaseUrl()}${getCourseLandingPath(txCourseSlug)}?payment=failed` },
        body: "",
      };
    }

    const txCourseSlug = normalizeCourseSlug(tx && tx.metadata && tx.metadata.course_slug, "prompt-to-profit");
    const orderUuid = tx && tx.metadata && tx.metadata.order_uuid ? String(tx.metadata.order_uuid) : null;

    const result = await markOrderPaidBy({
      pool,
      provider: "paystack",
      providerReference: reference,
      providerOrderId: tx.id ? String(tx.id) : null,
      orderUuid,
    });

    let setCookie = "";
    if (result && result.email) {
      await ensureStudentAuthTables(pool);
      let account = await findStudentByEmail(pool, result.email);
      if (!account) {
        const tempPassword = randomPassword();
        const fullName = String(result.fullName || "Student").trim();
        account = await createStudentAccount(pool, {
          fullName,
          email: result.email,
          password: tempPassword,
          mustResetPassword: true,
        });
        const reset = await createPasswordResetToken(pool, result.email);
        if (reset && reset.token) {
          const link = `${siteBaseUrl()}/dashboard/reset-password/?token=${encodeURIComponent(reset.token)}`;
          const mail = buildWelcomeEmail({
            fullName,
            email: result.email,
            tempPassword,
            resetLink: link,
          });
          try {
            await sendEmail({
              to: result.email,
              subject: "Your Dashboard Access (Password Reset Required)",
              html: mail.html,
              text: mail.text,
            });
          } catch (error) {
            console.warn("enrol_email_failed", {
              source: "paystack",
              email: result.email,
              error: error && error.message ? error.message : String(error || "unknown error"),
            });
          }
        }
      }
      if (account && account.id) {
        const token = await createStudentSession(pool, account.id);
        setCookie = setStudentCookieHeader(event, token);
      }
    }

    return {
      statusCode: 302,
      headers: {
        Location: `${siteBaseUrl()}/dashboard/`,
        ...(setCookie ? { "Set-Cookie": setCookie } : {}),
      },
      body: "",
    };
  } catch (_error) {
    const fallbackPath = getCourseLandingPath("prompt-to-profit");
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}${fallbackPath}?payment=failed` },
      body: "",
    };
  }
};
