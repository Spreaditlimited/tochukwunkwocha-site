const crypto = require("crypto");

const COOKIE_NAME = "tws_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 12;

function getSecret() {
  const secret = String(process.env.ADMIN_SESSION_SECRET || "").trim();
  if (!secret) throw new Error("Missing ADMIN_SESSION_SECRET");
  return secret;
}

function base64UrlEncode(input) {
  return Buffer.from(String(input))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const normalized = String(input || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = normalized + (pad ? "=".repeat(4 - pad) : "");
  return Buffer.from(padded, "base64").toString("utf8");
}

function sign(payloadB64, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function readCookieHeader(event) {
  const headers = event && event.headers ? event.headers : {};
  return headers.cookie || headers.Cookie || "";
}

function parseCookieValue(cookieHeader, name) {
  const entries = String(cookieHeader || "").split(";");
  for (const entry of entries) {
    const [k, ...rest] = entry.trim().split("=");
    if (!k || k !== name) continue;
    return decodeURIComponent(rest.join("=") || "");
  }
  return "";
}

function isSecureRequest(event) {
  const headers = event && event.headers ? event.headers : {};
  const proto = String(headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "").toLowerCase();
  return process.env.NODE_ENV === "production" || proto === "https";
}

function buildSetCookie(event, value, maxAge) {
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Number(maxAge) || 0)}`,
  ];

  if (isSecureRequest(event)) attrs.push("Secure");
  return attrs.join("; ");
}

function createAdminSessionToken() {
  return createInternalSessionToken("admin");
}

function createInternalSessionToken(roleInput) {
  const role = String(roleInput || "admin").trim().toLowerCase() === "verifier" ? "verifier" : "admin";
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    role,
    iat: now,
    exp: now + SESSION_MAX_AGE,
    nonce: crypto.randomUUID(),
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(payloadJson);
  const signature = sign(payloadB64, getSecret());
  return `${payloadB64}.${signature}`;
}

function verifyAdminSessionToken(token) {
  const raw = String(token || "").trim();
  if (!raw || !raw.includes(".")) return { ok: false, error: "Missing session" };

  const [payloadB64, signature] = raw.split(".");
  if (!payloadB64 || !signature) return { ok: false, error: "Invalid session" };

  const expected = sign(payloadB64, getSecret());
  if (!safeEqual(signature, expected)) return { ok: false, error: "Invalid session" };

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch (_error) {
    return { ok: false, error: "Invalid session" };
  }

  const now = Math.floor(Date.now() / 1000);
  const role = String((payload && payload.role) || "").toLowerCase();
  if (!payload || (role !== "admin" && role !== "verifier")) return { ok: false, error: "Invalid session" };
  if (!Number.isFinite(payload.exp) || payload.exp < now) return { ok: false, error: "Session expired" };

  return { ok: true, payload };
}

function requireAdminSession(event) {
  return requireInternalSession(event, ["admin"]);
}

function requireVerifierSession(event) {
  return requireInternalSession(event, ["admin", "verifier"]);
}

function requireInternalSession(event, allowedRoles) {
  const roles = Array.isArray(allowedRoles) && allowedRoles.length ? new Set(allowedRoles.map((x) => String(x || "").trim().toLowerCase())) : new Set(["admin"]);
  let token = "";
  try {
    const cookieHeader = readCookieHeader(event);
    token = parseCookieValue(cookieHeader, COOKIE_NAME);
  } catch (_error) {
    token = "";
  }

  if (!token) return { ok: false, statusCode: 401, error: "Not signed in" };

  try {
    const verified = verifyAdminSessionToken(token);
    if (!verified.ok) return { ok: false, statusCode: 401, error: verified.error || "Invalid session" };
    const role = String((verified.payload && verified.payload.role) || "admin").toLowerCase();
    if (!roles.has(role)) return { ok: false, statusCode: 403, error: "Access denied" };
    return { ok: true, payload: verified.payload };
  } catch (error) {
    return { ok: false, statusCode: 500, error: error.message || "Auth error" };
  }
}

function setAdminCookieHeader(event) {
  return setInternalCookieHeader(event, "admin");
}

function setInternalCookieHeader(event, role) {
  return buildSetCookie(event, createInternalSessionToken(role), SESSION_MAX_AGE);
}

function clearAdminCookieHeader(event) {
  return buildSetCookie(event, "", 0);
}

function verifyAdminPassword(input) {
  const expected = String(process.env.ADMIN_DASHBOARD_PASSWORD || "");
  const provided = String(input || "");
  if (!expected) {
    return { ok: false, error: "Missing ADMIN_DASHBOARD_PASSWORD" };
  }
  if (!safeEqual(provided, expected)) {
    return { ok: false, error: "Invalid credentials" };
  }
  return { ok: true };
}

module.exports = {
  COOKIE_NAME,
  requireInternalSession,
  requireAdminSession,
  requireVerifierSession,
  setAdminCookieHeader,
  setInternalCookieHeader,
  clearAdminCookieHeader,
  verifyAdminPassword,
};
