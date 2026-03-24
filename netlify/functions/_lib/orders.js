const { nowSql } = require("./db");
const { syncFlodeskSubscriber } = require("./flodesk");
const { paystackVerifyTransaction } = require("./payments");
const { listCourseBatches, resolveCourseBatch, normalizeBatchKey, ensureCourseBatchesTable } = require("./batch-store");
const { ensureCourseOrdersBatchColumns } = require("./course-orders");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug, getCourseDefaultAmountMinor } = require("./course-config");

async function markOrderPaidBy({ pool, orderUuid, providerReference, providerOrderId, provider }) {
  if (!orderUuid && !providerReference && !providerOrderId) {
    return { ok: false, error: "Missing order identifier" };
  }

  const where = [];
  const params = [];

  if (orderUuid) {
    where.push("order_uuid = ?");
    params.push(orderUuid);
  }
  if (providerReference) {
    where.push("provider_reference = ?");
    params.push(providerReference);
  }
  if (providerOrderId) {
    where.push("provider_order_id = ?");
    params.push(providerOrderId);
  }

  const [rows] = await pool.query(
    `SELECT id, order_uuid, course_slug, first_name, email, status, flodesk_synced
     FROM course_orders
     WHERE ${where.join(" OR ")}
     ORDER BY id DESC
     LIMIT 1`,
    params
  );

  if (!rows || !rows.length) {
    return { ok: false, error: "Order not found" };
  }

  const order = rows[0];

  if (String(order.status) !== "paid") {
    await pool.query(
      `UPDATE course_orders
       SET status = 'paid',
           provider = COALESCE(?, provider),
           provider_reference = COALESCE(?, provider_reference),
           provider_order_id = COALESCE(?, provider_order_id),
           paid_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [provider || null, providerReference || null, providerOrderId || null, nowSql(), nowSql(), order.id]
    );
  }

  if (!order.flodesk_synced) {
    const synced = await syncFlodeskSubscriber({
      firstName: order.first_name,
      email: order.email,
    });

    if (synced.ok) {
      await pool.query(`UPDATE course_orders SET flodesk_synced = 1, updated_at = ? WHERE id = ?`, [nowSql(), order.id]);
    }
  }

  return { ok: true, orderUuid: order.order_uuid, courseSlug: order.course_slug, email: order.email };
}

async function reconcileCoursePaystackOrders(pool, input) {
  await ensureCourseOrdersBatchColumns(pool);
  await ensureCourseBatchesTable(pool);

  const safeLimit = Math.max(1, Math.min(Number((input && input.limit) || 60), 300));
  const requestedBatchKey = normalizeBatchKey(input && input.batchKey);
  const courseSlug = normalizeCourseSlug(input && input.courseSlug, DEFAULT_COURSE_SLUG);
  const batches =
    !requestedBatchKey || requestedBatchKey === "all"
      ? await listCourseBatches(pool, courseSlug)
      : [await resolveCourseBatch(pool, { courseSlug, batchKey: requestedBatchKey })].filter(Boolean);

  const items = [];
  for (const batch of batches) {
    const expectedAmountMinor = Number(batch.paystack_amount_minor || getCourseDefaultAmountMinor(courseSlug));
    const batchKey = String(batch.batch_key || "").trim();
    const prefix = String(batch.paystack_reference_prefix || "PTP").trim().toUpperCase();
    const [rows] = await pool.query(
      `SELECT order_uuid, provider_reference
       FROM course_orders
       WHERE course_slug = ?
         AND batch_key = ?
         AND provider = 'paystack'
         AND status <> 'paid'
         AND amount_minor = ?
         AND provider_reference IS NOT NULL
         AND provider_reference LIKE ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [courseSlug, batchKey, expectedAmountMinor, `${prefix}_%`, safeLimit]
    );
    (rows || []).forEach((row) => items.push(row));
  }

  let checked = 0;
  let markedPaid = 0;
  let notPaid = 0;
  let failed = 0;

  for (const row of items) {
    const reference = String((row && row.provider_reference) || "").trim();
    const orderUuid = String((row && row.order_uuid) || "").trim();
    if (!reference || !orderUuid) continue;

    try {
      const tx = await paystackVerifyTransaction(reference);
      checked += 1;
      const status = String((tx && tx.status) || "").toLowerCase();
      if (status !== "success") {
        notPaid += 1;
        continue;
      }

      const result = await markOrderPaidBy({
        pool,
        provider: "paystack",
        providerReference: reference,
        providerOrderId: tx && tx.id ? String(tx.id) : null,
        orderUuid,
      });
      if (result.ok) markedPaid += 1;
      else failed += 1;
    } catch (_error) {
      failed += 1;
    }
  }

  return {
    checked,
    markedPaid,
    notPaid,
    failed,
    candidateCount: items.length,
  };
}

module.exports = {
  markOrderPaidBy,
  reconcileCoursePaystackOrders,
};
