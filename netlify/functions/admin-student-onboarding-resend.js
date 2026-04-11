const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { sendEmail } = require("./_lib/email");
const { siteBaseUrl } = require("./_lib/payments");
const {
  ensureStudentAuthTables,
  findStudentByEmail,
  createStudentAccount,
  createPasswordResetToken,
} = require("./_lib/student-auth");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 320);
}

function normalizeEmail(value) {
  const email = clean(value, 220).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function randomPassword() {
  return crypto.randomBytes(6).toString("base64url") + "A9!";
}

function displayNameFallback(email) {
  const local = String(email || "").split("@")[0] || "Student";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ") || "Student";
}

function buildFirstAccessEmail(input) {
  const fullName = clean(input && input.fullName, 160) || "there";
  const email = clean(input && input.email, 220);
  const tempPassword = clean(input && input.tempPassword, 120);
  const resetLink = clean(input && input.resetLink, 800);
  const html = [
    `<p>Hello ${fullName},</p>`,
    "<p>Your dashboard account has been created.</p>",
    `<p><strong>Email:</strong> ${email}<br/><strong>Temporary password:</strong> <code>${tempPassword}</code></p>`,
    "<p>Please reset your password using the link below before signing in:</p>",
    `<p><a href="${resetLink}">${resetLink}</a></p>`,
  ].join("\n");
  const text = [
    `Hello ${fullName},`,
    "",
    "Your dashboard account has been created.",
    `Email: ${email}`,
    `Temporary password: ${tempPassword}`,
    "",
    "Please reset your password using the link below before signing in:",
    resetLink,
  ].join("\n");
  return { html, text };
}

function buildResetOnlyEmail(input) {
  const fullName = clean(input && input.fullName, 160) || "there";
  const resetLink = clean(input && input.resetLink, 800);
  const html = [
    `<p>Hello ${fullName},</p>`,
    "<p>Here is your dashboard password reset link.</p>",
    `<p><a href="${resetLink}">${resetLink}</a></p>`,
    "<p>If you can no longer access your email, contact support.</p>",
  ].join("\n");
  const text = [
    `Hello ${fullName},`,
    "",
    "Here is your dashboard password reset link:",
    resetLink,
    "",
    "If you can no longer access your email, contact support.",
  ].join("\n");
  return { html, text };
}

async function findStudentContext(pool, input) {
  const paymentUuid = clean(input && input.paymentUuid, 80);
  const fallbackEmail = normalizeEmail(input && input.email);
  const fallbackName = clean(input && input.fullName, 180);

  if (paymentUuid) {
    const [orderRows] = await pool.query(
      `SELECT first_name, email
       FROM course_orders
       WHERE order_uuid = ?
       ORDER BY id DESC
       LIMIT 1`,
      [paymentUuid]
    );
    if (Array.isArray(orderRows) && orderRows.length) {
      const row = orderRows[0];
      return {
        email: normalizeEmail(row && row.email),
        fullName: clean(row && row.first_name, 180),
      };
    }

    const [manualRows] = await pool.query(
      `SELECT first_name, email
       FROM course_manual_payments
       WHERE payment_uuid = ?
       ORDER BY id DESC
       LIMIT 1`,
      [paymentUuid]
    );
    if (Array.isArray(manualRows) && manualRows.length) {
      const row = manualRows[0];
      return {
        email: normalizeEmail(row && row.email),
        fullName: clean(row && row.first_name, 180),
      };
    }
  }

  return {
    email: fallbackEmail,
    fullName: fallbackName,
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    const context = await findStudentContext(pool, body || {});
    const email = normalizeEmail(context && context.email);
    if (!email) return json(400, { ok: false, error: "A valid student email is required." });

    const providedName = clean(context && context.fullName, 180);
    let account = await findStudentByEmail(pool, email);
    let createdAccount = false;
    let tempPassword = "";
    const fullName = providedName || (account && clean(account.full_name, 180)) || displayNameFallback(email);

    if (!account) {
      tempPassword = randomPassword();
      account = await createStudentAccount(pool, {
        fullName,
        email,
        password: tempPassword,
        mustResetPassword: true,
      });
      createdAccount = true;
    }

    const reset = await createPasswordResetToken(pool, email, { neverExpires: true });
    if (!reset || !reset.token) {
      return json(500, { ok: false, error: "Could not generate password reset token." });
    }

    const resetLink = `${siteBaseUrl()}/dashboard/reset-password/?token=${encodeURIComponent(reset.token)}`;
    const mail = createdAccount
      ? buildFirstAccessEmail({ fullName, email, tempPassword, resetLink })
      : buildResetOnlyEmail({ fullName, resetLink });

    await sendEmail({
      to: email,
      subject: createdAccount
        ? "Your Dashboard Access (Password Reset Required)"
        : "Your Dashboard Password Reset Link",
      html: mail.html,
      text: mail.text,
    });

    return json(200, {
      ok: true,
      email,
      createdAccount,
      accountId: Number(account && account.id || 0) || null,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not resend onboarding email." });
  }
};

