const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { sendEmail } = require("./_lib/email");
const { siteBaseUrl } = require("./_lib/payments");
const { normalizeCourseSlug, DEFAULT_COURSE_SLUG } = require("./_lib/course-config");
const { ensureManualPaymentsTable } = require("./_lib/manual-payments");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const {
  ensureStudentAuthTables,
  findStudentByEmail,
  createStudentAccount,
  createPasswordResetToken,
} = require("./_lib/student-auth");

const RUNS_TABLE = "tochukwu_onboarding_email_runs";
const RUN_ITEMS_TABLE = "tochukwu_onboarding_email_run_items";

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 320);
}

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number.isFinite(fallback) ? Math.trunc(fallback) : 0;
  return Math.trunc(n);
}

function normalizeEmail(value) {
  const email = clean(value, 220).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function randomPassword() {
  return crypto.randomBytes(6).toString("base64url") + "A9!";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function displayNameFallback(email) {
  const local = String(email || "").split("@")[0] || "Student";
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ") || "Student"
  );
}

function firstNameFromFullName(fullName, email) {
  const raw = clean(fullName, 180);
  const first = raw.split(/\s+/).filter(Boolean)[0] || "";
  if (first) return first;
  return displayNameFallback(email).split(/\s+/).filter(Boolean)[0] || "Student";
}

function buildFirstAccessEmail(input) {
  const fullName = clean(input && input.fullName, 160) || "there";
  const email = clean(input && input.email, 220);
  const tempPassword = clean(input && input.tempPassword, 120);
  const resetLink = clean(input && input.resetLink, 800);
  const html = [
    `<p>Hello ${escapeHtml(fullName)},</p>`,
    "<p>Your dashboard account has been created.</p>",
    `<p><strong>Email:</strong> ${escapeHtml(email)}<br/><strong>Temporary password:</strong> <code>${escapeHtml(
      tempPassword
    )}</code></p>`,
    "<p>Please reset your password using the link below before signing in:</p>",
    `<p><a href="${escapeHtml(resetLink)}">${escapeHtml(resetLink)}</a></p>`,
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
    `<p>Hello ${escapeHtml(fullName)},</p>`,
    "<p>Here is your dashboard password reset link.</p>",
    `<p><a href="${escapeHtml(resetLink)}">${escapeHtml(resetLink)}</a></p>`,
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

function applyTemplate(template, vars) {
  const raw = String(template || "");
  return raw.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, function (_all, key) {
    const name = String(key || "").trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name] || "") : "";
  });
}

function buildCustomEmail(input) {
  const template = String(input && input.messageTemplate || "").trim();
  const vars = input && input.vars && typeof input.vars === "object" ? input.vars : {};
  const text = applyTemplate(template, vars);
  const html = `<div>${escapeHtml(text).replace(/\n/g, "<br/>")}</div>`;
  return { html, text };
}

function defaultSubject(input) {
  const createdAccount = !!(input && input.createdAccount);
  const mode = String((input && input.mode) || "single").trim().toLowerCase();
  const batchLabel = clean(input && input.batchLabel, 120) || "your batch";
  if (mode === "batch") return `Important: New Password Reset Link for ${batchLabel}`;
  return createdAccount ? "Your Dashboard Access (Password Reset Required)" : "Your Dashboard Password Reset Link";
}

