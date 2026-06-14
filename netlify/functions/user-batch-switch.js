const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireStudentSession } = require("./_lib/user-auth");
const { switchEnrollmentBatch } = require("./_lib/batch-switch");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const pool = getPool();
  try {
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const result = await switchEnrollmentBatch(pool, session.account, {
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      targetBatchKey: body.targetBatchKey,
    });
    return json(200, result);
  } catch (error) {
    const message = error && error.message ? error.message : "Could not change batch.";
    const status = /not found|incomplete|required/i.test(message) ? 400 : 409;
    return json(status, { ok: false, error: message });
  }
};
