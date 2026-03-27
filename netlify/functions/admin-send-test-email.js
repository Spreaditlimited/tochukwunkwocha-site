const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { sendEmail } = require("./_lib/email");

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

  const to = String(body.to || "").trim();
  if (!to) return json(400, { ok: false, error: "Recipient email is required" });

  try {
    await sendEmail({
      to,
      subject: "SMTP Test — Tochukwu Nkwocha",
      html: "<p>This is a test email from your Tochukwu Nkwocha site.</p>",
      text: "This is a test email from your Tochukwu Nkwocha site.",
    });
    return json(200, { ok: true, message: "Test email sent" });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not send test email" });
  }
};
