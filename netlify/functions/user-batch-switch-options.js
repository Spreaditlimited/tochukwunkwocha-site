const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireStudentSession } = require("./_lib/user-auth");
const { getBatchSwitchOptions } = require("./_lib/batch-switch");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const pool = getPool();
  try {
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const enrollments = await getBatchSwitchOptions(pool, session.account);
    return json(200, {
      ok: true,
      enrollments,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load batch switch options." });
  }
};
