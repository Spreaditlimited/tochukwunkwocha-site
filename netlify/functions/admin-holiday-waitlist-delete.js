const { json, badMethod } = require("./_lib/http");
const { requireAdminSession } = require("./_lib/admin-auth");
const { getPool } = require("./_lib/db");
const {
  ensureWhatsAppWaitlistTables,
  WA_WAITLIST_CONTACTS_TABLE,
  WA_WAITLIST_QUEUE_TABLE,
} = require("./_lib/whatsapp-waitlist");

function clean(value, max) {
  return String(value || "").trim().slice(0, Number(max || 300));
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const id = Number(body && body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return json(400, { ok: false, error: "Valid waitlist id is required." });
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await ensureWhatsAppWaitlistTables(pool);
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id, email, phone_e164
       FROM ${WA_WAITLIST_CONTACTS_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row) {
      await conn.rollback();
      return json(404, { ok: false, error: "Waitlist record not found." });
    }

    const phone = clean(row.phone_e164, 20);
    let deletedQueue = 0;
    if (phone) {
      const [queueRes] = await conn.query(
        `DELETE FROM ${WA_WAITLIST_QUEUE_TABLE}
         WHERE phone_e164 = ?`,
        [phone]
      );
      deletedQueue = Number(queueRes && queueRes.affectedRows ? queueRes.affectedRows : 0);
    }

    const [contactRes] = await conn.query(
      `DELETE FROM ${WA_WAITLIST_CONTACTS_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    const deletedContact = Number(contactRes && contactRes.affectedRows ? contactRes.affectedRows : 0);

    await conn.commit();
    return json(200, {
      ok: true,
      deletedContact,
      deletedQueue,
      deleted: {
        id,
        email: clean(row.email, 190).toLowerCase(),
        phone,
      },
    });
  } catch (error) {
    try {
      await conn.rollback();
    } catch (_error) {}
    return json(500, { ok: false, error: error.message || "Could not delete waitlist record." });
  } finally {
    conn.release();
  }
};
