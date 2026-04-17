const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const crypto = require("crypto");
const {
  ensureLearningTables,
  VIDEO_ASSETS_TABLE,
  LESSONS_TABLE,
  clean,
  extractCloudflareStreamUid,
} = require("./_lib/learning");
const {
  ensureAdminSettingsTable,
  upsertAdminSettings,
} = require("./_lib/admin-settings");

function cfConfig() {
  const accountId = clean(process.env.CLOUDFLARE_ACCOUNT_ID, 120);
  const token = clean(process.env.CLOUDFLARE_STREAM_API_TOKEN, 500);
  if (!accountId) throw new Error("Missing CLOUDFLARE_ACCOUNT_ID. Set it in Internal Settings.");
  if (!token) throw new Error("Missing CLOUDFLARE_STREAM_API_TOKEN. Set it in Internal Settings.");
  return { accountId, token };
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

function looksLikeJwkObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const kty = String(value.kty || "").toUpperCase();
  return !!kty;
}

function parseJwkString(value) {
  const raw = decodeBase64TextIfWrapped(value);
  const text = String(raw || "").trim();
  if (!text || text.charAt(0) !== "{") return null;
  try {
    const parsed = JSON.parse(text);
    return looksLikeJwkObject(parsed) ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function decodeBase64TextIfWrapped(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.indexOf("-----BEGIN") !== -1) return raw;
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) return raw;
  try {
    const decoded = Buffer.from(normalized, "base64").toString("utf8").trim();
    if (!decoded) return raw;
    if (decoded.indexOf("-----BEGIN") !== -1 || decoded.charAt(0) === "{") return decoded;
    return raw;
  } catch (_error) {
    return raw;
  }
}

function valueShape(value) {
  if (value === null || value === undefined) return "missing";
  if (typeof value === "string") return `string(len=${value.length})`;
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return `array(len=${value.length})`;
  if (typeof value === "object") return `object(keys=${Object.keys(value).slice(0, 12).join(",")})`;
  return typeof value;
}

function firstLine(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.split(/\r?\n/)[0].slice(0, 180);
}

function parseJwkMeta(value) {
  const raw = decodeBase64TextIfWrapped(value);
  const text = String(raw || "").trim();
  if (!text) return { is_json: false, is_jwk: false, kty: "", keys: [] };
  try {
    const parsed = JSON.parse(text);
    const isObject = !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
    const isJwk = isObject && looksLikeJwkObject(parsed);
    return {
      is_json: true,
      is_jwk: isJwk,
      kty: isObject ? String(parsed.kty || "") : "",
      keys: isObject ? Object.keys(parsed).slice(0, 20) : [],
    };
  } catch (_error) {
    return { is_json: false, is_jwk: false, kty: "", keys: [] };
  }
}

function cloudflareKeyDebugSummary(result) {
  const safe = result && typeof result === "object" ? result : {};
  const privateKey = safe.privateKey && typeof safe.privateKey === "object" ? safe.privateKey : null;
  const pemRaw = String(safe.pem || "");
  const jwkRaw = safe.jwk;
  const jwkMeta = typeof jwkRaw === "string"
    ? parseJwkMeta(jwkRaw)
    : {
        is_json: looksLikeJwkObject(jwkRaw),
        is_jwk: looksLikeJwkObject(jwkRaw),
        kty: looksLikeJwkObject(jwkRaw) ? String(jwkRaw.kty || "") : "",
        keys: looksLikeJwkObject(jwkRaw) ? Object.keys(jwkRaw).slice(0, 20) : [],
      };
  return {
    result_keys: Object.keys(safe).slice(0, 20),
    id_shape: valueShape(safe.id || safe.key_id),
    pem_shape: valueShape(safe.pem),
    pem_begin_line: firstLine(pemRaw),
    pem_has_private_header: /BEGIN (RSA |EC |OPENSSH |ENCRYPTED |)PRIVATE KEY/.test(pemRaw),
    pem_has_public_header: /BEGIN PUBLIC KEY/.test(pemRaw),
    private_key_shape: valueShape(safe.private_key),
    privateKey_shape: valueShape(safe.privateKey),
    key_shape: valueShape(safe.key),
    secret_shape: valueShape(safe.secret),
    jwk_shape: valueShape(safe.jwk),
    jwk_is_json: !!jwkMeta.is_json,
    jwk_is_jwk: !!jwkMeta.is_jwk,
    jwk_kty: jwkMeta.kty || "",
    jwk_keys: Array.isArray(jwkMeta.keys) ? jwkMeta.keys : [],
    privateKey_nested_keys: privateKey ? Object.keys(privateKey).slice(0, 20) : [],
    privateKey_nested_pem_shape: privateKey ? valueShape(privateKey.pem) : "missing",
    privateKey_nested_private_key_shape: privateKey ? valueShape(privateKey.private_key) : "missing",
    privateKey_nested_privateKey_shape: privateKey ? valueShape(privateKey.privateKey) : "missing",
    privateKey_nested_jwk_shape: privateKey ? valueShape(privateKey.jwk) : "missing",
  };
}

