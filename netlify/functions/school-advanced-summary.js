const { getPool } = require("./_lib/db");
const { json, badMethod } = require("./_lib/http");
const {
  requireSchoolAdminSession,
  getSchoolAdvancedSeatSummary,
  listSchoolAdvancedUpgradeCandidates,
} = require("./_lib/schools");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const pool = getPool();
  try {
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const [seatSummary, candidates] = await Promise.all([
      getSchoolAdvancedSeatSummary(pool, session.admin.schoolId),
      listSchoolAdvancedUpgradeCandidates(pool, session.admin.schoolId, { includeDisabled: true }),
    ]);

    const eligibleCount = candidates.filter(function (c) { return c.eligible; }).length;
    return json(200, {
      ok: true,
      admin: session.admin,
      advanced: seatSummary,
      counts: {
        total_students: candidates.length,
        eligible_students: eligibleCount,
        already_upgraded: candidates.filter(function (c) { return c.already_upgraded; }).length,
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load advanced summary." });
  }
};
