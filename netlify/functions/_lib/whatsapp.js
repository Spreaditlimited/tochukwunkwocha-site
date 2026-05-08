function clean(value, maxLen) {
  return String(value || "").trim().slice(0, Number(maxLen || 300));
}

function env(name) {
  return clean(process.env[name], 500);
}

function graphVersion() {
  const version = env("META_GRAPH_VERSION") || "v23.0";
  return /^v\d+\.\d+$/.test(version) ? version : "v23.0";
}

function config() {
  const accessToken = env("META_WA_ACCESS_TOKEN");
  const phoneNumberId = env("META_WA_PHONE_NUMBER_ID");
  const businessAccountId = env("META_WA_BUSINESS_ACCOUNT_ID");
  const verifyToken = env("META_WA_VERIFY_TOKEN");
  return {
    accessToken,
    phoneNumberId,
    businessAccountId,
    verifyToken,
    graphVersion: graphVersion(),
    ok: Boolean(accessToken && phoneNumberId && businessAccountId && verifyToken),
  };
}

function normalizePhoneE164(value) {
  const raw = clean(value, 80);
  if (!raw) return "";
  let normalized = raw.replace(/[^\d+]/g, "");
  if (normalized.startsWith("00")) normalized = `+${normalized.slice(2)}`;
  if (normalized.startsWith("0")) normalized = `+234${normalized.slice(1)}`;
  if (!normalized.startsWith("+")) normalized = `+${normalized}`;
  const digits = normalized.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  return `+${digits}`;
}

async function sendTemplateMessage(input) {
  const cfg = config();
  if (!cfg.ok) {
    return { ok: false, error: "Missing Meta WhatsApp configuration", status: 500 };
  }
  const to = normalizePhoneE164(input && input.to);
  const templateName = clean(input && input.templateName, 120);
  const languageCode = clean(input && input.languageCode, 20) || "en";
  const components = Array.isArray(input && input.components) ? input.components : [];

  if (!to || !templateName) {
    return { ok: false, error: "Missing recipient phone or template name", status: 400 };
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  };

  const url = `https://graph.facebook.com/${encodeURIComponent(cfg.graphVersion)}/${encodeURIComponent(
    cfg.phoneNumberId
  )}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || (data && data.error)) {
      const msg = clean(data && data.error && data.error.message, 280) || `Meta WhatsApp error ${res.status}`;
      return { ok: false, status: res.status, error: msg, response: data };
    }
    return { ok: true, status: res.status, response: data };
  } catch (_error) {
    return { ok: false, status: 502, error: "Could not reach Meta WhatsApp API" };
  }
}

module.exports = { config, normalizePhoneE164, sendTemplateMessage };
