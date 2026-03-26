const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireVerifierSession } = require("./_lib/admin-auth");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  try {
    await applyRuntimeSettings(getPool());
  } catch (_error) {}

  const auth = requireVerifierSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });
  return json(200, { ok: true, role: String((auth.payload && auth.payload.role) || "verifier") });
};
