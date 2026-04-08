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

function looksLikeJwkObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && !!String(value.kty || "").trim();
}

function parseJwkString(value) {
  var raw = String(value || "").trim();
  if (!raw || raw.charAt(0) !== "{") return null;
  try {
    var parsed = JSON.parse(raw);
    return looksLikeJwkObject(parsed) ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function decodeBase64TextIfWrapped(value) {
  var raw = String(value || "").trim();
  if (!raw || raw.indexOf("-----BEGIN") !== -1) return raw;
  var normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) return raw;
  try {
    var decoded = Buffer.from(normalized, "base64").toString("utf8").trim();
    if (!decoded) return raw;
    if (decoded.indexOf("-----BEGIN") !== -1 || decoded.charAt(0) === "{") return decoded;
    return raw;
  } catch (_error) {
    return raw;
  }
}

function signRs256(message, privateKeyPem) {
  const keyObj = parseSupportedPrivateKey(privateKeyPem);
  const sig = crypto.sign("RSA-SHA256", Buffer.from(message, "utf8"), {
    key: keyObj,
  });
  return sig
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizePrivateKeyPem(rawValue) {
  var value = decodeBase64TextIfWrapped(rawValue);
  value = String(value || "").trim();
  if (!value) return "";

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  value = value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  value = value.replace(/-----BEGIN ([A-Z0-9 ]+)-----\s*/g, "-----BEGIN $1-----\n");
  value = value.replace(/\s*-----END ([A-Z0-9 ]+)-----/g, "\n-----END $1-----");
  value = value.replace(/\n{3,}/g, "\n\n").trim();
  return value;
}

function parseSupportedPrivateKey(rawValue) {
  if (looksLikeJwkObject(rawValue)) {
    const keyObj = crypto.createPrivateKey({ key: rawValue, format: "jwk" });
    const keyType = String(keyObj && keyObj.asymmetricKeyType || "").toLowerCase();
    if (keyType === "rsa" || keyType === "rsa-pss") return keyObj;
    throw new Error(`Unsupported key type "${keyType || "unknown"}"`);
  }
  var jwkFromString = parseJwkString(decodeBase64TextIfWrapped(rawValue));
  if (jwkFromString) {
    const keyObj = crypto.createPrivateKey({ key: jwkFromString, format: "jwk" });
    const keyType = String(keyObj && keyObj.asymmetricKeyType || "").toLowerCase();
    if (keyType === "rsa" || keyType === "rsa-pss") return keyObj;
    throw new Error(`Unsupported key type "${keyType || "unknown"}"`);
  }
  const pem = normalizePrivateKeyPem(rawValue);
  const attempts = [];
  if (pem) {
    attempts.push(function () {
      return crypto.createPrivateKey({ key: pem, format: "pem" });
    });
  }

  const compactBase64 = String(rawValue || "").trim().replace(/\s+/g, "");
  if (compactBase64 && /^[A-Za-z0-9+/=]+$/.test(compactBase64)) {
    const der = Buffer.from(compactBase64, "base64");
    attempts.push(function () {
      return crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    });
    attempts.push(function () {
      return crypto.createPrivateKey({ key: der, format: "der", type: "pkcs1" });
    });
  }

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const keyObj = attempt();
      const keyType = String(keyObj && keyObj.asymmetricKeyType || "").toLowerCase();
      if (keyType === "rsa" || keyType === "rsa-pss") return keyObj;
      throw new Error(`Unsupported key type "${keyType || "unknown"}"`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Unsupported private key format");
}

function assertSupportedPrivateKey(privateKeyRaw) {
  try {
    parseSupportedPrivateKey(privateKeyRaw);
  } catch (error) {
    var msg = clean(error && error.message, 260) || "invalid key";
    throw new Error(
      "Invalid CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY format. Re-save the key in Internal Settings or regenerate it from Video Library. (" + msg + ")"
    );
  }
}

function streamSigningConfig() {
  const keyId = clean(process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID, 120);
  const privateKeyRaw = String(process.env.CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY || "");
  const privateKey = normalizePrivateKeyPem(privateKeyRaw) || privateKeyRaw;
  const ttlInput = Number(process.env.CLOUDFLARE_STREAM_TOKEN_TTL_SECONDS || 300);
  const ttlSeconds = Math.max(120, Math.min(Number.isFinite(ttlInput) ? ttlInput : 300, 60 * 60 * 12));
  if (!keyId) throw new Error("Missing CLOUDFLARE_STREAM_SIGNING_KEY_ID");
  if (!privateKey) throw new Error("Missing CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY");
  assertSupportedPrivateKey(privateKeyRaw);
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

function segmentMatchesUid(segment, uid) {
  var raw = String(segment || "");
  var target = String(uid || "");
  if (!raw || !target) return false;
  if (raw === target) return true;
  try {
    return decodeURIComponent(raw) === target;
  } catch (_error) {
    return false;
  }
}

function replaceVideoUidWithToken(baseUrl, videoUid, token) {
  var base = clean(baseUrl, 2000);
  var uid = clean(videoUid, 140);
  var signedToken = clean(token, 4000);
  if (!base || !uid || !signedToken) throw new Error("Could not build signed playback URL");

  var parsed;
  try {
    parsed = new URL(base);
  } catch (_error) {
    throw new Error("Could not build signed playback URL");
  }
  var parts = parsed.pathname.split("/");
  var idx = -1;
  for (var i = 0; i < parts.length; i += 1) {
    if (segmentMatchesUid(parts[i], uid)) {
      idx = i;
      break;
    }
  }
  if (idx === -1) throw new Error("Could not build signed playback URL");
  parts[idx] = signedToken;
  parsed.pathname = parts.join("/");
  return parsed.toString();
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
    kid: cfg.keyId,
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
  const refreshAfterSeconds = Math.max(45, signed.ttl_seconds - 60);
  return {
    embed_url: replaceVideoUidWithToken(base, uid, signed.token),
    expires_at: signed.expires_at,
    ttl_seconds: signed.ttl_seconds,
    refresh_after_seconds: refreshAfterSeconds,
  };
}

module.exports = {
  buildSignedLessonEmbedUrl,
  createSignedPlaybackToken,
};
