const crypto = require("crypto");

function clean(value) {
  return String(value || "").trim();
}

function firstHeader(headers, names) {
  const src = headers && typeof headers === "object" ? headers : {};
  for (const name of names || []) {
    if (!name) continue;
    const direct = src[name];
    if (direct) return String(direct);
    const lower = src[String(name).toLowerCase()];
    if (lower) return String(lower);
  }
  return "";
}

function parseCookieValue(cookieHeader, key) {
  const raw = String(cookieHeader || "");
  if (!raw || !key) return "";
  const parts = raw.split(";");
  const wanted = String(key).trim();
  for (const chunk of parts) {
    const idx = chunk.indexOf("=");
    if (idx < 0) continue;
    const name = chunk.slice(0, idx).trim();
    if (name !== wanted) continue;
    return chunk.slice(idx + 1).trim();
  }
  return "";
}

function getClientIp(headers) {
  const forwarded = firstHeader(headers, ["x-forwarded-for", "client-ip", "x-nf-client-connection-ip"]);
  if (!forwarded) return "";
  return String(forwarded).split(",")[0].trim();
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
  const apiVersion = clean(process.env.META_GRAPH_API_VERSION) || "v17.0";
  const testEventCode = clean(process.env.META_TEST_EVENT_CODE);
  return { pixelId, accessToken, apiVersion, testEventCode };
}

function sha256(value) {
  return crypto.createHash("sha256").update(clean(value).toLowerCase()).digest("hex");
}

function normalizePhone(value) {
  return clean(value).replace(/[^\d]/g, "");
}

function normalizeNamePart(value) {
  return clean(value).toLowerCase().replace(/[^a-z]/g, "");
}

function splitFullName(value) {
  const parts = clean(value)
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { fn: "", ln: "" };
  if (parts.length === 1) return { fn: parts[0], ln: "" };
  return { fn: parts[0], ln: parts.slice(1).join(" ") };
}

function buildMetaUserData(input) {
  const email = clean(input && input.email);
  const externalId = clean(input && input.externalId) || email.toLowerCase();
  const fbp = clean(input && input.fbp);
  const fbc = clean(input && input.fbc);
  const clientIpAddress = clean(input && input.clientIpAddress);
  const clientUserAgent = clean(input && input.clientUserAgent);
  const phone = normalizePhone(input && input.phone);
  const fullName = clean(input && input.fullName);
  const split = splitFullName(fullName);
  const fn = normalizeNamePart(split.fn);
  const ln = normalizeNamePart(split.ln);

  return {
    em: email ? [sha256(email)] : undefined,
    ph: phone ? [sha256(phone)] : undefined,
    fn: fn ? [sha256(fn)] : undefined,
    ln: ln ? [sha256(ln)] : undefined,
    external_id: externalId ? [sha256(externalId)] : undefined,
    fbp: fbp || undefined,
    fbc: fbc || undefined,
    client_ip_address: clientIpAddress || undefined,
    client_user_agent: clientUserAgent || undefined,
  };
}

function requestContextToMetaData(requestContext) {
  const headers = requestContext && requestContext.headers ? requestContext.headers : {};
  const cookieHeader = firstHeader(headers, ["cookie"]);
  return {
    fbp: parseCookieValue(cookieHeader, "_fbp"),
    fbc: parseCookieValue(cookieHeader, "_fbc"),
    clientUserAgent: firstHeader(headers, ["user-agent"]),
    clientIpAddress: getClientIp(headers),
  };
}

async function sendMetaEvent(input) {
  const cfg = getMetaConfig();
  if (!cfg) return { ok: false, skipped: true, error: "Missing Meta Pixel config" };

  const eventName = clean(input && input.eventName);
  if (!eventName) return { ok: false, skipped: true, error: "Missing eventName" };

  const eventId = clean(input && input.eventId) || `${eventName.toLowerCase()}_${Date.now()}`;
  const eventTime = Number(input && input.eventTime) || Math.floor(Date.now() / 1000);
  const actionSource = clean(input && input.actionSource) || "website";
  const eventSourceUrl = clean(input && input.eventSourceUrl);
  const userData = buildMetaUserData(input);

  if (!userData.em && !userData.ph && !userData.external_id && !userData.fbp && !userData.fbc) {
    return { ok: false, skipped: true, error: "Missing user matching signals" };
  }

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime,
        event_id: eventId,
        action_source: actionSource,
        event_source_url: eventSourceUrl || undefined,
        user_data: userData,
        custom_data: input && typeof input.customData === "object" ? input.customData : undefined,
      },
    ],
    test_event_code: cfg.testEventCode || undefined,
  };

  const url = `https://graph.facebook.com/${encodeURIComponent(cfg.apiVersion)}/${encodeURIComponent(
    cfg.pixelId
  )}/events?access_token=${encodeURIComponent(cfg.accessToken)}`;

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
      eventName,
      status: res.status,
      response: json || null,
    });
    return { ok: false, error: message, response: json || null, status: res.status };
  }

  console.log("meta_capi_ok", { eventName, response: json });
  return { ok: true, response: json || null, status: res.status };
}

async function sendMetaPurchase(input) {
  const eventId = clean(input && input.eventId) || `purchase_${Date.now()}`;
  const value = Number(input && input.value);
  const currency = clean(input && input.currency) || "NGN";
  const contentName = clean(input && input.contentName) || "Course";
  const contentIds = Array.isArray(input && input.contentIds) ? input.contentIds : [];
  return sendMetaEvent({
    eventName: "Purchase",
    eventId,
    eventTime: Number(input && input.eventTime) || Math.floor(Date.now() / 1000),
    eventSourceUrl: clean(input && input.eventSourceUrl),
    email: clean(input && input.email),
    phone: clean(input && input.phone),
    fullName: clean(input && input.fullName),
    externalId: clean(input && input.externalId),
    fbp: clean(input && input.fbp),
    fbc: clean(input && input.fbc),
    clientIpAddress: clean(input && input.clientIpAddress),
    clientUserAgent: clean(input && input.clientUserAgent),
    customData: {
      value: Number.isFinite(value) ? value : undefined,
      currency,
      content_name: contentName,
      content_type: "product",
      content_ids: contentIds,
    },
  });
}

async function sendMetaLead(input) {
  const eventId = clean(input && input.eventId) || `lead_${Date.now()}`;
  return sendMetaEvent({
    eventName: "Lead",
    eventId,
    eventTime: Number(input && input.eventTime) || Math.floor(Date.now() / 1000),
    eventSourceUrl: clean(input && input.eventSourceUrl),
    email: clean(input && input.email),
    phone: clean(input && input.phone),
    fullName: clean(input && input.fullName),
    externalId: clean(input && input.externalId),
    fbp: clean(input && input.fbp),
    fbc: clean(input && input.fbc),
    clientIpAddress: clean(input && input.clientIpAddress),
    clientUserAgent: clean(input && input.clientUserAgent),
    customData: input && typeof input.customData === "object" ? input.customData : undefined,
  });
}

module.exports = { sendMetaPurchase, sendMetaLead, sendMetaEvent, requestContextToMetaData };
