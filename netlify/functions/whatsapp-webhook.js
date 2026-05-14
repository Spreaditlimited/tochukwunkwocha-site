const { getPool } = require("./_lib/db");
const { config, normalizePhoneE164 } = require("./_lib/whatsapp");
const {
  ensureWhatsAppWaitlistTables,
  saveWebhookEvent,
  markOptedOutByPhone,
  clean,
} = require("./_lib/whatsapp-waitlist");
const {
  ensureWhatsAppMarketingTables,
  markWhatsAppOptedOut,
} = require("./_lib/whatsapp-marketing");

function plain(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: String(body || ""),
  };
}

function parseBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch (_error) {
    return {};
  }
}

async function processInboundMessages(pool, value) {
  const messages = Array.isArray(value && value.messages) ? value.messages : [];
  for (const message of messages) {
    const from = normalizePhoneE164(message && message.from);
    const textBody =
      clean(message && message.text && message.text.body, 300) ||
      clean(message && message.button && message.button.text, 300) ||
      "";
    const normalized = textBody.trim().toUpperCase();
    await saveWebhookEvent(pool, {
      phoneE164: from,
      eventType: "message_inbound",
      payloadJson: JSON.stringify(message || {}),
    });
    if (from && (normalized === "STOP" || normalized === "UNSUBSCRIBE")) {
      await markOptedOutByPhone(pool, from);
      await markWhatsAppOptedOut(pool, from);
      await saveWebhookEvent(pool, {
        phoneE164: from,
        eventType: "opt_out",
        payloadJson: JSON.stringify({ text: textBody }),
      });
    }
  }
}

async function processStatuses(pool, value) {
  const statuses = Array.isArray(value && value.statuses) ? value.statuses : [];
  for (const status of statuses) {
    const phone = normalizePhoneE164(status && status.recipient_id);
    await saveWebhookEvent(pool, {
      phoneE164: phone,
      eventType: clean(status && status.status, 80) || "message_status",
      payloadJson: JSON.stringify(status || {}),
    });
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === "GET") {
    const cfg = config();
    const qs = event.queryStringParameters || {};
    const mode = clean(qs["hub.mode"], 60);
    const token = clean(qs["hub.verify_token"], 300);
    const challenge = clean(qs["hub.challenge"], 400);
    if (mode === "subscribe" && token && token === cfg.verifyToken) {
      return plain(200, challenge);
    }
    return plain(403, "Forbidden");
  }

  if (event.httpMethod !== "POST") {
    return plain(405, "Method not allowed");
  }

  const payload = parseBody(event.body);
  try {
    const pool = getPool();
    await ensureWhatsAppWaitlistTables(pool);
    await ensureWhatsAppMarketingTables(pool);
    const entries = Array.isArray(payload && payload.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry && entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change && typeof change.value === "object" ? change.value : {};
        await processInboundMessages(pool, value);
        await processStatuses(pool, value);
      }
    }
  } catch (error) {
    console.error("whatsapp_webhook_process_error", error && error.message ? error.message : error);
  }

  return plain(200, "EVENT_RECEIVED");
};
