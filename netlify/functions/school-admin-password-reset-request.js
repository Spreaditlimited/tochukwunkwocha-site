const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { sendEmail } = require("./_lib/email");
const {
  createSchoolAdminPasswordResetToken,
} = require("./_lib/schools");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function siteBaseUrl() {
  return clean(process.env.SITE_BASE_URL || "https://tochukwunkwocha.com", 1000).replace(/\/$/, "");
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const email = clean(body.email, 220).toLowerCase();
  if (!email) return json(400, { ok: false, error: "Email is required" });

  const pool = getPool();
  try {
    const reset = await createSchoolAdminPasswordResetToken(pool, email);
    if (reset && reset.token) {
      const link = `${siteBaseUrl()}/schools/reset-password/?token=${encodeURIComponent(reset.token)}`;
      const html = [
        `<p>Hello ${clean(reset.fullName, 120) || "School Admin"},</p>`,
        "<p>Use the link below to reset your school dashboard password:</p>",
        `<p><a href="${link}">${link}</a></p>`,
      ].join("\n");
      const text = [
        `Hello ${clean(reset.fullName, 120) || "School Admin"},`,
        "",
        "Use the link below to reset your school dashboard password:",
        link,
      ].join("\n");
      try {
        await sendEmail({
          to: email,
          subject: "Reset Your School Dashboard Password",
          html,
          text,
        });
      } catch (_error) {}
    }

    return json(200, {
      ok: true,
      message: "If an account exists for this email, a reset link has been sent.",
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not start password reset." });
  }
};
