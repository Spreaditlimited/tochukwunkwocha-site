const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureLearningTables, upsertVideoAsset, clean } = require("./_lib/learning");

function getCloudflareConfig() {
  const accountId = clean(process.env.CLOUDFLARE_ACCOUNT_ID, 120);
  const token = clean(process.env.CLOUDFLARE_STREAM_API_TOKEN, 500);
  if (!accountId) throw new Error("Missing CLOUDFLARE_ACCOUNT_ID");
  if (!token) throw new Error("Missing CLOUDFLARE_STREAM_API_TOKEN");
  return { accountId, token };
}

async function cfFetch(pathname, config) {
  const url = `https://api.cloudflare.com/client/v4${pathname}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
  });
  const payload = await res.json().catch(function () {
    return null;
  });
  if (!res.ok || !payload || payload.success !== true) {
    const errMsg =
      (payload && Array.isArray(payload.errors) && payload.errors[0] && payload.errors[0].message) ||
      (payload && payload.message) ||
      `Cloudflare request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return payload;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  try {
    await applyRuntimeSettings(getPool());
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    body = {};
  }
  const maxPagesRequested = Number(body.maxPages || 20);
  const maxPages = Math.max(1, Math.min(Number.isFinite(maxPagesRequested) ? maxPagesRequested : 20, 50));

  const pool = getPool();
  try {
    await ensureLearningTables(pool);
    const config = getCloudflareConfig();

    let page = 1;
    let totalPages = 1;
    let totalFetched = 0;
    let insertedOrUpdated = 0;
    const samples = [];

    while (page <= totalPages && page <= maxPages) {
      const payload = await cfFetch(
        `/accounts/${encodeURIComponent(config.accountId)}/stream?per_page=100&page=${page}`,
        config
      );
      const result = Array.isArray(payload.result) ? payload.result : [];
      const info = payload.result_info || {};
      totalPages = Number(info.total_pages || totalPages || 1) || 1;

      for (const row of result) {
        totalFetched += 1;
        const mapped = {
          provider: "cloudflare_stream",
          video_uid: clean(row && row.uid, 120),
          filename: clean((row && row.meta && (row.meta.name || row.meta.filename)) || "", 320),
          hls_url: clean(row && row.playback && row.playback.hls, 1000),
          dash_url: clean(row && row.playback && row.playback.dash, 1000),
          duration_seconds: row && row.duration !== undefined ? Number(row.duration) : null,
          ready_to_stream: Boolean(row && row.readyToStream === true),
          source_created_at: clean(row && row.created, 30),
          source_payload_json: row || null,
        };
        if (!mapped.video_uid) continue;
        const saved = await upsertVideoAsset(pool, mapped);
        if (saved) {
          insertedOrUpdated += 1;
          if (samples.length < 5) samples.push(saved);
        }
      }
      page += 1;
    }

    return json(200, {
      ok: true,
      fetched: totalFetched,
      upserted: insertedOrUpdated,
      scannedPages: page - 1,
      maxPages,
      samples,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Cloudflare sync failed." });
  }
};
