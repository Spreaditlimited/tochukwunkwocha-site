const { json } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureDomainTables } = require("./_lib/domains");
const { processDomainRegistrationForOrder } = require("./_lib/domain-registration");

exports.handler = async function (event) {
  const method = String((event && event.httpMethod) || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const pool = getPool();
  try {
    await ensureDomainTables(pool);
    const [rows] = await pool.query(
      `SELECT order_uuid
       FROM domain_orders
       WHERE status = 'registration_in_progress'
       ORDER BY updated_at ASC
       LIMIT 25`
    );
    const items = Array.isArray(rows) ? rows : [];
    const results = [];
    for (const row of items) {
      const orderUuid = String((row && row.order_uuid) || "").trim();
      if (!orderUuid) continue;
      const out = await processDomainRegistrationForOrder(pool, orderUuid).catch(function (error) {
        return { ok: false, error: error && error.message ? error.message : "unknown_error" };
      });
      results.push({
        orderUuid,
        ok: !!out.ok,
        domainName: out.domainName || "",
        error: out.ok ? "" : String(out.error || ""),
      });
    }
    console.info("[domain-registration-cron] run_complete", {
      scanned: items.length,
      processed: results.length,
      successCount: results.filter((r) => r.ok).length,
      failedCount: results.filter((r) => !r.ok).length,
    });
    return json(200, {
      ok: true,
      scanned: items.length,
      processed: results.length,
      results,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not process domain registrations" });
  }
};
