const { json, badMethod } = require("./_lib/http");
const { clearAdminCookieHeader } = require("./_lib/admin-auth");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": clearAdminCookieHeader(event),
    },
    body: JSON.stringify({ ok: true }),
  };
};
