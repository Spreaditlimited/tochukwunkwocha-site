function clean(value, maxLen) {
  return String(value || "").trim().slice(0, Number(maxLen || 300));
}

async function callN8nWebhook(input) {
  const webhookUrl = clean(input && input.webhookUrl, 2000);
  const secret = clean(input && input.secret, 300);
  const payload = input && typeof input.payload === "object" ? input.payload : {};
  if (!webhookUrl) return { ok: false, error: "Missing n8n webhook URL" };

  const headers = {
    "Content-Type": "application/json",
  };
  if (secret) headers["x-tochukwu-webhook-secret"] = secret;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(function () {
      controller.abort();
    }, 10000);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json().catch(function () {
      return null;
    });
    if (!res.ok) {
      const message = clean(data && (data.error || data.message), 300) || `n8n webhook failed (${res.status})`;
      return { ok: false, status: res.status, error: message, response: data };
    }
    return { ok: true, status: res.status, response: data };
  } catch (_error) {
    return { ok: false, status: 502, error: "Could not reach n8n webhook" };
  }
}

module.exports = { callN8nWebhook };
