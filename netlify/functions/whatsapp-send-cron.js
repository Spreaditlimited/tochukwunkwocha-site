const { json } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { sendTemplateMessage } = require("./_lib/whatsapp");
const {
  ensureWhatsAppWaitlistTables,
  fetchDueMessages,
  markQueueSent,
  markQueueFailed,
  clean,
} = require("./_lib/whatsapp-waitlist");

function buildTemplateComponents(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const fullName = clean(parsed.fullName, 120);
    if (!fullName) return [];
    return [
      {
        type: "body",
        parameters: [{ type: "text", text: fullName }],
      },
    ];
  } catch (_error) {
    return [];
  }
}

exports.handler = async function () {
  const stats = {
    ok: true,
    scanned: 0,
    sent: 0,
    failed: 0,
    errors: [],
  };

  try {
    const pool = getPool();
    await ensureWhatsAppWaitlistTables(pool);
    const jobs = await fetchDueMessages(pool, 100);
    stats.scanned = jobs.length;

    for (const job of jobs) {
      const res = await sendTemplateMessage({
        to: job.phone_e164,
        templateName: job.template_name,
        languageCode: job.template_language || "en",
        components: buildTemplateComponents(job.template_params_json),
      });
      if (res && res.ok) {
        await markQueueSent(pool, job.id);
        stats.sent += 1;
      } else {
        await markQueueFailed(pool, job.id, (res && res.error) || "Failed to send template");
        stats.failed += 1;
        if (stats.errors.length < 10) {
          stats.errors.push({
            queueId: job.id,
            phone: job.phone_e164,
            error: (res && res.error) || "Failed to send template",
          });
        }
      }
    }
  } catch (error) {
    stats.ok = false;
    stats.error = error && error.message ? error.message : "Unexpected error";
  }

  return json(stats.ok ? 200 : 500, stats);
};
