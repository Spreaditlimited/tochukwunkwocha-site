const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureLearningTables,
  VIDEO_ASSETS_TABLE,
  clean,
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

async function ensureSigningKey(pool, config, adminEmail) {
  const existingKeyId = clean(process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID, 120);
  const existingPem = String(process.env.CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY || "").trim();
  if (existingKeyId && existingPem) {
    return {
      key_id: existingKeyId,
      source: "existing",
      created: false,
    };
  }

  const created = await cfRequest(
    `/accounts/${encodeURIComponent(config.accountId)}/stream/keys`,
    config,
    { method: "POST", json: {} }
  );

  const result = created && created.result ? created.result : {};
  const keyId = clean(result.id || result.key_id, 120);
  const privateKey = String(result.pem || result.privateKey || result.private_key || "").trim();
  if (!keyId || !privateKey) {
    throw new Error("Could not create Cloudflare Stream signing key. Missing key id/private key from Cloudflare response.");
  }

  await ensureAdminSettingsTable(pool);
  await upsertAdminSettings(pool, {
    updatedBy: clean(adminEmail, 120) || "admin",
    entries: [
      { key: "CLOUDFLARE_STREAM_SIGNING_KEY_ID", value: keyId },
      { key: "CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY", value: privateKey },
      {
        key: "CLOUDFLARE_STREAM_TOKEN_TTL_SECONDS",
        value: clean(process.env.CLOUDFLARE_STREAM_TOKEN_TTL_SECONDS, 20) || "300",
      },
    ],
  });
  await applyRuntimeSettings(pool, { force: true });

  return {
    key_id: keyId,
    source: "created_and_saved",
    created: true,
  };
}

function classifyFailure(message) {
  const text = String(message || "").toLowerCase();
  if (!text) return "unknown";
  if (text.indexOf("not found") !== -1 || text.indexOf("resource not found") !== -1) return "not_found";
  if (text.indexOf("permission") !== -1 || text.indexOf("forbidden") !== -1 || text.indexOf("unauthorized") !== -1 || text.indexOf("authentication") !== -1) return "permission";
  if (text.indexOf("invalid") !== -1 || text.indexOf("malformed") !== -1) return "invalid_request";
  return "other";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  try {
    await ensureLearningTables(pool);
    const config = cfConfig();
    const signing = await ensureSigningKey(pool, config, auth.admin && auth.admin.email);

    const [videoRows] = await pool.query(
      `SELECT DISTINCT video_uid
       FROM ${VIDEO_ASSETS_TABLE}
       WHERE COALESCE(TRIM(video_uid), '') <> ''
       ORDER BY video_uid ASC`
    );
    const uids = (Array.isArray(videoRows) ? videoRows : [])
      .map(function (row) { return clean(row.video_uid, 120); })
      .filter(Boolean);

    let protectedCount = 0;
    let failedCount = 0;
    const failures = [];
    const failureReasonCounts = {
      not_found: 0,
      permission: 0,
      invalid_request: 0,
      other: 0,
      unknown: 0,
    };

    for (const uid of uids) {
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
    }

    return json(200, {
      ok: true,
      signing,
      total_videos: uids.length,
      protected_videos: protectedCount,
      failed_videos: failedCount,
      failure_reason_counts: failureReasonCounts,
      failures,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not enforce Stream signed URL protection." });
  }
};
