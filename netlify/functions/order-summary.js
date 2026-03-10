const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const orderUuid = String((event.queryStringParameters && event.queryStringParameters.order_uuid) || "").trim();
  if (!orderUuid) {
    return json(400, { ok: false, error: "Missing order_uuid" });
  }

  const pool = getPool();
  try {
    const [rows] = await pool.query(
      `SELECT order_uuid, course_slug, currency, amount_minor, status
       FROM course_orders
       WHERE order_uuid = ?
       ORDER BY id DESC
       LIMIT 1`,
      [orderUuid]
    );

    if (!rows || !rows.length) {
      return json(404, { ok: false, error: "Order not found" });
    }

    const order = rows[0];
    if (String(order.status || "").toLowerCase() !== "paid") {
      return json(404, { ok: false, error: "Order not paid" });
    }

    const value = Number(order.amount_minor || 0) / 100;
    return json(200, {
      ok: true,
      order: {
        order_uuid: order.order_uuid,
        course_slug: order.course_slug,
        currency: String(order.currency || "").toUpperCase(),
        value: Number.isFinite(value) ? Number(value.toFixed(2)) : 0,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Failed to load order" });
  }
};
