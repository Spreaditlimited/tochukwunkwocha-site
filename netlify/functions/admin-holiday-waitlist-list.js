const { json, badMethod } = require("./_lib/http");
const { requireAdminSession } = require("./_lib/admin-auth");

const DEFAULT_WAITLIST_LIST_ID = 10;

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 300);
}

async function brevoFetchWaitlistContacts({ listId, limit, offset }) {
  const apiKey = clean(process.env.BREVO_API_KEY, 300);
  if (!apiKey) throw new Error("Missing BREVO_API_KEY");
  const safeListId = Math.max(1, Number(listId || DEFAULT_WAITLIST_LIST_ID));
  const safeLimit = Math.max(1, Math.min(Number(limit || 200), 500));
  const safeOffset = Math.max(0, Number(offset || 0));
  const qs = new URLSearchParams({
    limit: String(safeLimit),
    offset: String(safeOffset),
    sort: "desc",
  });
  const res = await fetch(
    `https://api.brevo.com/v3/contacts/lists/${encodeURIComponent(safeListId)}/contacts?${qs.toString()}`,
    {
      method: "GET",
      headers: {
        "api-key": apiKey,
        Accept: "application/json",
      },
    }
  );
  const data = await res.json().catch(function () { return null; });
  if (!res.ok) {
    const msg = clean(data && (data.message || data.error), 280) || `Brevo error ${res.status}`;
    throw new Error(msg);
  }
  return data || {};
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const qs = event.queryStringParameters || {};
  const listId = Number(qs.list_id || DEFAULT_WAITLIST_LIST_ID);
  const limit = Number(qs.limit || 200);
  const offset = Number(qs.offset || 0);

  try {
    const result = await brevoFetchWaitlistContacts({ listId, limit, offset });
    const contacts = Array.isArray(result.contacts) ? result.contacts : [];
    return json(200, {
      ok: true,
      listId: Math.max(1, listId || DEFAULT_WAITLIST_LIST_ID),
      count: contacts.length,
      total: Number(result.count || contacts.length || 0),
      contacts: contacts.map(function (item) {
        const attrs = item && item.attributes && typeof item.attributes === "object" ? item.attributes : {};
        return {
          email: clean(item && item.email, 190).toLowerCase(),
          fullName: clean(attrs.FIRSTNAME || attrs.FULLNAME || attrs.NAME, 180),
          phone: clean(attrs.SMS || attrs.PHONE || attrs.WHATSAPP || "", 80),
          createdAt: clean(item && item.createdAt, 80),
          modifiedAt: clean(item && item.modifiedAt, 80),
        };
      }),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load waitlist contacts." });
  }
};
