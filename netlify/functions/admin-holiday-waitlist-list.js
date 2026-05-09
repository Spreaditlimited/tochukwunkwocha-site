const { json, badMethod } = require("./_lib/http");
const { requireAdminSession } = require("./_lib/admin-auth");
const { getPool } = require("./_lib/db");
const {
  ensureWhatsAppWaitlistTables,
  WA_WAITLIST_CONTACTS_TABLE,
} = require("./_lib/whatsapp-waitlist");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 300);
}

async function fetchWaitlistContactsFromDb({ limit, offset }) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 200), 500));
  const safeOffset = Math.max(0, Number(offset || 0));
  const pool = getPool();
  await ensureWhatsAppWaitlistTables(pool);

  const [rows] = await pool.query(
    `SELECT email, full_name, phone_e164, opted_in,
            DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ') AS updated_at
     FROM ${WA_WAITLIST_CONTACTS_TABLE}
     ORDER BY updated_at DESC
     LIMIT ?
     OFFSET ?`,
    [safeLimit, safeOffset]
  );
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM ${WA_WAITLIST_CONTACTS_TABLE}`);
  const total = Array.isArray(countRows) && countRows[0] ? Number(countRows[0].total || 0) : 0;

  return { rows: Array.isArray(rows) ? rows : [], total };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const qs = event.queryStringParameters || {};
  const limit = Number(qs.limit || 200);
  const offset = Number(qs.offset || 0);

  try {
    const result = await fetchWaitlistContactsFromDb({ limit, offset });
    const contacts = Array.isArray(result.rows) ? result.rows : [];
    return json(200, {
      ok: true,
      listId: null,
      count: contacts.length,
      total: Number(result.total || contacts.length || 0),
      contacts: contacts.map(function (item) {
        return {
          email: clean(item && item.email, 190).toLowerCase(),
          fullName: clean(item && item.full_name, 180),
          phone: clean(item && item.phone_e164, 80),
          createdAt: clean(item && item.created_at, 80),
          modifiedAt: clean(item && item.updated_at, 80),
          optedIn: Boolean(Number(item && item.opted_in)),
        };
      }),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load waitlist contacts." });
  }
};
