const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const { ensureSchoolTables, requireSchoolAdminSession, parseCsv, addSchoolStudents } = require("./_lib/schools");

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
    await ensureSchoolTables(pool);
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const csv = String(body.csv || "").trim();
    if (!csv) return json(400, { ok: false, error: "CSV content is required" });
    const parsed = parseCsv(csv);
    if (!parsed.length) return json(400, { ok: false, error: "CSV is empty" });

    const header = parsed[0].map((col) => String(col || "").trim().toLowerCase());
    const fullNameIndex = header.findIndex((col) => col === "full_name" || col === "name");
    const emailIndex = header.findIndex((col) => col === "email");
    if (fullNameIndex === -1 || emailIndex === -1) {
      return json(400, { ok: false, error: "CSV header must include full_name and email columns" });
    }

    const rows = parsed.slice(1).map((cols) => ({
      full_name: cols[fullNameIndex],
      email: cols[emailIndex],
    }));
    const result = await addSchoolStudents(pool, {
      schoolId: session.admin.schoolId,
      courseSlug: session.admin.courseSlug,
      rows,
    });
    return json(200, { ok: true, result });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not upload students." });
  }
};

