const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const { requireSchoolAdminSession } = require("./_lib/schools");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const pool = getPool();
  try {
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });
    return json(200, {
      ok: true,
      admin: session.admin,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load school session." });
  }
};
