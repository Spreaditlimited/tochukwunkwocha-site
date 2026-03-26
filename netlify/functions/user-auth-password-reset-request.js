const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, createPasswordResetToken } = require("./_lib/user-auth");
const { sendEmail } = require("./_lib/email");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
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

  const email = clean(body.email, 190).toLowerCase();
  if (!email) return json(400, { ok: false, error: "Email is required" });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    const reset = await createPasswordResetToken(pool, email);
    if (reset && reset.token) {
      const link = `${siteBaseUrl()}/dashboard/reset-password/?token=${encodeURIComponent(reset.token)}`;
      const html = [
        `<p>Hello ${clean(reset.fullName, 120) || "there"},</p>`,
        `<p>Use the link below to reset your dashboard password:</p>`,
        `<p><a href="${link}">${link}</a></p>`,
        `<p>This link expires in 1 hour.</p>`,
      ].join("\n");
      const text = [
        `Hello ${clean(reset.fullName, 120) || "there"},`,
        "",
        "Use the link below to reset your dashboard password:",
        link,
        "",
        "This link expires in 1 hour.",
      ].join("\n");
      try {
        await sendEmail({
          to: email,
          subject: "Reset Your Dashboard Password",
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
    return json(500, { ok: false, error: error.message || "Could not start password reset" });
  }
};
