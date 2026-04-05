#!/usr/bin/env node

const crypto = require("crypto");
const { getPool } = require("../netlify/functions/_lib/db");
const { sendEmail } = require("../netlify/functions/_lib/email");
const { siteBaseUrl } = require("../netlify/functions/_lib/payments");
const {
  ensureStudentAuthTables,
  findStudentByEmail,
  createStudentAccount,
  createPasswordResetToken,
} = require("../netlify/functions/_lib/student-auth");

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  if (!hit) return fallback;
  return String(hit.slice(prefix.length) || "").trim();
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
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

function buildResetOnlyEmail({ fullName, resetLink }) {
  const safeName = String(fullName || "there").trim();
  const safeLink = String(resetLink || "").trim();
  const html = [
    `<p>Hello ${safeName},</p>`,
    "<p>Your dashboard access is active.</p>",
    "<p>Use this password reset link to set a new password and sign in:</p>",
    `<p><a href="${safeLink}">${safeLink}</a></p>`,
    "<p>This link expires in 1 hour.</p>",
  ].join("\n");
  const text = [
    `Hello ${safeName},`,
    "",
    "Your dashboard access is active.",
    "Use this password reset link to set a new password and sign in:",
    safeLink,
    "",
    "This link expires in 1 hour.",
  ].join("\n");
  return { html, text };
}

async function main() {
  const courseSlug = arg("course", "prompt-to-profit");
  const batchKey = arg("batch", "ptp-batch-2");
  const dryRun = hasFlag("dry-run");

  const pool = getPool();
  await ensureStudentAuthTables(pool);

  const [rows] = await pool.query(
    `SELECT LOWER(email) AS email, MAX(COALESCE(first_name, '')) AS full_name
     FROM course_manual_payments
     WHERE course_slug = ?
       AND batch_key = ?
       AND status = 'approved'
       AND reviewed_by = 'admin'
     GROUP BY LOWER(email)
     ORDER BY email ASC`,
    [courseSlug, batchKey]
  );

  const targets = Array.isArray(rows) ? rows : [];
  if (!targets.length) {
    console.log(JSON.stringify({ ok: true, courseSlug, batchKey, total: 0, sent: 0 }));
    return;
  }

  const summary = {
    ok: true,
    courseSlug,
    batchKey,
    dryRun,
    total: targets.length,
    createdAccounts: 0,
    welcomeSent: 0,
    resetOnlySent: 0,
    skippedNoReset: 0,
    failed: 0,
    failures: [],
  };

  for (const row of targets) {
    const email = String(row.email || "").trim().toLowerCase();
    const fullName = String(row.full_name || "").trim() || "Student";
    if (!email) continue;

    try {
      const existing = await findStudentByEmail(pool, email);
      if (!existing) {
        const tempPassword = randomPassword();
        if (!dryRun) {
          await createStudentAccount(pool, {
            fullName,
            email,
            password: tempPassword,
            mustResetPassword: true,
          });
        }
        summary.createdAccounts += 1;

        const reset = dryRun ? { token: "dry-run-token" } : await createPasswordResetToken(pool, email);
        if (reset && reset.token) {
          if (!dryRun) {
            const resetLink = `${siteBaseUrl()}/dashboard/reset-password/?token=${encodeURIComponent(reset.token)}`;
            const mail = buildWelcomeEmail({ fullName, email, tempPassword, resetLink });
            await sendEmail({
              to: email,
              subject: "Your Dashboard Access (Password Reset Required)",
              html: mail.html,
              text: mail.text,
            });
          }
          summary.welcomeSent += 1;
        } else {
          summary.skippedNoReset += 1;
        }
      } else {
        const reset = dryRun ? { token: "dry-run-token" } : await createPasswordResetToken(pool, email);
        if (reset && reset.token) {
          if (!dryRun) {
            const resetLink = `${siteBaseUrl()}/dashboard/reset-password/?token=${encodeURIComponent(reset.token)}`;
            const mail = buildResetOnlyEmail({ fullName: existing.full_name || fullName, resetLink });
            await sendEmail({
              to: email,
              subject: "Reset Your Dashboard Password",
              html: mail.html,
              text: mail.text,
            });
          }
          summary.resetOnlySent += 1;
        } else {
          summary.skippedNoReset += 1;
        }
      }
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        email,
        message: error && error.message ? error.message : "Unknown error",
      });
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error && error.message ? error.message : String(error || "unknown error"),
      },
      null,
      2
    )
  );
  process.exit(1);
});