function extractPrivateKeyCandidate(result) {
  if (!result || typeof result !== "object") return "";
  const direct = [
    result.pem,
    result.privateKey,
    result.private_key,
    result.key,
    result.secret,
    result.jwk,
  ];
  for (const candidate of direct) {
    if (looksLikeJwkObject(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  if (result.privateKey && typeof result.privateKey === "object") {
    if (looksLikeJwkObject(result.privateKey)) return result.privateKey;
    if (typeof result.privateKey.pem === "string") return result.privateKey.pem;
    if (typeof result.privateKey.private_key === "string") return result.privateKey.private_key;
    if (typeof result.privateKey.privateKey === "string") return result.privateKey.privateKey;
    if (looksLikeJwkObject(result.privateKey.jwk)) return result.privateKey.jwk;
  }
  return "";
}

function extractPrivateKeyCandidates(result) {
  if (!result || typeof result !== "object") return [];
  const values = [
    result.pem,
    result.private_key,
    result.privateKey,
    result.key,
    result.secret,
    result.jwk,
  ];
  if (result.privateKey && typeof result.privateKey === "object") {
    values.push(
      result.privateKey.pem,
      result.privateKey.private_key,
      result.privateKey.privateKey,
      result.privateKey.jwk
    );
  }
  return values.filter(function (item) {
    if (looksLikeJwkObject(item)) return true;
    if (typeof item === "string" && item.trim()) return true;
    return false;
  });
}

function parseRsaPrivateKey(rawValue) {
  if (looksLikeJwkObject(rawValue)) {
    const keyObj = crypto.createPrivateKey({ key: rawValue, format: "jwk" });
    const keyType = String(keyObj && keyObj.asymmetricKeyType || "").toLowerCase();
    if (keyType === "rsa" || keyType === "rsa-pss") return keyObj;
    throw new Error(`Unsupported key type "${keyType || "unknown"}"`);
  }
  const jwkFromString = parseJwkString(decodeBase64TextIfWrapped(rawValue));
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

function canonicalPemFromPrivateKey(rawValue) {
  const keyObj = parseRsaPrivateKey(rawValue);
  const exported = keyObj.export({ format: "pem", type: "pkcs8" });
  return Buffer.isBuffer(exported) ? exported.toString("utf8") : String(exported || "");
}

function isValidRsaPrivateKey(rawValue) {
  try {
    parseRsaPrivateKey(rawValue);
    return true;
  } catch (_error) {
    return false;
  }
}

async function cfRequest(pathname, config, options) {
  const method = (options && options.method) || "GET";
  const payload = options && Object.prototype.hasOwnProperty.call(options, "json") ? options.json : null;
  const res = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: payload === null ? undefined : JSON.stringify(payload),
  });
  const body = await res.json().catch(function () {
    return null;
  });
  if (!res.ok || !body || body.success !== true) {
    const errMsg =
      (body && Array.isArray(body.errors) && body.errors[0] && body.errors[0].message) ||
      (body && body.message) ||
      `Cloudflare request failed (${res.status})`;
    if (String(errMsg).toLowerCase().indexOf("authentication error") !== -1) {
      throw new Error(
        "Cloudflare authentication error. Verify CLOUDFLARE_STREAM_API_TOKEN is valid for this account and has Stream edit permission, and CLOUDFLARE_ACCOUNT_ID matches the same account."
      );
    }
    if (res.status === 403) {
      throw new Error(
        "Cloudflare permission denied (403). The API token needs Stream edit permission on the target account."
      );
    }
    throw new Error(errMsg);
  }
  return body;
}

async function ensureSigningKey(pool, config, adminEmail, input) {
  const forceRotate = Boolean(input && input.forceRotate);
  const existingKeyId = clean(process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID, 120);
  const existingPemRaw = String(process.env.CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY || "");
  const existingPem = normalizePrivateKeyPem(existingPemRaw);
  if (!forceRotate && existingKeyId && existingPem && isValidRsaPrivateKey(existingPem)) {
    return {
      key_id: existingKeyId,
      source: "existing",
      created: false,
      rotated: false,
    };
  }

  const created = await cfRequest(
    `/accounts/${encodeURIComponent(config.accountId)}/stream/keys`,
    config,
    { method: "POST", json: {} }
  );

  const result = created && created.result ? created.result : {};
  const debugSummary = cloudflareKeyDebugSummary(result);
  const parsedJwk = parseJwkString(result.jwk);
  const keyIdFromJwk = clean(parsedJwk && parsedJwk.kid, 120);
  const keyIdFromCreate = clean(result.id || result.key_id, 120);
  const privateKeyRaw = extractPrivateKeyCandidate(result);
  const privateKey = normalizePrivateKeyPem(privateKeyRaw) || (typeof privateKeyRaw === "string" ? String(privateKeyRaw || "").trim() : privateKeyRaw);
  if (!keyIdFromCreate || !privateKey) {
    const err = new Error("Could not create Cloudflare Stream signing key. Missing key id/private key from Cloudflare response.");
    err.debug = debugSummary;
    throw err;
  }
  if (!isValidRsaPrivateKey(privateKey)) {
    const err = new Error("Cloudflare returned an unsupported signing private key format. Please regenerate and retry.");
    err.debug = debugSummary;
    throw err;
  }
  const canonicalPem = canonicalPemFromPrivateKey(privateKey);
  const keyId = keyIdFromJwk || keyIdFromCreate;

  await ensureAdminSettingsTable(pool);
  await upsertAdminSettings(pool, {
    updatedBy: clean(adminEmail, 120) || "admin",
    entries: [
      { key: "CLOUDFLARE_STREAM_SIGNING_KEY_ID", value: keyId },
      { key: "CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY", value: canonicalPem },
      {
        key: "CLOUDFLARE_STREAM_TOKEN_TTL_SECONDS",
        value: clean(process.env.CLOUDFLARE_STREAM_TOKEN_TTL_SECONDS, 20) || "300",
      },
    ],
  });
  await applyRuntimeSettings(pool, { force: true });

  return {
    key_id: keyId,
    key_id_source: keyIdFromJwk ? "jwk.kid" : "result.id",
    source: forceRotate
      ? "rotated_and_saved"
      : (existingKeyId || existingPem ? "replaced_invalid_and_saved" : "created_and_saved"),
    created: true,
    rotated: forceRotate,
  };
}

function classifyFailure(message) {
  const text = String(message || "").toLowerCase();
  if (!text) return "unknown";
  if (text.indexOf("invalid_uid") !== -1 || text.indexOf("invalid uid") !== -1) return "invalid_uid";
  if (text.indexOf("not found") !== -1 || text.indexOf("resource not found") !== -1) return "not_found";
  if (text.indexOf("permission") !== -1 || text.indexOf("forbidden") !== -1 || text.indexOf("unauthorized") !== -1 || text.indexOf("authentication") !== -1) return "permission";
  if (text.indexOf("invalid") !== -1 || text.indexOf("malformed") !== -1) return "invalid_request";
  return "other";
}

async function listCloudflareUids(config) {
  const set = new Set();
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= 200) {
    const payload = await cfRequest(
      `/accounts/${encodeURIComponent(config.accountId)}/stream?per_page=100&page=${page}`,
      config,
      { method: "GET" }
    );
    const rows = Array.isArray(payload && payload.result) ? payload.result : [];
    rows.forEach(function (row) {
      const uid = extractCloudflareStreamUid(row && row.uid);
      if (uid) set.add(uid);
    });
    const info = payload && payload.result_info ? payload.result_info : {};
    totalPages = Number(info.total_pages || totalPages || 1) || 1;
    page += 1;
  }
  return set;
}

async function runWithConcurrency(items, concurrency, worker) {
  const queue = Array.isArray(items) ? items.slice() : [];
  const limit = Math.max(1, Number(concurrency) || 1);
  const runners = new Array(Math.min(limit, queue.length || 1)).fill(null).map(async function () {
    while (queue.length) {
      const item = queue.shift();
      if (item === undefined) break;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  let body = {};
  try {
    body = event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    body = {};
  }

  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  try {
    await ensureLearningTables(pool);
    const config = cfConfig();
    const signing = await ensureSigningKey(pool, config, auth.admin && auth.admin.email, {
      forceRotate: body.force_rotate_signing_key === true || Number(body.force_rotate_signing_key) === 1,
    });

    let [videoRows] = await pool.query(
      `SELECT DISTINCT
         a.id AS asset_id,
         a.video_uid,
         a.hls_url,
         a.dash_url
       FROM ${VIDEO_ASSETS_TABLE} a
       JOIN ${LESSONS_TABLE} l ON l.video_asset_id = a.id
       WHERE l.is_active = 1`
    );
    if (!Array.isArray(videoRows) || !videoRows.length) {
      const [fallbackRows] = await pool.query(
        `SELECT id AS asset_id, video_uid, hls_url, dash_url
         FROM ${VIDEO_ASSETS_TABLE}
         WHERE COALESCE(TRIM(video_uid), '') <> ''
         ORDER BY video_uid ASC`
      );
      videoRows = Array.isArray(fallbackRows) ? fallbackRows : [];
    }

    const failures = [];
    const uidToAssetIds = new Map();
    let invalidUidRows = 0;
    let canonicalizedAssets = 0;
    let remappedLessons = 0;
    for (const row of videoRows) {
      const assetId = Number(row && row.asset_id || 0);
      if (!(assetId > 0)) continue;
      const rawUid = clean(row && row.video_uid, 320);
      const canonicalUid = extractCloudflareStreamUid(rawUid)
        || extractCloudflareStreamUid(row && row.hls_url)
        || extractCloudflareStreamUid(row && row.dash_url);

      if (!canonicalUid) {
        invalidUidRows += 1;
        if (failures.length < 25) {
          failures.push({
            video_uid: rawUid || `asset:${assetId}`,
            reason: "invalid_uid",
            error: "Invalid UID format in asset record; could not derive a Cloudflare Stream UID.",
          });
        }
        continue;
      }

      if (canonicalUid !== String(rawUid || "").toLowerCase()) {
        const [existingCanonicalRows] = await pool.query(
          `SELECT id
           FROM ${VIDEO_ASSETS_TABLE}
           WHERE video_uid = ?
           LIMIT 1`,
          [canonicalUid]
        );
        if (Array.isArray(existingCanonicalRows) && existingCanonicalRows.length) {
          const canonicalAssetId = Number(existingCanonicalRows[0].id || 0);
          if (canonicalAssetId > 0 && canonicalAssetId !== assetId) {
            const [remap] = await pool.query(
              `UPDATE ${LESSONS_TABLE}
               SET video_asset_id = ?, updated_at = NOW()
               WHERE video_asset_id = ?`,
              [canonicalAssetId, assetId]
            );
            remappedLessons += Number(remap && remap.affectedRows || 0);
          }
        } else {
          await pool.query(
            `UPDATE ${VIDEO_ASSETS_TABLE}
             SET video_uid = ?, updated_at = NOW()
             WHERE id = ?
             LIMIT 1`,
            [canonicalUid, assetId]
          );
          canonicalizedAssets += 1;
        }
      }

      if (!uidToAssetIds.has(canonicalUid)) uidToAssetIds.set(canonicalUid, []);
      uidToAssetIds.get(canonicalUid).push(assetId);
    }

    const uids = Array.from(uidToAssetIds.keys()).sort();
    const cloudflareUidSet = await listCloudflareUids(config);

    let protectedCount = 0;
    let failedCount = invalidUidRows;
    const failureReasonCounts = {
      not_found: 0,
      permission: 0,
      invalid_uid: invalidUidRows,
      invalid_request: 0,
      other: 0,
      unknown: 0,
    };

    await runWithConcurrency(uids, 6, async function (uid) {
      if (!cloudflareUidSet.has(uid)) {
        failedCount += 1;
        failureReasonCounts.not_found += 1;
        if (failures.length < 25) {
          failures.push({
            video_uid: uid,
            reason: "not_found",
            error: "UID not found in this Cloudflare account. Asset likely stale or from a different account.",
          });
        }
        return;
      }
      try {
        await cfRequest(
          `/accounts/${encodeURIComponent(config.accountId)}/stream/${encodeURIComponent(uid)}`,
          config,
          {
            method: "POST",
            json: {
              requireSignedURLs: true,
            },
          }
        );
        protectedCount += 1;
      } catch (error) {
        failedCount += 1;
        const reason = classifyFailure(error && error.message);
        if (Object.prototype.hasOwnProperty.call(failureReasonCounts, reason)) {
          failureReasonCounts[reason] += 1;
        } else {
          failureReasonCounts.unknown += 1;
        }
        if (failures.length < 25) {
          failures.push({
            video_uid: uid,
            reason,
            error: clean(error && error.message, 300) || "Failed to update video.",
          });
        }
      }
    });

    return json(200, {
      ok: true,
      signing,
      total_videos: uids.length + invalidUidRows,
      total_uids_scanned: uids.length,
      invalid_uid_rows: invalidUidRows,
      canonicalized_assets: canonicalizedAssets,
      remapped_lessons: remappedLessons,
      protected_videos: protectedCount,
      failed_videos: failedCount,
      failure_reason_counts: failureReasonCounts,
      failures,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error.message || "Could not enforce Stream signed URL protection.",
      debug: error && error.debug ? error.debug : null,
    });
  }
};
