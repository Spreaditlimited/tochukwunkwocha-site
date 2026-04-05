const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { MODULES_TABLE } = require("./_lib/learning");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 160);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();
  const slugs = new Set();

  async function collect(sql) {
    try {
      const [rows] = await pool.query(sql);
      (rows || []).forEach(function (row) {
        const slug = clean(row && row.course_slug, 120).toLowerCase();
        if (slug) slugs.add(slug);
      });
    } catch (_error) {
      return;
    }
  }

  try {
    await collect("SELECT DISTINCT course_slug FROM course_batches");
    await collect("SELECT DISTINCT course_slug FROM course_orders");
    await collect("SELECT DISTINCT course_slug FROM course_manual_payments");
    await collect(`SELECT DISTINCT course_slug FROM ${MODULES_TABLE}`);

    const items = Array.from(slugs.values())
      .sort()
      .map(function (slug) {
        return {
          slug,
          label: slug
            .split("-")
            .filter(Boolean)
            .map(function (part) {
              return part.charAt(0).toUpperCase() + part.slice(1);
            })
            .join(" ") || slug,
        };
      });

    return json(200, { ok: true, items });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not list courses." });
  }
};
