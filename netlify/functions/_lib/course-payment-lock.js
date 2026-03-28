const { ensureManualPaymentsTable } = require("./manual-payments");
const { ensureCourseOrdersBatchColumns } = require("./course-orders");

async function getCoursePaymentLock(pool, input) {
  const email = String((input && input.email) || "").trim().toLowerCase();
  const courseSlug = String((input && input.courseSlug) || "").trim().toLowerCase();
  if (!email || !courseSlug) {
    return { locked: false, reason: "" };
  }

  await ensureManualPaymentsTable(pool);
  await ensureCourseOrdersBatchColumns(pool);

  const [paidOnlineRows] = await pool.query(
    `SELECT id
     FROM course_orders
     WHERE email = ?
       AND course_slug = ?
       AND status = 'paid'
       AND provider IN ('paystack', 'paypal')
     ORDER BY id DESC
     LIMIT 1`,
    [email, courseSlug]
  );
  if (paidOnlineRows && paidOnlineRows.length) {
    return { locked: true, reason: "online_paid" };
  }

  const [manualRows] = await pool.query(
    `SELECT status
     FROM course_manual_payments
     WHERE email = ?
       AND course_slug = ?
       AND status IN ('pending_verification', 'approved')
     ORDER BY id DESC
     LIMIT 1`,
    [email, courseSlug]
  );
  if (manualRows && manualRows.length) {
    const status = String(manualRows[0].status || "").trim().toLowerCase();
    if (status === "pending_verification") return { locked: true, reason: "manual_pending" };
    if (status === "approved") return { locked: true, reason: "manual_approved" };
    return { locked: true, reason: "manual_lock" };
  }

  return { locked: false, reason: "" };
}

module.exports = {
  getCoursePaymentLock,
};
