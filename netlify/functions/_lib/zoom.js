const crypto = require("crypto");

let tokenCache = {
  token: "",
  expiresAtMs: 0,
};

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 400);
}

function requiredEnv(name) {
  const value = clean(process.env[name], 400);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function fetchZoomAccessToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAtMs - 30000 > now) {
    return tokenCache.token;
  }

  const accountId = requiredEnv("ZOOM_ACCOUNT_ID");
  const clientId = requiredEnv("ZOOM_CLIENT_ID");
  const clientSecret = requiredEnv("ZOOM_CLIENT_SECRET");

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  const json = await res.json().catch(function () {
    return null;
  });

  if (!res.ok || !json || !json.access_token) {
    const message = (json && (json.reason || json.message || json.error)) || `Zoom auth error ${res.status}`;
    throw new Error(message);
  }

  const expiresIn = Number(json.expires_in || 3600);
  tokenCache = {
    token: String(json.access_token),
    expiresAtMs: now + Math.max(60, expiresIn) * 1000,
  };

  return tokenCache.token;
}

async function zoomApi(method, path, body) {
  const token = await fetchZoomAccessToken();
  const res = await fetch(`https://api.zoom.us/v2${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) {
    return { ok: true, data: null };
  }

  const json = await res.json().catch(function () {
    return null;
  });

  if (!res.ok) {
    const message = (json && (json.message || json.reason || json.error)) || `Zoom API error ${res.status}`;
    return { ok: false, error: message, status: res.status, data: json };
  }

  return { ok: true, data: json };
}

function defaultHostId() {
  return clean(process.env.ZOOM_HOST_USER_ID, 120);
}

async function createZoomMeeting(input) {
  const hostId = clean((input && input.hostId) || "", 120) || defaultHostId();
  if (!hostId) {
    return { ok: false, error: "Missing ZOOM_HOST_USER_ID" };
  }

  const payload = {
    topic: clean((input && input.topic) || "School Call", 200) || "School Call",
    type: 2,
    start_time: clean((input && input.startTimeIso) || "", 64),
    duration: Math.max(15, Math.min(180, Number((input && input.durationMinutes) || 30) || 30)),
    timezone: clean((input && input.timezone) || "UTC", 80) || "UTC",
    agenda: clean((input && input.agenda) || "", 1500),
    settings: {
      join_before_host: false,
      waiting_room: true,
      approval_type: 2,
      mute_upon_entry: true,
      registrants_email_notification: false,
    },
  };

  return zoomApi("POST", `/users/${encodeURIComponent(hostId)}/meetings`, payload);
}

async function updateZoomMeeting(meetingId, input) {
  const id = clean(meetingId, 120);
  if (!id) return { ok: false, error: "meetingId is required" };

  const payload = {
    start_time: clean((input && input.startTimeIso) || "", 64),
    duration: Math.max(15, Math.min(180, Number((input && input.durationMinutes) || 30) || 30)),
    timezone: clean((input && input.timezone) || "UTC", 80) || "UTC",
    agenda: clean((input && input.agenda) || "", 1500),
    topic: clean((input && input.topic) || "School Call", 200) || "School Call",
  };

  return zoomApi("PATCH", `/meetings/${encodeURIComponent(id)}`, payload);
}

async function cancelZoomMeeting(meetingId) {
  const id = clean(meetingId, 120);
  if (!id) return { ok: false, error: "meetingId is required" };
  return zoomApi("DELETE", `/meetings/${encodeURIComponent(id)}`);
}

async function getZoomMeeting(meetingId) {
  const id = clean(meetingId, 120);
  if (!id) return { ok: false, error: "meetingId is required" };
  return zoomApi("GET", `/meetings/${encodeURIComponent(id)}`);
}

function verifyZoomWebhook(event) {
  const secret = clean(process.env.ZOOM_WEBHOOK_SECRET_TOKEN, 400);
  if (!secret) return { ok: false, error: "Missing ZOOM_WEBHOOK_SECRET_TOKEN" };

  const headers = event && event.headers ? event.headers : {};
  const signature = clean(headers["x-zm-signature"] || headers["X-Zm-Signature"], 255);
  const timestamp = clean(headers["x-zm-request-timestamp"] || headers["X-Zm-Request-Timestamp"], 64);
  const body = String((event && event.body) || "");

  if (!signature || !timestamp) return { ok: false, error: "Missing signature headers" };

  const message = `v0:${timestamp}:${body}`;
  const hash = crypto.createHmac("sha256", secret).update(message).digest("hex");
  const expected = `v0=${hash}`;

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "Invalid webhook signature" };
  }

  return { ok: true };
}

module.exports = {
  createZoomMeeting,
  updateZoomMeeting,
  cancelZoomMeeting,
  getZoomMeeting,
  verifyZoomWebhook,
};
