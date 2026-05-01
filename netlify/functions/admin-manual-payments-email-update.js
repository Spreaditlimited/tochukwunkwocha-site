const { json, badMethod } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { ensureManualPaymentsTable, findManualPaymentByUuid, markMainSynced } = require("./_lib/manual-payments");
const { ensureStudentAuthTables, findStudentByEmail, createStudentAccount, createPasswordResetToken } = require("./_lib/student-auth");
const { resolveCourseBatch } = require("./_lib/batch-store");
const { syncBrevoSubscriber } = require("./_lib/brevo");
const { sendMetaPurchase } = require("./_lib/meta");
const { sendEmail } = require("./_lib/email");
const { siteBaseUrl } = require("./_lib/payments");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function randomPassword() {
  return require("crypto").randomBytes(6).toString("base64url") + "A9!";
}

function buildWelcomeEmail(input) {
  const fullName = clean(input && input.fullName, 180) || "there";
  const email = clean(input && input.email, 220);
  const tempPassword = clean(input && input.tempPassword, 120);
  const resetLink = clean(input && input.resetLink, 1000);
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
  const fullName = clean(input && input.fullName, 180) || "there";
  const resetLink = clean(input && input.resetLink, 1000);
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

  const paymentUuid = String(body.paymentUuid || "").trim();
  const newEmail = normalizeEmail(body.newEmail);
  if (!paymentUuid) return json(400, { ok: false, error: "Missing paymentUuid" });
  if (!newEmail) return json(400, { ok: false, error: "Enter a valid new email address." });

  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  try {
    await ensureManualPaymentsTable(pool);
    await ensureStudentAuthTables(pool);
    const payment = await findManualPaymentByUuid(pool, paymentUuid);
    if (!payment) return json(404, { ok: false, error: "Manual payment not found" });

    const currentEmail = normalizeEmail(payment.email);
    if (!currentEmail) return json(400, { ok: false, error: "Current payment email is invalid." });
    if (currentEmail === newEmail) {
      return json(400, { ok: false, error: "New email is the same as current email." });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [conflictRows] = await connection.query(
        `SELECT id
         FROM course_manual_payments
         WHERE course_slug = ?
           AND (batch_key <=> ?)
           AND email = ?
           AND status = 'approved'
           AND payment_uuid <> ?
         LIMIT 1`,
        [String(payment.course_slug || ""), payment.batch_key || null, newEmail, paymentUuid]
      );
      if (Array.isArray(conflictRows) && conflictRows.length) {
        throw new Error("This email already has an approved manual enrollment for this batch.");
      }

      const [oldAccountRows] = await connection.query(
        `SELECT id
         FROM student_accounts
         WHERE email = ?
         LIMIT 1`,
        [currentEmail]
      );
      const oldAccountId = Number(oldAccountRows && oldAccountRows[0] && oldAccountRows[0].id || 0);

      if (oldAccountId > 0) {
        const [newAccountRows] = await connection.query(
          `SELECT id
           FROM student_accounts
           WHERE email = ?
           LIMIT 1`,
          [newEmail]
        );
        if (Array.isArray(newAccountRows) && newAccountRows.length) {
          throw new Error("Another student account already uses this email.");
        }

        await connection.query(
          `UPDATE student_accounts
           SET email = ?, updated_at = ?
           WHERE id = ?
           LIMIT 1`,
          [newEmail, nowSql(), oldAccountId]
        );

        await connection.query(
          `UPDATE school_students
           SET email = ?, updated_at = ?
           WHERE account_id = ?`,
          [newEmail, nowSql(), oldAccountId]
        );
      }

      await connection.query(
        `UPDATE course_manual_payments
         SET email = ?, updated_at = ?
         WHERE payment_uuid = ?
         LIMIT 1`,
        [newEmail, nowSql(), paymentUuid]
      );

      await connection.commit();
    } catch (error) {
      try {
        await connection.rollback();
      } catch (_rollbackError) {}
      throw error;
    } finally {
      connection.release();
    }

    const refreshed = await findManualPaymentByUuid(pool, paymentUuid);

    let account = await findStudentByEmail(pool, newEmail);
    let accountCreated = false;
    let createdTempPassword = "";
    let onboardingEmailSent = false;
    let onboardingEmailType = "";

    if (!account) {
      const tempPassword = randomPassword();
      account = await createStudentAccount(pool, {
        fullName: clean((refreshed && refreshed.first_name) || payment.first_name, 180) || "Student",
        email: newEmail,
        password: tempPassword,
        mustResetPassword: true,
      });
      accountCreated = !!(account && account.id);
      createdTempPassword = tempPassword;
    }

    try {
      const reset = await createPasswordResetToken(pool, newEmail, { neverExpires: true });
      if (reset && reset.token) {
        const link = `${siteBaseUrl()}/dashboard/reset-password/?token=${encodeURIComponent(reset.token)}`;
        const createdNow = accountCreated === true;
        const mail = createdNow
          ? buildWelcomeEmail({
              fullName: clean((refreshed && refreshed.first_name) || payment.first_name, 180) || "Student",
              email: newEmail,
              tempPassword: createdTempPassword,
              resetLink: link,
            })
          : buildResetOnlyEmail({
              fullName: clean((refreshed && refreshed.first_name) || payment.first_name, 180) || "Student",
              resetLink: link,
            });
        await sendEmail({
          to: newEmail,
          subject: createdNow
            ? "Your Dashboard Access (Password Reset Required)"
            : "Your Dashboard Password Reset Link",
          html: mail.html,
          text: mail.text,
        });
        onboardingEmailSent = true;
        onboardingEmailType = createdNow ? "welcome" : "reset_only";
      }
    } catch (_error) {}

    let brevoSynced = false;
    try {
      const batch = await resolveCourseBatch(pool, {
        courseSlug: refreshed && refreshed.course_slug,
        batchKey: refreshed && refreshed.batch_key,
      });
      const synced = await syncBrevoSubscriber({
        fullName: clean((refreshed && refreshed.first_name) || payment.first_name, 180) || "Student",
        email: newEmail,
        listId: batch && batch.brevo_list_id ? batch.brevo_list_id : "",
      });
      brevoSynced = !!(synced && synced.ok);
      if (brevoSynced) await markMainSynced(pool, paymentUuid);
    } catch (_error) {}

    let metaSent = false;
    try {
      const sent = await sendMetaPurchase({
        eventId: `ptp_${paymentUuid}_email_fix_${Date.now()}`,
        email: newEmail,
        value: Number((refreshed && refreshed.amount_minor) || payment.amount_minor || 0) / 100,
        currency: (refreshed && refreshed.currency) || payment.currency || "NGN",
        contentName: (refreshed && refreshed.course_slug) || payment.course_slug || "Course",
        contentIds: [(refreshed && refreshed.course_slug) || payment.course_slug || "course"],
      });
      metaSent = !!(sent && sent.ok);
      if (metaSent) {
        await pool.query(
          `UPDATE course_manual_payments
           SET meta_purchase_sent = 1,
               meta_purchase_sent_at = ?,
               updated_at = ?
           WHERE payment_uuid = ?
           LIMIT 1`,
          [nowSql(), nowSql(), paymentUuid]
        );
      }
    } catch (_error) {}

    return json(200, {
      ok: true,
      paymentUuid,
      previousEmail: currentEmail,
      email: newEmail,
      rerun: {
        accountCreated,
        onboardingEmailSent,
        onboardingEmailType,
        brevoSynced,
        metaSent,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not update student email" });
  }
};
