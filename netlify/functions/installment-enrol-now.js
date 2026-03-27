const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool, nowSql } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/student-auth");
const { ensureInstallmentTables, findPlanByUuidForAccount, markPlanEnrolled } = require("./_lib/installments");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const { syncFlodeskSubscriber } = require("./_lib/flodesk");
const { sendMetaPurchase } = require("./_lib/meta");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const planUuid = String(body.planUuid || "").trim();
  if (!planUuid) return json(400, { ok: false, error: "planUuid is required" });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureInstallmentTables(pool);
    await ensureCourseOrdersBatchColumns(pool);

    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const plan = await findPlanByUuidForAccount(pool, { planUuid, accountId: session.account.id });
    if (!plan) return json(404, { ok: false, error: "Plan not found" });
    if (String(plan.status || "").toLowerCase() === "enrolled") {
      return json(200, { ok: true, alreadyEnrolled: true, orderUuid: plan.enrolled_order_uuid || null });
    }

    const target = Number(plan.target_amount_minor || 0);
    const paid = Number(plan.total_paid_minor || 0);
    if (!Number.isFinite(target) || target <= 0) {
      return json(400, { ok: false, error: "Target amount is not configured for this plan" });
    }
    if (paid < target) {
      return json(400, { ok: false, error: "Target amount not yet completed" });
    }

    const orderUuid = `wallet_${crypto.randomUUID()}`;
    const now = nowSql();
    await pool.query(
      `INSERT INTO course_orders
       (order_uuid, course_slug, first_name, email, country, currency, amount_minor, provider, status, batch_key, batch_label, paid_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?)`,
      [
        orderUuid,
        plan.course_slug,
        session.account.fullName,
        session.account.email,
        null,
        plan.currency || "NGN",
        target,
        "wallet_installment",
        plan.batch_key,
        plan.batch_label,
        now,
        now,
      ]
    );

    await markPlanEnrolled(pool, { planId: plan.id, orderUuid });

    const synced = await syncFlodeskSubscriber({
      firstName: session.account.fullName,
      email: session.account.email,
      courseSlug: plan.course_slug,
    });
    if (synced.ok) {
      await pool.query(`UPDATE course_orders SET flodesk_synced = 1, updated_at = ? WHERE order_uuid = ?`, [nowSql(), orderUuid]);
    }

    try {
      const sent = await sendMetaPurchase({
        eventId: orderUuid,
        email: session.account.email,
        value: target / 100,
        currency: plan.currency || "NGN",
        contentName: plan.course_slug || "Course",
        contentIds: [plan.course_slug || "course"],
      });
      if (sent && sent.ok) {
        await pool.query(
          `UPDATE course_orders
           SET meta_purchase_sent = 1,
               meta_purchase_sent_at = ?
           WHERE order_uuid = ?`,
          [nowSql(), orderUuid]
        );
      }
    } catch (_error) {}

    return json(200, { ok: true, alreadyEnrolled: false, orderUuid });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not complete enrolment" });
  }
};
