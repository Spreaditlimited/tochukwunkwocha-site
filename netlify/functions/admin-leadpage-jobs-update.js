const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureLeadpageTables, findLeadpageJobByUuid, updateLeadpageJob, VALID_STATUSES } = require("./_lib/leadpage-jobs");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  try {
    await applyRuntimeSettings(getPool());
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const jobUuid = clean(body.jobUuid, 72);
  const status = clean(body.status, 40).toLowerCase();
  const adminNote = clean(body.adminNote, 500);
  const buildUrl = clean(body.buildUrl, 1200);
  const deliveryUrl = clean(body.deliveryUrl, 1200);

  if (!jobUuid) {
    return json(400, { ok: false, error: "jobUuid is required" });
  }

  if (status && !VALID_STATUSES.has(status)) {
    return json(400, { ok: false, error: "Invalid status" });
  }

  const pool = getPool();

  try {
    await ensureLeadpageTables(pool);

    const existing = await findLeadpageJobByUuid(pool, jobUuid);
    if (!existing) return json(404, { ok: false, error: "Job not found" });

    const affected = await updateLeadpageJob(pool, {
      jobUuid,
      status,
      adminNote,
      buildUrl,
      deliveryUrl,
    });

    if (!affected) {
      return json(400, { ok: false, error: "Nothing to update" });
    }

    const updated = await findLeadpageJobByUuid(pool, jobUuid);
    return json(200, { ok: true, item: updated });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not update leadpage job" });
  }
};
