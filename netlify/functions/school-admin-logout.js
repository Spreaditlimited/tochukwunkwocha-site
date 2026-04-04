const { getPool } = require("./_lib/db");
const { badMethod } = require("./_lib/http");
const { ensureSchoolTables, clearSchoolAdminSession } = require("./_lib/schools");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    const cleared = await clearSchoolAdminSession(pool, event);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie": cleared,
      },
      body: JSON.stringify({ ok: true }),
    };
  } catch (_error) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  }
};

