const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const { requireSchoolAdminSession, listSchoolAdvancedUpgradeCandidates } = require("./_lib/schools");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const pool = getPool();
  try {
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const onlyEligible = String(event.queryStringParameters && event.queryStringParameters.only_eligible || "").trim() === "1";
    const candidates = await listSchoolAdvancedUpgradeCandidates(pool, session.admin.schoolId, { includeDisabled: true });
    const items = onlyEligible ? candidates.filter(function (item) { return item.eligible; }) : candidates;
    return json(200, { ok: true, students: items });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load upgrade candidates." });
  }
};
