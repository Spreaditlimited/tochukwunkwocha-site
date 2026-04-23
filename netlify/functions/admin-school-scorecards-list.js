const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { ensureSchoolScorecardTablesTochukwu, listSchoolScorecardLeads } = require("./_lib/school-scorecards-tochukwu");
const { ensureSchoolCallTablesTochukwu } = require("./_lib/school-calls-tochukwu");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}

    await ensureSchoolScorecardTablesTochukwu(pool);
    await ensureSchoolCallTablesTochukwu(pool);
    const leads = await listSchoolScorecardLeads(pool, { limit: 200 });

    return json(200, {
      ok: true,
      leads,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load school scorecard leads." });
  }
};
