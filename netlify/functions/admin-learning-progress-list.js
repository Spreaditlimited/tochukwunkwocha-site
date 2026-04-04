const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureStudentAuthTables } = require("./_lib/user-auth");
const { ensureCourseOrdersBatchColumns } = require("./_lib/course-orders");
const { ensureManualPaymentsTable } = require("./_lib/manual-payments");
const { ensureLearningProgressTables, listStudentsProgressByCourse } = require("./_lib/learning-progress");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const courseSlug = clean(event.queryStringParameters && event.queryStringParameters.course_slug, 120).toLowerCase() || "prompt-to-profit";
  const search = clean(event.queryStringParameters && event.queryStringParameters.search, 180);

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureCourseOrdersBatchColumns(pool);
    await ensureManualPaymentsTable(pool);
    await ensureLearningProgressTables(pool);

    const payload = await listStudentsProgressByCourse(pool, {
      course_slug: courseSlug,
      search,
    });

    return json(200, { ok: true, ...payload });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load learning progress." });
  }
};
