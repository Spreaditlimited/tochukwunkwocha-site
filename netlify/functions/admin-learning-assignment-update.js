const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLearningSupportTables,
  updateAssignmentByAdmin,
} = require("./_lib/learning-support");

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const pool = getPool();
  try {
    await ensureLearningSupportTables(pool, { bootstrap: true });
    const item = await updateAssignmentByAdmin(pool, {
      assignment_id: Number(body.assignment_id || 0),
      status: body.status,
      admin_feedback: body.admin_feedback,
      admin_actor: auth && auth.payload ? auth.payload.role : "admin",
    });
    return json(200, { ok: true, item });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not update assignment." });
  }
};
