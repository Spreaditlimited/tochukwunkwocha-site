const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

function recaptchaEnabled() {
  return Boolean(String(process.env.RECAPTCHA_SITE_KEY || "").trim() && String(process.env.RECAPTCHA_SECRET_KEY || "").trim());
}

function minScore() {
  const raw = Number(process.env.RECAPTCHA_MIN_SCORE || 0.5);
  if (!Number.isFinite(raw)) return 0.5;
  return Math.min(0.99, Math.max(0.1, raw));
}

function firstHeader(headers, keys) {
  const src = headers && typeof headers === "object" ? headers : {};
  for (const key of keys || []) {
    if (!key) continue;
    const direct = src[key];
    if (direct) return String(direct);
    const lower = src[String(key).toLowerCase()];
    if (lower) return String(lower);
  }
  return "";
}

function clientIpFromEvent(event) {
  const headers = (event && event.headers) || {};
  const xff = firstHeader(headers, ["x-forwarded-for"]);
  if (xff) {
    const first = String(xff).split(",")[0];
    return String(first || "").trim();
  }
  return firstHeader(headers, ["x-nf-client-connection-ip", "client-ip"]);
}

async function verifyRecaptchaToken(input) {
  const payload = input && typeof input === "object" ? input : {};
  const token = String(payload.token || "").trim();
  const expectedAction = String(payload.expectedAction || "").trim();
  if (!recaptchaEnabled()) {
    return { ok: true, skipped: true, reason: "recaptcha_not_configured" };
  }
  if (!token) {
    return { ok: false, reason: "missing_token", score: 0 };
  }
  const secret = String(process.env.RECAPTCHA_SECRET_KEY || "").trim();
  const params = new URLSearchParams();
  params.set("secret", secret);
  params.set("response", token);
  if (payload.remoteip) params.set("remoteip", String(payload.remoteip));

  let result;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(function () {
      controller.abort();
    }, 8000);
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    result = await res.json();
  } catch (_error) {
    return { ok: false, reason: "verify_unreachable", score: 0 };
  }

  const success = Boolean(result && result.success);
  const action = String((result && result.action) || "").trim();
  const score = Number(result && result.score);
  const scoreOk = Number.isFinite(score) ? score >= minScore() : false;
  const actionOk = expectedAction ? action === expectedAction : true;

  if (!success) return { ok: false, reason: "verify_failed", action, score: Number.isFinite(score) ? score : 0 };
  if (!actionOk) return { ok: false, reason: "action_mismatch", action, score: Number.isFinite(score) ? score : 0 };
  if (!scoreOk) return { ok: false, reason: "score_too_low", action, score: Number.isFinite(score) ? score : 0 };

  return { ok: true, action, score };
}

module.exports = {
  recaptchaEnabled,
  verifyRecaptchaToken,
  clientIpFromEvent,
};

