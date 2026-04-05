const { json } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { notifyDueDripModulesAll } = require("./_lib/learning-drip");

exports.handler = async function () {
  const pool = getPool();
  try {
    const result = await notifyDueDripModulesAll(pool);
    return json(200, {
      ok: true,
      courses_processed: Number(result.courses || 0),
      modules_notified: Number(result.modules || 0),
      recipients_targeted: Number(result.recipients || 0),
      emails_sent: Number(result.sent || 0),
    });
  } catch (error) {
    console.error("[learning-drip-cron] failed", {
      error: error && error.message ? error.message : String(error || "unknown error"),
    });
    return json(500, { ok: false, error: error.message || "Could not run drip cron." });
  }
};

