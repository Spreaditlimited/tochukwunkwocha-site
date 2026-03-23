const { json, badMethod } = require("./_lib/http");
const { requireAdminSession } = require("./_lib/admin-auth");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });
  return json(200, { ok: true, role: "admin" });
};

