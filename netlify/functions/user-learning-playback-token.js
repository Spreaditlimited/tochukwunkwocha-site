const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireStudentSession } = require("./_lib/user-auth");
const { hasCourseAccess } = require("./_lib/learning-progress");
const { MODULES_TABLE, LESSONS_TABLE, VIDEO_ASSETS_TABLE } = require("./_lib/learning");
const { buildSignedLessonEmbedUrl } = require("./_lib/learning-playback");

const playbackRateWindowMs = 60 * 1000;
const playbackRateByIp = new Map();
const playbackRateByAccount = new Map();

function parseJsonBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function getHeader(headers, key) {
  if (!headers) return "";
  return String(headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()] || "").trim();
}

function getClientIp(event) {
  const headers = event && event.headers ? event.headers : {};
  const direct =
    getHeader(headers, "x-nf-client-connection-ip") ||
    getHeader(headers, "cf-connecting-ip") ||
    getHeader(headers, "x-real-ip");
  if (direct) return clean(direct, 80);
  const forwarded = getHeader(headers, "x-forwarded-for");
  if (!forwarded) return "";
  return clean(forwarded.split(",")[0], 80);
}

function applyWindowLimit(store, key, limit, nowMs) {
  const safeKey = clean(key, 160);
  if (!safeKey) return { ok: true, retryAfterSeconds: 0 };
  const now = Number(nowMs || Date.now());
  const windowStart = now - playbackRateWindowMs;
  const history = Array.isArray(store.get(safeKey)) ? store.get(safeKey) : [];
  const recent = history.filter(function (ts) {
    return Number(ts) >= windowStart;
  });
  if (recent.length >= limit) {
    const oldest = Number(recent[0] || now);
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + playbackRateWindowMs - now) / 1000));
    store.set(safeKey, recent);
    return { ok: false, retryAfterSeconds };
  }
  recent.push(now);
  store.set(safeKey, recent);
  return { ok: true, retryAfterSeconds: 0 };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const body = parseJsonBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });
  const lessonId = Number(body.lesson_id || 0);
  if (!Number.isFinite(lessonId) || lessonId <= 0) {
    return json(400, { ok: false, error: "lesson_id is required" });
  }

  const pool = getPool();
  try {
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });
    const nowMs = Date.now();
    const ip = getClientIp(event);
    const ipCheck = applyWindowLimit(playbackRateByIp, "ip:" + clean(ip, 80), 180, nowMs);
    if (!ipCheck.ok) {
      return json(429, {
        ok: false,
        error: `Too many playback requests from this network. Retry in ${ipCheck.retryAfterSeconds}s.`,
        retry_after_seconds: ipCheck.retryAfterSeconds,
      });
    }
    const accountId = Number(session && session.account && session.account.id || 0);
    const accountCheck = applyWindowLimit(playbackRateByAccount, "acct:" + String(accountId), 90, nowMs);
    if (!accountCheck.ok) {
      return json(429, {
        ok: false,
        error: `Too many playback requests on this account. Retry in ${accountCheck.retryAfterSeconds}s.`,
        retry_after_seconds: accountCheck.retryAfterSeconds,
      });
    }

    const [rows] = await pool.query(
      `SELECT
         l.id AS lesson_id,
         l.is_active AS lesson_active,
         m.course_slug,
         m.is_active AS module_active,
         COALESCE(m.drip_enabled, 0) AS drip_enabled,
         m.drip_at,
         a.video_uid,
         a.hls_url
       FROM ${LESSONS_TABLE} l
       JOIN ${MODULES_TABLE} m ON m.id = l.module_id
       LEFT JOIN ${VIDEO_ASSETS_TABLE} a ON a.id = l.video_asset_id
       WHERE l.id = ?
       LIMIT 1`,
      [lessonId]
    );
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row) return json(404, { ok: false, error: "Lesson not found" });
    if (Number(row.lesson_active || 0) !== 1 || Number(row.module_active || 0) !== 1) {
      return json(403, { ok: false, error: "Lesson is unavailable." });
    }
    if (Number(row.drip_enabled || 0) === 1 && row.drip_at) {
      const dripAt = new Date(row.drip_at).getTime();
      if (Number.isFinite(dripAt) && dripAt > Date.now()) {
        return json(403, { ok: false, error: "This lesson is not yet released for your batch." });
      }
    }
    if (!String(row.video_uid || "").trim()) {
      return json(404, { ok: false, error: "This lesson has no playable video yet." });
    }

    const allowed = await hasCourseAccess(pool, session.account.email, String(row.course_slug || "").trim().toLowerCase());
    if (!allowed) {
      return json(403, { ok: false, error: "You do not currently have access to this course." });
    }

    const signed = buildSignedLessonEmbedUrl({
      video_uid: row.video_uid,
      hls_url: row.hls_url,
    });

    return json(200, {
      ok: true,
      lesson_id: lessonId,
      playback: signed,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not issue lesson playback token." });
  }
};
