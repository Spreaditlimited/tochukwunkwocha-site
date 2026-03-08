const DEFAULT_SEGMENT_ID = "69ad9a50568c36094377ea96";

async function syncFlodeskSubscriber({ firstName, email }) {
  const apiKey = process.env.FLODESK_API_KEY && process.env.FLODESK_API_KEY.trim();
  if (!apiKey) {
    return { ok: false, error: "Missing FLODESK_API_KEY" };
  }

  const segmentId =
    (process.env.FLODESK_ENROL_SEGMENT_ID && process.env.FLODESK_ENROL_SEGMENT_ID.trim()) ||
    DEFAULT_SEGMENT_ID;

  const payload = {
    email: String(email || "").trim().toLowerCase(),
    first_name: String(firstName || "").trim() || undefined,
    segment_ids: [segmentId],
    double_optin: false,
  };

  const auth = Buffer.from(`${apiKey}:`).toString("base64");

  try {
    const res = await fetch("https://api.flodesk.com/v1/subscribers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "User-Agent": "tochukwunkwocha.com",
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = (json && (json.message || json.error)) || `Flodesk error ${res.status}`;
      return { ok: false, error: message };
    }

    return { ok: true, data: json };
  } catch (_error) {
    return { ok: false, error: "Could not reach Flodesk" };
  }
}

module.exports = { syncFlodeskSubscriber };
