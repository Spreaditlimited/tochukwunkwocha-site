const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const { ensureManualPaymentsTable } = require("./_lib/manual-payments");
const { getCourseName } = require("./_lib/course-config");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureCourseOrdersBatchColumns(pool);
    await ensureManualPaymentsTable(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const email = String(session.account.email || "").trim().toLowerCase();

    const [autoRows] = await pool.query(
      `SELECT course_slug, batch_key, batch_label, MAX(paid_at) AS paid_at
       FROM course_orders
       WHERE email = ?
         AND status = 'paid'
       GROUP BY course_slug, batch_key, batch_label`,
      [email]
    );

    const [manualRows] = await pool.query(
      `SELECT course_slug, batch_key, batch_label, MAX(reviewed_at) AS paid_at
       FROM course_manual_payments
       WHERE email = ?
         AND status = 'approved'
       GROUP BY course_slug, batch_key, batch_label`,
      [email]
    );
    const [manualPendingRows] = await pool.query(
      `SELECT course_slug, batch_key, batch_label, MAX(created_at) AS submitted_at
       FROM course_manual_payments
       WHERE email = ?
         AND status = 'pending_verification'
       GROUP BY course_slug, batch_key, batch_label`,
      [email]
    );

    const map = new Map();
    function statusRank(status) {
      if (status === "paid" || status === "approved") return 2;
      if (status === "pending_verification") return 1;
      return 0;
    }

    function upsert(row, source, status, submittedAt) {
      const courseSlug = String(row.course_slug || "").trim();
      const batchKey = String(row.batch_key || "").trim();
      const batchLabel = String(row.batch_label || "").trim();
      const key = `${courseSlug}::${batchKey}`;
      const paidAt = row.paid_at || null;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          courseSlug,
          courseName: getCourseName(courseSlug),
          batchKey: batchKey || null,
          batchLabel: batchLabel || null,
          paidAt,
          submittedAt: submittedAt || null,
          source,
          status,
        });
        return;
      }
      const prevRank = statusRank(existing.status);
      const nextRank = statusRank(status);
      if (nextRank > prevRank) {
        existing.paidAt = paidAt;
        existing.submittedAt = submittedAt || existing.submittedAt || null;
        existing.source = source;
        existing.status = status;
        return;
      }
      if (nextRank === prevRank) {
        const prevTime = existing.paidAt ? new Date(existing.paidAt).getTime() : 0;
        const nextTime = paidAt ? new Date(paidAt).getTime() : 0;
        if (nextTime > prevTime) {
          existing.paidAt = paidAt;
          existing.source = source;
        }
      }
    }

    (autoRows || []).forEach(function (row) {
      upsert(row, "order", "paid", null);
    });
    (manualRows || []).forEach(function (row) {
      upsert(row, "manual_payment", "approved", null);
    });
    (manualPendingRows || []).forEach(function (row) {
      upsert(row, "manual_payment", "pending_verification", row.submitted_at || null);
    });

    const items = Array.from(map.values()).sort(function (a, b) {
      const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      return tb - ta;
    });

    return json(200, {
      ok: true,
      account: {
        fullName: session.account.fullName,
        email: session.account.email,
      },
      items,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load purchased courses" });
  }
};
