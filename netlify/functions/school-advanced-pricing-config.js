const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { schoolsAdvancedPricingConfigForPool, schoolsAdvancedPricingForPool } = require("./_lib/schools");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const seatCount = Number(event.queryStringParameters && event.queryStringParameters.seat_count || 0);
  const pool = getPool();
  const config = await schoolsAdvancedPricingConfigForPool(pool);
  const quote = await schoolsAdvancedPricingForPool(pool, Number.isFinite(seatCount) && seatCount > 0 ? seatCount : config.minSeats);
  return json(200, {
    ok: true,
    config,
    quote,
  });
};
