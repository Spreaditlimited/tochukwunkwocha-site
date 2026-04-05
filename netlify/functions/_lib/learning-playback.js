const crypto = require("crypto");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function b64url(input) {
  return Buffer.from(String(input || ""), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signRs256(message, privateKeyPem) {
  const sig = crypto.sign("RSA-SHA256", Buffer.from(message, "utf8"), {
    key: privateKeyPem,
  });
  return sig
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function streamSigningConfig() {
  const keyId = clean(process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID, 120);
  const privateKeyRaw = String(process.env.CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY || "").trim();
  const privateKey = privateKeyRaw ? privateKeyRaw.replace(/\\n/g, "\n") : "";
  const ttlInput = Number(process.env.CLOUDFLARE_STREAM_TOKEN_TTL_SECONDS || 300);
  const ttlSeconds = Math.max(120, Math.min(Number.isFinite(ttlInput) ? ttlInput : 300, 60 * 60 * 12));
  if (!keyId) throw new Error("Missing CLOUDFLARE_STREAM_SIGNING_KEY_ID");
  if (!privateKey) throw new Error("Missing CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY");
  return { keyId, privateKey, ttlSeconds };
}

function streamEmbedBase(videoUid, hlsUrl) {
  const uid = clean(videoUid, 140);
  if (!uid) return "";
  const hls = clean(hlsUrl, 1200);
  if (hls && hls.indexOf("cloudflarestream.com") !== -1) {
    try {
      const parsed = new URL(hls);
      return `https://${parsed.hostname}/${encodeURIComponent(uid)}/iframe`;
    } catch (_error) {}
  }
  return `https://iframe.videodelivery.net/${encodeURIComponent(uid)}`;
}

function createSignedPlaybackToken(videoUid) {
  const uid = clean(videoUid, 140);
  if (!uid) throw new Error("video_uid is required");
  const cfg = streamSigningConfig();
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + cfg.ttlSeconds;
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: cfg.keyId,
  };
  const payload = {
    sub: uid,
    iat: nowSec,
    nbf: nowSec - 10,
    exp,
  };
  const encodedHeader = b64url(JSON.stringify(header));
  const encodedPayload = b64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signRs256(signingInput, cfg.privateKey);
  return {
    token: `${signingInput}.${signature}`,
    expires_at: new Date(exp * 1000).toISOString(),
    ttl_seconds: cfg.ttlSeconds,
  };
}

function buildSignedLessonEmbedUrl(input) {
  const uid = clean(input && input.video_uid, 140);
  const hls = clean(input && input.hls_url, 1200);
  if (!uid) throw new Error("video_uid is required");
  const base = streamEmbedBase(uid, hls);
  if (!base) throw new Error("Could not build playback URL");
  const signed = createSignedPlaybackToken(uid);
  const sep = base.indexOf("?") === -1 ? "?" : "&";
  const refreshAfterSeconds = Math.max(45, signed.ttl_seconds - 60);
  return {
    embed_url: `${base}${sep}token=${encodeURIComponent(signed.token)}`,
    expires_at: signed.expires_at,
    ttl_seconds: signed.ttl_seconds,
    refresh_after_seconds: refreshAfterSeconds,
  };
}

module.exports = {
  buildSignedLessonEmbedUrl,
  createSignedPlaybackToken,
};
