const crypto = require("crypto");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { siteBaseUrl, paypalCaptureOrder } = require("./_lib/payments");
const { sendEmail } = require("./_lib/email");
const { markOrderPaidBy } = require("./_lib/orders");
const { getCourseLandingPath } = require("./_lib/course-config");
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

  const orderId = event.queryStringParameters && event.queryStringParameters.token;

  if (!orderId) {
    const fallbackPath = getCourseLandingPath("prompt-to-profit");
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}${fallbackPath}?payment=failed` },
      body: "",
    };
  }

  try {
    await paypalCaptureOrder(orderId);

    const result = await markOrderPaidBy({
      pool,
      provider: "paypal",
      providerOrderId: String(orderId),
      requestContext: { headers: event.headers || {} },
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
        const reset = await createPasswordResetToken(pool, result.email, { neverExpires: true });
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
              source: "paypal",
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

    const successCourseSlug = result && result.courseSlug ? result.courseSlug : "prompt-to-profit";
    const successParams = new URLSearchParams({
      payment: "success",
      course_slug: String(successCourseSlug || "prompt-to-profit"),
    });
    return {
      statusCode: 302,
      headers: {
        Location: `${siteBaseUrl()}/dashboard/courses/?${successParams.toString()}`,
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
