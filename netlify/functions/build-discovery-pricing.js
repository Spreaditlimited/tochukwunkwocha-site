const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { buildDiscoveryPricing } = require("./_lib/build-discovery-pricing");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool); } catch (_error) {}
    const pricing = buildDiscoveryPricing();
    return json(200, { ok: true, pricing });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load pricing" });
  }
};
