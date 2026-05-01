const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const { ensureSchoolTables, requireSchoolAdminSession, parseCsv, addSchoolStudents } = require("./_lib/schools");
const { ensureAffiliateTables, createAffiliateCommissionForSchoolStudentOnboard } = require("./_lib/affiliates");

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    await ensureAffiliateTables(pool);
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const csv = String(body.csv || "").trim();
    if (!csv) return json(400, { ok: false, error: "CSV content is required" });
    const parsed = parseCsv(csv);
    if (!parsed.length) return json(400, { ok: false, error: "CSV is empty" });

    const header = parsed[0].map((col) => String(col || "").trim().toLowerCase());
    const fullNameIndex = header.findIndex((col) => col === "full_name" || col === "name");
    const emailIndex = header.findIndex((col) => col === "email");
    if (fullNameIndex === -1) {
      return json(400, { ok: false, error: "CSV header must include full_name column" });
    }

    const rows = parsed.slice(1).map((cols) => ({
      full_name: cols[fullNameIndex],
      email: emailIndex >= 0 ? cols[emailIndex] : "",
    }));
    const result = await addSchoolStudents(pool, {
      schoolId: session.admin.schoolId,
      courseSlug: session.admin.courseSlug,
      rows,
    });
    const createdIds = Array.isArray(result && result.createdStudentIds) ? result.createdStudentIds : [];
    for (let i = 0; i < createdIds.length; i += 1) {
      await createAffiliateCommissionForSchoolStudentOnboard(pool, {
        schoolStudentId: Number(createdIds[i]),
      }).catch(function () {
        return null;
      });
    }
    result.invites_sent = 0;
    result.invites_failed = 0;
    result.invite_errors = [];
    delete result.invites;
    delete result.createdStudentIds;
    return json(200, { ok: true, result });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not upload students." });
  }
};
