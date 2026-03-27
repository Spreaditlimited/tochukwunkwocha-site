async function brevoRequest(path, payload) {
  const apiKey = process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.trim();
  if (!apiKey) return { ok: false, error: "Missing BREVO_API_KEY" };

  try {
    const res = await fetch(`https://api.brevo.com/v3${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok) {
      const message = (json && (json.message || json.error)) || `Brevo error ${res.status}`;
      return { ok: false, error: message };
    }
    return { ok: true, data: json };
  } catch (_error) {
    return { ok: false, error: "Could not reach Brevo" };
  }
}

async function syncBrevoSubscriber({ fullName, email, listId }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) return { ok: false, error: "Missing email" };
  const listIdNum = Number(listId || 0);
  if (!Number.isFinite(listIdNum) || listIdNum <= 0) {
    return { ok: false, error: "Missing listId" };
  }
  const payload = {
    email: cleanEmail,
    attributes: {
      FIRSTNAME: String(fullName || "").trim(),
    },
    listIds: [listIdNum],
    updateEnabled: true,
    emailBlacklisted: false,
    smsBlacklisted: false,
  };
  return brevoRequest("/contacts", payload);
}

module.exports = { syncBrevoSubscriber };
