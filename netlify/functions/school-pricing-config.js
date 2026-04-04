const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { schoolsPricingConfig, schoolsPricing } = require("./_lib/schools");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const seatCount = Number(event.queryStringParameters && event.queryStringParameters.seat_count || 0);

  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  const config = schoolsPricingConfig();
  const quote = schoolsPricing(Number.isFinite(seatCount) && seatCount > 0 ? seatCount : config.minSeats);
  return json(200, {
    ok: true,
    config,
    quote,
  });
};

