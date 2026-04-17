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

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number.isFinite(fallback) ? Math.trunc(fallback) : 0;
  return Math.trunc(n);
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

function buildResetOnlyEmail({ fullName, resetLink, batchLabel }) {
  const safeName = String(fullName || "there").trim();
  const safeLink = String(resetLink || "").trim();
  const safeBatch = String(batchLabel || "your batch").trim();
  const html = [
    `<p>Hello ${safeName},</p>`,
    `<p>You are receiving this email because you are a <strong>${safeBatch}</strong> student and some earlier reset links expired before students could use them.</p>`,
    "<p>Your dashboard access is active.</p>",
    "<p>Use this new password reset link to set a new password and sign in:</p>",
    `<p><a href="${safeLink}">${safeLink}</a></p>`,
    "<p>If you already reset your password successfully, you can ignore this message.</p>",
    "<p>If you need help, reply to this email and our team will assist you.</p>",
  ].join("\n");
  const text = [
    `Hello ${safeName},`,
    "",
    `You are receiving this email because you are a ${safeBatch} student and some earlier reset links expired before students could use them.`,
    "",
    "Your dashboard access is active.",
    "Use this new password reset link to set a new password and sign in:",
    safeLink,
    "",
    "If you already reset your password successfully, you can ignore this message.",
    "If you need help, reply to this email and our team will assist you.",
  ].join("\n");
  return { html, text };
}

async function main() {
  const courseSlug = arg("course", "prompt-to-profit");
  const batchKey = arg("batch", "ptp-batch-2");
  const batchLabel = arg("batch-label", "Batch 2");
  const subjectOverride = arg("subject", "");
  const limit = Math.max(0, toInt(arg("limit", "0"), 0));
  const dryRun = hasFlag("dry-run");

  const pool = getPool();
  await ensureStudentAuthTables(pool);

  const [manualRows] = await pool.query(
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

  const [orderRows] = await pool.query(
    `SELECT LOWER(email) AS email, MAX(COALESCE(first_name, '')) AS full_name
     FROM course_orders
     WHERE course_slug = ?
       AND batch_key = ?
       AND status = 'paid'
       AND (provider IS NULL OR provider <> 'wallet_installment')
     GROUP BY LOWER(email)
     ORDER BY email ASC`,
    [courseSlug, batchKey]
  );

  const byEmail = new Map();
  (Array.isArray(manualRows) ? manualRows : []).forEach(function (row) {
    const email = String(row && row.email || "").trim().toLowerCase();
    const fullName = String(row && row.full_name || "").trim();
    if (!email) return;
    byEmail.set(email, { email, fullName, sources: ["manual"] });
  });
  (Array.isArray(orderRows) ? orderRows : []).forEach(function (row) {
    const email = String(row && row.email || "").trim().toLowerCase();
    const fullName = String(row && row.full_name || "").trim();
    if (!email) return;
    const existing = byEmail.get(email);
    if (existing) {
      if (!existing.fullName && fullName) existing.fullName = fullName;
      if (existing.sources.indexOf("order") === -1) existing.sources.push("order");
      return;
    }
    byEmail.set(email, { email, fullName, sources: ["order"] });
  });

  let targets = Array.from(byEmail.values()).sort(function (a, b) {
    return String(a.email).localeCompare(String(b.email));
  });
  if (limit > 0) targets = targets.slice(0, limit);

  if (!targets.length) {
    console.log(
      JSON.stringify({
        ok: true,
        courseSlug,
        batchKey,
        batchLabel,
        dryRun,
        sourceCounts: {
          manual: Array.isArray(manualRows) ? manualRows.length : 0,
          order: Array.isArray(orderRows) ? orderRows.length : 0,
          deduped: 0,
        },
        total: 0,
        sent: 0,
      })
    );
    return;
  }

  const summary = {
    ok: true,
    courseSlug,
    batchKey,
    batchLabel,
    dryRun,
    sourceCounts: {
      manual: Array.isArray(manualRows) ? manualRows.length : 0,
      order: Array.isArray(orderRows) ? orderRows.length : 0,
      deduped: targets.length,
    },
    total: targets.length,
    limitApplied: limit > 0 ? limit : null,
    preview: targets.slice(0, 12).map(function (item) { return item.email; }),
    createdAccounts: 0,
    welcomeSent: 0,
    resetOnlySent: 0,
    skippedNoReset: 0,
    failed: 0,
    failures: [],
  };

  for (const row of targets) {
    const email = String(row.email || "").trim().toLowerCase();
    const fullName = String(row.fullName || "").trim() || "Student";
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

        const reset = dryRun ? { token: "dry-run-token" } : await createPasswordResetToken(pool, email, { neverExpires: true });
        if (reset && reset.token) {
          if (!dryRun) {
            const resetLink = `${siteBaseUrl()}/dashboard/reset-password/?token=${encodeURIComponent(reset.token)}`;
            const mail = buildWelcomeEmail({ fullName, email, tempPassword, resetLink });
            await sendEmail({
              to: email,
              subject: subjectOverride || `Important: New Dashboard Access Link for ${batchLabel}`,
              html: mail.html,
              text: mail.text,
            });
          }
          summary.welcomeSent += 1;
        } else {
          summary.skippedNoReset += 1;
        }
      } else {
        const reset = dryRun ? { token: "dry-run-token" } : await createPasswordResetToken(pool, email, { neverExpires: true });
        if (reset && reset.token) {
          if (!dryRun) {
            const resetLink = `${siteBaseUrl()}/dashboard/reset-password/?token=${encodeURIComponent(reset.token)}`;
            const mail = buildResetOnlyEmail({
              fullName: existing.full_name || fullName,
              resetLink,
              batchLabel,
            });
            await sendEmail({
              to: email,
              subject: subjectOverride || `Important: New Password Reset Link for ${batchLabel}`,
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
