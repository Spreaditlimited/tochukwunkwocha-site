const { nowSql } = require("./db");
const { syncFlodeskSubscriber } = require("./flodesk");

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
    `SELECT id, order_uuid, first_name, email, status, flodesk_synced
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

  return { ok: true, orderUuid: order.order_uuid, email: order.email };
}

module.exports = { markOrderPaidBy };
