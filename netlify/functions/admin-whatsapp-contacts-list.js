const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { listWhatsAppContacts, clean } = require("./_lib/whatsapp-marketing");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const qs = event.queryStringParameters || {};
  const pool = getPool();
  try { await applyRuntimeSettings(pool); } catch (_error) {}
  try {
    const rows = await listWhatsAppContacts(pool, {
      courseSlug: qs.course_slug || "all",
      search: qs.search || "",
      opted: qs.opted || "in",
      limit: qs.limit || 500,
    });
    return json(200, {
      ok: true,
      contacts: rows.map(function (row) {
        return {
          id: Number(row.id || 0),
          email: clean(row.email, 190).toLowerCase(),
          fullName: clean(row.full_name, 180),
          phone: clean(row.phone_e164, 20),
          courseSlug: clean(row.course_slug, 120),
          source: clean(row.source, 80),
          optedIn: Number(row.whatsapp_opted_in || 0) === 1,
          optedInAt: clean(row.whatsapp_opted_in_at, 80),
          optedOutAt: clean(row.whatsapp_opted_out_at, 80),
          updatedAt: clean(row.updated_at, 80),
        };
      }),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load WhatsApp contacts" });
  }
};