async function ensureRunLogTables(pool) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${RUNS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      run_uuid VARCHAR(64) NOT NULL,
      mode VARCHAR(20) NOT NULL,
      course_slug VARCHAR(120) NULL,
      batch_key VARCHAR(80) NULL,
      batch_label VARCHAR(120) NULL,
      email_subject VARCHAR(220) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'running',
      total_targets INT NOT NULL DEFAULT 0,
      processed_count INT NOT NULL DEFAULT 0,
      sent_count INT NOT NULL DEFAULT 0,
      failed_count INT NOT NULL DEFAULT 0,
      created_accounts INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      completed_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_onboarding_email_run_uuid (run_uuid),
      KEY idx_onboarding_email_runs_scope (course_slug, batch_key, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${RUN_ITEMS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      run_uuid VARCHAR(64) NOT NULL,
      email VARCHAR(220) NOT NULL,
      full_name VARCHAR(180) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      error_message VARCHAR(500) NULL,
      created_account TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      processed_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_onboarding_email_run_item (run_uuid, email),
      KEY idx_onboarding_email_items_status (run_uuid, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

async function createRun(pool, input) {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const runId = `ors_${crypto.randomUUID().replace(/-/g, "")}`;
  await pool.query(
    `INSERT INTO ${RUNS_TABLE}
      (run_uuid, mode, course_slug, batch_key, batch_label, email_subject, status, created_at, updated_at)
     VALUES (?, 'batch', ?, ?, ?, ?, 'running', ?, ?)`,
    [runId, clean(input.courseSlug, 120) || null, clean(input.batchKey, 80) || null, clean(input.batchLabel, 120) || null, clean(input.subject, 220) || null, now, now]
  );
  return runId;
}

async function getRunById(pool, runId) {
  const [rows] = await pool.query(
    `SELECT run_uuid, mode, course_slug, batch_key, batch_label, email_subject, status
     FROM ${RUNS_TABLE}
     WHERE run_uuid = ?
     LIMIT 1`,
    [clean(runId, 64)]
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getLatestRun(pool, input) {
  const courseSlug = clean(input && input.courseSlug, 120);
  const batchKey = clean(input && input.batchKey, 80);
  const params = [];
  const where = ["mode = 'batch'"];
  if (courseSlug) {
    where.push("course_slug = ?");
    params.push(courseSlug);
  }
  if (batchKey) {
    where.push("batch_key = ?");
    params.push(batchKey);
  }
  const [rows] = await pool.query(
    `SELECT run_uuid, mode, course_slug, batch_key, batch_label, email_subject, status, created_at, updated_at, completed_at
     FROM ${RUNS_TABLE}
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT 1`,
    params
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function upsertRunItem(pool, input) {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const runId = clean(input && input.runId, 64);
  const email = normalizeEmail(input && input.email);
  if (!runId || !email) return;
  await pool.query(
    `INSERT INTO ${RUN_ITEMS_TABLE}
      (run_uuid, email, full_name, status, error_message, created_account, created_at, updated_at, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       status = VALUES(status),
       error_message = VALUES(error_message),
       created_account = VALUES(created_account),
       updated_at = VALUES(updated_at),
       processed_at = VALUES(processed_at)`,
    [
      runId,
      email,
      clean(input && input.fullName, 180) || null,
      clean(input && input.status, 20) || "pending",
      clean(input && input.errorMessage, 500) || null,
      input && input.createdAccount ? 1 : 0,
      now,
      now,
      input && input.status && input.status !== "pending" ? now : null,
    ]
  );
}

async function refreshRunTotals(pool, runId, totalTargets) {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const [rows] = await pool.query(
    `SELECT
       SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
       SUM(CASE WHEN status IN ('sent','failed') THEN 1 ELSE 0 END) AS processed_count,
       SUM(CASE WHEN created_account = 1 THEN 1 ELSE 0 END) AS created_accounts
     FROM ${RUN_ITEMS_TABLE}
     WHERE run_uuid = ?`,
    [clean(runId, 64)]
  );
  const row = rows && rows[0] ? rows[0] : {};
  const sent = Number(row.sent_count || 0);
  const failed = Number(row.failed_count || 0);
  const processed = Number(row.processed_count || 0);
  const created = Number(row.created_accounts || 0);
  await pool.query(
    `UPDATE ${RUNS_TABLE}
     SET total_targets = ?, processed_count = ?, sent_count = ?, failed_count = ?, created_accounts = ?, updated_at = ?
     WHERE run_uuid = ?
     LIMIT 1`,
    [Math.max(0, Number(totalTargets || 0)), processed, sent, failed, created, now, clean(runId, 64)]
  );
  return {
    total: Math.max(0, Number(totalTargets || 0)),
    processed,
    sent,
    failed,
    createdAccounts: created,
  };
}

async function completeRun(pool, runId) {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  await pool.query(
    `UPDATE ${RUNS_TABLE}
     SET status = 'completed', completed_at = ?, updated_at = ?
     WHERE run_uuid = ?
     LIMIT 1`,
    [now, now, clean(runId, 64)]
  );
}

async function listRunFailures(pool, runId) {
  const [rows] = await pool.query(
    `SELECT email, error_message
     FROM ${RUN_ITEMS_TABLE}
     WHERE run_uuid = ?
       AND status = 'failed'
     ORDER BY email ASC`,
    [clean(runId, 64)]
  );
  return Array.isArray(rows)
    ? rows.map(function (row) {
        return {
          email: normalizeEmail(row && row.email),
          message: clean(row && row.error_message, 500) || "Unknown error",
        };
      }).filter(function (item) {
        return !!item.email;
      })
    : [];
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

async function listBatchTargets(pool, input) {
  const courseSlug = normalizeCourseSlug(input && input.courseSlug, DEFAULT_COURSE_SLUG);
  const batchKey = clean(input && input.batchKey, 80);
  if (!batchKey) return [];

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
    const email = normalizeEmail(row && row.email);
    const fullName = clean(row && row.full_name, 180);
    if (!email) return;
    byEmail.set(email, { email, fullName, source: "manual" });
  });
  (Array.isArray(orderRows) ? orderRows : []).forEach(function (row) {
    const email = normalizeEmail(row && row.email);
    const fullName = clean(row && row.full_name, 180);
    if (!email) return;
    const existing = byEmail.get(email);
    if (existing) {
      if (!existing.fullName && fullName) existing.fullName = fullName;
      return;
    }
    byEmail.set(email, { email, fullName, source: "order" });
  });
  return Array.from(byEmail.values()).sort(function (a, b) {
    return String(a.email || "").localeCompare(String(b.email || ""));
  });
}

async function sendResetEmail(pool, input) {
  const email = normalizeEmail(input && input.email);
  if (!email) throw new Error("A valid student email is required.");

  const providedName = clean(input && input.fullName, 180);
  const courseSlug = normalizeCourseSlug(input && input.courseSlug, DEFAULT_COURSE_SLUG);
  const batchKey = clean(input && input.batchKey, 80);
  const batchLabel = clean(input && input.batchLabel, 120) || "Batch";
  const customSubject = clean(input && input.subject, 220);
  const messageTemplate = String(input && input.messageTemplate || "").trim().slice(0, 8000);
  const mode = String((input && input.mode) || "single").trim().toLowerCase();

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
    throw new Error("Could not generate password reset token.");
  }

  const resetLink = `${siteBaseUrl()}/dashboard/reset-password/?token=${encodeURIComponent(reset.token)}`;
  const firstName = firstNameFromFullName(fullName, email);
  const vars = {
    first_name: firstName,
    full_name: fullName,
    email,
    reset_link: resetLink,
    course_slug: courseSlug,
    batch_key: batchKey,
    batch_label: batchLabel,
    temp_password: tempPassword || "",
  };
  const mail = messageTemplate
    ? buildCustomEmail({ messageTemplate, vars })
    : createdAccount
      ? buildFirstAccessEmail({ fullName, email, tempPassword, resetLink })
      : buildResetOnlyEmail({ fullName, resetLink });
  const subject = customSubject || defaultSubject({ createdAccount, mode, batchLabel });

  await sendEmail({
    to: email,
    subject,
    html: mail.html,
    text: mail.text,
  });

  return {
    email,
    createdAccount,
    accountId: Number((account && account.id) || 0) || null,
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

  const mode = String((body && body.mode) || "single").trim().toLowerCase() === "batch" ? "batch" : "single";
  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureManualPaymentsTable(pool);
    await ensureCourseOrdersBatchColumns(pool);
    await ensureRunLogTables(pool);

    if (String((body && body.mode) || "").trim().toLowerCase() === "batch_failures") {
      const runIdInput = clean(body && (body.runId || body.run_id), 64);
      let run = null;
      if (runIdInput) run = await getRunById(pool, runIdInput);
      if (!run) {
        run = await getLatestRun(pool, {
          courseSlug: normalizeCourseSlug(body && (body.courseSlug || body.course_slug), DEFAULT_COURSE_SLUG),
          batchKey: clean(body && (body.batchKey || body.batch_key), 80),
        });
      }
      if (!run || !run.run_uuid) {
        return json(404, { ok: false, error: "No previous batch send run found for this scope." });
      }
      const failures = await listRunFailures(pool, run.run_uuid);
      return json(200, {
        ok: true,
        mode: "batch_failures",
        run_id: run.run_uuid,
        courseSlug: clean(run.course_slug, 120),
        batchKey: clean(run.batch_key, 80),
        batchLabel: clean(run.batch_label, 120),
        failure_count: failures.length,
        failures,
      });
    }

    if (mode === "batch") {
      const courseSlug = normalizeCourseSlug(
        body && (body.courseSlug || body.course_slug),
        DEFAULT_COURSE_SLUG
      );
      const batchKey = clean(body && (body.batchKey || body.batch_key), 80);
      const batchLabel = clean(body && (body.batchLabel || body.batch_label), 120) || "Batch";
      const subject = clean(body && body.subject, 220);
      if (!batchKey) return json(400, { ok: false, error: "Batch key is required." });

      const allTargets = await listBatchTargets(pool, { courseSlug, batchKey });
      const total = Array.isArray(allTargets) ? allTargets.length : 0;
      if (!total) {
        return json(200, {
          ok: true,
          mode,
          courseSlug,
          batchKey,
          batchLabel,
          total: 0,
          processed: 0,
          cursor: 0,
          nextCursor: null,
          sent: 0,
          failed: 0,
          createdAccounts: 0,
          run_id: null,
          failures: [],
        });
      }

      const cursor = Math.max(0, toInt(body && body.cursor, 0));
      const limitRaw = toInt(body && body.limit, 20);
      const limit = Math.max(1, Math.min(limitRaw || 20, 50));
      const targets = allTargets.slice(cursor, cursor + limit);
      const nextCursor = cursor + targets.length < total ? cursor + targets.length : null;
      let runId = clean(body && (body.runId || body.run_id), 64);
      if (!runId && cursor === 0) {
        runId = await createRun(pool, {
          courseSlug,
          batchKey,
          batchLabel,
          subject,
        });
      }
      if (!runId) {
        return json(400, { ok: false, error: "run_id is required for continuation." });
      }
      const run = await getRunById(pool, runId);
      if (!run || !run.run_uuid) {
        return json(404, { ok: false, error: "Batch send run not found." });
      }
      if (String(run.status || "").trim().toLowerCase() === "completed" && cursor > 0) {
        return json(200, {
          ok: true,
          mode,
          run_id: runId,
          courseSlug,
          batchKey,
          batchLabel,
          total,
          processed: 0,
          cursor,
          nextCursor: null,
          sent: 0,
          failed: 0,
          createdAccounts: 0,
          failures: [],
        });
      }

      const summary = {
        ok: true,
        mode,
        run_id: runId,
        courseSlug,
        batchKey,
        batchLabel,
        total,
        processed: targets.length,
        cursor,
        nextCursor,
        sent: 0,
        failed: 0,
        createdAccounts: 0,
        failures: [],
      };

      for (const target of targets) {
        try {
          const sent = await sendResetEmail(pool, {
            mode,
            email: target.email,
            fullName: target.fullName,
            courseSlug,
            batchKey,
            batchLabel,
            subject: body && body.subject,
            messageTemplate: body && body.messageTemplate,
          });
          await upsertRunItem(pool, {
            runId,
            email: target.email,
            fullName: target.fullName,
            status: "sent",
            errorMessage: "",
            createdAccount: !!(sent && sent.createdAccount),
          });
        } catch (error) {
          await upsertRunItem(pool, {
            runId,
            email: target.email,
            fullName: target.fullName,
            status: "failed",
            errorMessage: error && error.message ? error.message : "Unknown error",
            createdAccount: false,
          });
          summary.failures.push({
            email: target.email,
            message: error && error.message ? error.message : "Unknown error",
          });
        }
      }

      const totals = await refreshRunTotals(pool, runId, total);
      summary.sent = Number(totals.sent || 0);
      summary.failed = Number(totals.failed || 0);
      summary.createdAccounts = Number(totals.createdAccounts || 0);
      if (nextCursor === null) {
        await completeRun(pool, runId);
      }

      return json(200, summary);
    }

    const context = await findStudentContext(pool, body || {});
    const sent = await sendResetEmail(pool, {
      mode,
      email: context && context.email,
      fullName: context && context.fullName,
      subject: body && body.subject,
      messageTemplate: body && body.messageTemplate,
      courseSlug: body && (body.courseSlug || body.course_slug),
      batchKey: body && (body.batchKey || body.batch_key),
      batchLabel: body && (body.batchLabel || body.batch_label),
    });

    return json(200, Object.assign({ ok: true, mode }, sent));
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not resend onboarding email." });
  }
};
