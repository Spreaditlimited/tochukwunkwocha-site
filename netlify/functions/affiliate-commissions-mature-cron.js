const { json } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureAffiliateTables, matureAffiliateCommissions } = require("./_lib/affiliates");

exports.handler = async function () {
  const pool = getPool();
  try {
    await ensureAffiliateTables(pool);
    const result = await matureAffiliateCommissions(pool);
    return json(200, { ok: true, result });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not mature affiliate commissions" });
  }
};
