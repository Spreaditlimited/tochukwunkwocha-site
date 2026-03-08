const FLODESK_SEGMENT_URL =
  "https://app.flodesk.com/segment/69ad60e952e4ac8ca746bb53?backTo=L3NlZ21lbnRz";

const DEFAULT_SEGMENT_ID = "69ad60e952e4ac8ca746bb53";

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.FLODESK_API_KEY && process.env.FLODESK_API_KEY.trim();
  const segmentId =
    (process.env.FLODESK_TOCHUKWU_SEGMENT_ID && process.env.FLODESK_TOCHUKWU_SEGMENT_ID.trim()) ||
    DEFAULT_SEGMENT_ID;

  if (!apiKey) {
    return json(500, { ok: false, error: "Missing FLODESK_API_KEY" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const firstName = (body.firstName || "").trim();
  const email = (body.email || "").trim().toLowerCase();

  if (!firstName || !email) {
    return json(400, { ok: false, error: "First name and email are required" });
  }

  const payload = {
    email,
    first_name: firstName,
    segment_ids: [segmentId],
    double_optin: false,
  };

  try {
    const auth = Buffer.from(`${apiKey}:`).toString("base64");

    const response = await fetch("https://api.flodesk.com/v1/subscribers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "User-Agent": "tochukwunkwocha.com",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(function () {
      return null;
    });

    if (!response.ok) {
      const message = (data && (data.message || data.error)) || `Flodesk error ${response.status}`;
      return json(502, { ok: false, error: message });
    }

    return json(200, { ok: true, redirectUrl: FLODESK_SEGMENT_URL });
  } catch (_error) {
    return json(502, { ok: false, error: "Could not reach Flodesk" });
  }
};
