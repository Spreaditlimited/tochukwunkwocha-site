const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureVerifierAccountsTable, createVerifierAccount } = require("./_lib/verifier-accounts");
const { sendEmail } = require("./_lib/email");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function siteBaseUrl() {
  return String(process.env.SITE_BASE_URL || "https://tochukwunkwocha.com").trim().replace(/\/$/, "");
}

function buildVerifierOnboardingEmail(input) {
  const fullName = clean(input.fullName, 120) || "there";
  const email = clean(input.email, 190);
  const password = String(input.password || "");
  const loginUrl = `${siteBaseUrl()}/internal/verifier/`;
  const html = [
    `<p>Hello ${fullName},</p>`,
    `<p>Your verifier account has been created on Tochukwu Nkwocha internal dashboard.</p>`,
    `<p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a><br/>`,
    `<strong>Email:</strong> ${email}<br/>`,
    `<strong>Temporary password:</strong> <code>${password}</code></p>`,
    `<p>You are required to reset this password on first login before you can continue.</p>`,
  ].join("\n");
  const text = [
    `Hello ${fullName},`,
    "",
    "Your verifier account has been created on Tochukwu Nkwocha internal dashboard.",
    `Login URL: ${loginUrl}`,
    `Email: ${email}`,
    `Temporary password: ${password}`,
    "You are required to reset this password on first login before you can continue.",
  ].join("\n");
  return { html, text };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  try {
    await ensureVerifierAccountsTable(pool);
    const rawPassword = String(body.password || "");
    const row = await createVerifierAccount(pool, {
      fullName: body.fullName,
      email: body.email,
      password: rawPassword,
      createdBy: "admin",
    });
    if (row && row.email) {
      const mail = buildVerifierOnboardingEmail({
        fullName: row.full_name,
        email: row.email,
        password: rawPassword,
      });
      await sendEmail({
        to: row.email,
        subject: "Your Verifier Account Login Details",
        html: mail.html,
        text: mail.text,
      });
    }
    return json(200, {
      ok: true,
      item: row
        ? {
            verifierUuid: row.verifier_uuid,
            fullName: row.full_name,
            email: row.email,
            isActive: Number(row.is_active || 0) === 1,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastLoginAt: row.last_login_at,
          }
        : null,
    });
  } catch (error) {
    const message = String(error && error.message ? error.message : "Could not create verifier");
    const conflict = /duplicate|unique|email/i.test(message);
    return json(conflict ? 409 : 500, { ok: false, error: conflict ? "Verifier email already exists" : message });
  }
};
