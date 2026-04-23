const crypto = require("crypto");
const { hasPageAccess, normalizePath } = require("./admin-permissions");

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

function createAdminSessionToken(meta) {
  return createInternalSessionToken("admin", meta);
}

function createInternalSessionToken(roleInput, metaInput) {
  const role = String(roleInput || "admin").trim().toLowerCase() === "verifier" ? "verifier" : "admin";
  const meta = metaInput && typeof metaInput === "object" ? metaInput : {};
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    role,
    iat: now,
    exp: now + SESSION_MAX_AGE,
    nonce: crypto.randomUUID(),
    adminUuid: String(meta.adminUuid || "").trim().slice(0, 72),
    email: String(meta.email || "").trim().toLowerCase().slice(0, 220),
    fullName: String(meta.fullName || "").trim().slice(0, 180),
    isOwner: meta.isOwner === true,
    allowedPages: Array.isArray(meta.allowedPages) ? meta.allowedPages.map((x) => normalizePath(x)).filter(Boolean) : [],
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
  return requireInternalSession(event, ["admin"], { event });
}

function requireVerifierSession(event) {
  return requireInternalSession(event, ["admin", "verifier"], { event });
}

function extractFunctionNameFromEvent(event) {
  const p = String((event && event.path) || "").trim();
  if (!p) return "";
  const m = p.match(/\/\.netlify\/functions\/([^/?#]+)/i);
  return m && m[1] ? String(m[1]).trim().toLowerCase() : "";
}

function inferredPageForFunction(functionName) {
  const fn = String(functionName || "").trim().toLowerCase();
  if (!fn) return "";

  if (fn === "admin-student-security-alerts-list") return "/internal/";
  if (fn === "admin-learning-course-features") return "/internal/learning-support/";
  if (fn.startsWith("admin-manual-payments") || fn.startsWith("admin-payments-add-student") || fn.startsWith("admin-course-batches") || fn.startsWith("admin-coupons")) return "/internal/manual-payments/";
  if (fn.startsWith("admin-installments")) return "/internal/installments/";
  if (fn.startsWith("admin-domain") || fn.startsWith("admin-domains")) return "/internal/domain-management/";
  if (fn.startsWith("admin-learning-library") || fn.startsWith("admin-learning-module") || fn.startsWith("admin-learning-lessons") || fn.startsWith("admin-learning-course") || fn.startsWith("admin-learning-import") || fn.startsWith("admin-learning-cloudflare-sync") || fn.startsWith("admin-learning-stream-protection") || fn.startsWith("admin-learning-accessibility-autofill")) return "/internal/video-library/";
  if (fn.startsWith("admin-learning-progress")) return "/internal/learning-progress/";
  if (fn.startsWith("admin-learning-support") || fn.startsWith("admin-learning-access-") || fn.startsWith("admin-learning-transcript") || fn.startsWith("admin-learning-assignment") || fn.startsWith("admin-student-onboarding-resend") || fn.startsWith("admin-student-devices-reset")) return "/internal/learning-support/";
  if (fn.startsWith("admin-schools") || fn.startsWith("admin-school-update")) return "/internal/schools/";
  if (fn.startsWith("admin-school-call")) return "/internal/school-calls/";
  if (fn.startsWith("admin-school-scorecard")) return "/internal/school-scorecards/";
  if (fn.startsWith("admin-tochukwu-settings") || fn.startsWith("admin-admin-accounts") || fn.startsWith("admin-send-test-email")) return "/internal/settings/";

  return "";
}

function requireInternalSession(event, allowedRoles, options) {
  const opts = options && typeof options === "object" ? options : {};
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

    if (role === "admin") {
      const explicitPage = normalizePath(opts.pagePath || "");
      const functionName = extractFunctionNameFromEvent(opts.event || event);
      const inferredPage = explicitPage || inferredPageForFunction(functionName);
      const noPageNeeded = new Set(["admin-session", "admin-course-slugs-list"]);
      if (verified.payload && verified.payload.isOwner !== true && functionName.indexOf("admin-") === 0 && !inferredPage && !noPageNeeded.has(functionName)) {
        return { ok: false, statusCode: 403, error: "Access denied for this page" };
      }
      if (inferredPage && !hasPageAccess(verified.payload, inferredPage)) {
        return { ok: false, statusCode: 403, error: "Access denied for this page" };
      }
    }

    return { ok: true, payload: verified.payload };
  } catch (error) {
    return { ok: false, statusCode: 500, error: error.message || "Auth error" };
  }
}

function setAdminCookieHeader(event, meta) {
  return setInternalCookieHeader(event, "admin", meta);
}

function setInternalCookieHeader(event, role, meta) {
  return buildSetCookie(event, createInternalSessionToken(role, meta), SESSION_MAX_AGE);
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
