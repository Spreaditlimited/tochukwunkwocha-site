const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureStudentAuthTables,
  clearStudentSession,
  clearStudentCookieHeader,
  requireStudentSession,
} = require("./_lib/user-auth");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const pool = getPool();
  await ensureStudentAuthTables(pool).catch(() => null);
  const session = await requireStudentSession(pool, event).catch(() => null);
  if (session && session.ok && session.token) {
    await clearStudentSession(pool, session.token).catch(() => null);
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearStudentCookieHeader(event),
    },
    body: JSON.stringify({ ok: true }),
  };
};

