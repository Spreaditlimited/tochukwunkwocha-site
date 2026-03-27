const crypto = require("crypto");

function clean(value) {
  return String(value || "").trim();
}

function getMetaConfig() {
  const pixelId =
    clean(process.env.META_PIXEL_ID) ||
    clean(process.env.FACEBOOK_PIXEL_ID) ||
    clean(process.env.FB_PIXEL_ID);
  const accessToken =
    clean(process.env.META_PIXEL_ACCESS_TOKEN) ||
    clean(process.env.FACEBOOK_PIXEL_ACCESS_TOKEN) ||
    clean(process.env.FB_PIXEL_ACCESS_TOKEN);
  if (!pixelId || !accessToken) {
    return null;
  }
  return { pixelId, accessToken };
}

function sha256(value) {
  return crypto.createHash("sha256").update(clean(value).toLowerCase()).digest("hex");
}

async function sendMetaPurchase(input) {
  const cfg = getMetaConfig();
  if (!cfg) return { ok: false, skipped: true, error: "Missing Meta Pixel config" };

  const email = clean(input && input.email);
  if (!email) return { ok: false, skipped: true, error: "Missing email" };

  const eventId = clean(input && input.eventId) || `purchase_${Date.now()}`;
  const value = Number(input && input.value);
  const currency = clean(input && input.currency) || "NGN";
  const contentName = clean(input && input.contentName) || "Course";
  const contentIds = Array.isArray(input && input.contentIds) ? input.contentIds : [];
  const eventTime = Number(input && input.eventTime) || Math.floor(Date.now() / 1000);

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: eventTime,
        event_id: eventId,
        action_source: "website",
        user_data: {
          em: [sha256(email)],
        },
        custom_data: {
          value: Number.isFinite(value) ? value : undefined,
          currency,
          content_name: contentName,
          content_type: "product",
          content_ids: contentIds,
        },
      },
    ],
  };

  const url = `https://graph.facebook.com/v17.0/${encodeURIComponent(cfg.pixelId)}/events?access_token=${encodeURIComponent(
    cfg.accessToken
  )}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(function () {
    return null;
  });

  if (!res.ok || !json || json.error) {
    const message = (json && json.error && json.error.message) || `Meta CAPI error (${res.status})`;
    console.warn("meta_capi_error", {
      status: res.status,
      response: json || null,
    });
    return { ok: false, error: message };
  }

  console.log("meta_capi_ok", json);
  return { ok: true };
}

module.exports = { sendMetaPurchase };
