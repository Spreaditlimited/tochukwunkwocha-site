const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const { requireSchoolAdminSession, runSchoolAdvancedUpgrade } = require("./_lib/schools");

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const pool = getPool();
  try {
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const mode = String(body.mode || "selected").trim().toLowerCase();
    if (mode !== "all" && mode !== "selected") {
      return json(400, { ok: false, error: "mode must be all or selected" });
    }

    console.info("school_advanced_upgrade_started", {
      school_id: Number(session.admin.schoolId),
      admin_id: Number(session.admin.id),
      mode,
      selected_count: Array.isArray(body.selectedStudentIds) ? body.selectedStudentIds.length : 0,
    });

    const result = await runSchoolAdvancedUpgrade(pool, {
      schoolId: session.admin.schoolId,
      adminId: session.admin.id,
      mode,
      selectedStudentIds: Array.isArray(body.selectedStudentIds) ? body.selectedStudentIds : [],
      idempotencyKey: String(body.idempotencyKey || "").trim(),
    });

    return json(200, { ok: true, result });
  } catch (error) {
    console.warn("school_advanced_upgrade_failed", {
      error: String(error && error.message || "unknown_error"),
    });
    return json(500, { ok: false, error: error.message || "Could not run advanced upgrade." });
  }
};
