const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  ensureTranscriptAccessTables,
  getTranscriptAccessByEmail,
  setTranscriptAccessStatus,
  logTranscriptAudit,
  hashValue,
  getClientIp,
  readHeader,
} = require("./_lib/transcript-access");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const pool = getPool();
  await ensureTranscriptAccessTables(pool);

  try {
    if (event.httpMethod === "GET") {
      const email = clean(event.queryStringParameters && event.queryStringParameters.email, 220).toLowerCase();
      const courseSlug = clean(event.queryStringParameters && event.queryStringParameters.course_slug, 120).toLowerCase() || "prompt-to-profit";
      if (!email) return json(400, { ok: false, error: "email is required" });

      const result = await getTranscriptAccessByEmail(pool, {
        email,
        course_slug: courseSlug,
      });

      return json(200, {
        ok: true,
        account: result.account
          ? {
              id: Number(result.account.id),
              account_uuid: clean(result.account.account_uuid, 80),
              full_name: clean(result.account.full_name, 180),
              email: clean(result.account.email, 220).toLowerCase(),
            }
          : null,
        transcript_access: result.access
          ? {
              status: clean(result.access.status, 32) || "pending",
              requested_at: result.access.requested_at || null,
              approved_at: result.access.approved_at || null,
              expires_at: result.access.expires_at || null,
              notes: clean(result.access.notes, 2000),
            }
          : {
              status: "none",
              requested_at: null,
              approved_at: null,
              expires_at: null,
              notes: "",
            },
      });
    }

    const body = JSON.parse(event.body || "{}");
    const email = clean(body && body.email, 220).toLowerCase();
    const courseSlug = clean(body && body.course_slug, 120).toLowerCase() || "prompt-to-profit";
    const status = clean(body && body.status, 32).toLowerCase();
    const notes = clean(body && body.notes, 4000);
    const expiresAt = clean(body && body.expires_at, 64);
    if (!email) return json(400, { ok: false, error: "email is required" });
    if (!status) return json(400, { ok: false, error: "status is required" });

    const lookup = await getTranscriptAccessByEmail(pool, {
      email,
      course_slug: courseSlug,
    });
    if (!lookup.account || !lookup.account.id) {
      return json(404, { ok: false, error: "Student account not found for this email." });
    }

    const updated = await setTranscriptAccessStatus(pool, {
      account_id: Number(lookup.account.id),
      course_slug: courseSlug,
      status,
      notes,
      expires_at: expiresAt || null,
      approved_by: "admin",
    });

    await logTranscriptAudit(pool, {
      account_id: Number(lookup.account.id),
      course_slug: courseSlug,
      event_type: "admin_update",
      status: clean(updated && updated.status, 32) || status || "pending",
      detail: {
        admin_role: clean(auth.payload && auth.payload.role, 32) || "admin",
        notes: notes || null,
        expires_at: expiresAt || null,
      },
      ip_hash: hashValue(getClientIp(event)),
      user_agent: readHeader(event, "user-agent"),
    });

    return json(200, {
      ok: true,
      account: {
        id: Number(lookup.account.id),
        email: clean(lookup.account.email, 220).toLowerCase(),
        full_name: clean(lookup.account.full_name, 180),
      },
      transcript_access: {
        status: clean(updated && updated.status, 32) || "pending",
        requested_at: updated && updated.requested_at ? updated.requested_at : null,
        approved_at: updated && updated.approved_at ? updated.approved_at : null,
        expires_at: updated && updated.expires_at ? updated.expires_at : null,
        notes: clean(updated && updated.notes, 2000),
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not manage transcript access." });
  }
};
