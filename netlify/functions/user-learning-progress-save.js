const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureLearningProgressTables, saveLessonProgress } = require("./_lib/learning-progress");

function parseJsonBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

let ensureReadyPromise = null;
async function ensureLearningWriterReady(pool) {
  if (!ensureReadyPromise) {
    ensureReadyPromise = (async function () {
      await ensureStudentAuthTables(pool);
      await ensureLearningProgressTables(pool);
    })().catch(function (error) {
      ensureReadyPromise = null;
      throw error;
    });
  }
  await ensureReadyPromise;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const body = parseJsonBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const lessonId = Number(body.lesson_id || 0);
  const markComplete = !!body.mark_complete;
  const watchSeconds = Number(body.watch_seconds || 0);

  if (!Number.isFinite(lessonId) || lessonId <= 0) {
    return json(400, { ok: false, error: "lesson_id is required" });
  }

  const pool = getPool();
  try {
    await ensureLearningWriterReady(pool);

    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const payload = await saveLessonProgress(pool, {
      account_id: session.account.id,
      account_email: session.account.email,
      lesson_id: lessonId,
      mark_complete: markComplete,
      watch_seconds: Number.isFinite(watchSeconds) && watchSeconds > 0 ? watchSeconds : 0,
    });

    if (!payload.ok) {
      return json(payload.statusCode || 400, { ok: false, error: payload.error || "Could not update progress" });
    }

    return json(200, { ok: true, result: payload });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not update lesson progress." });
  }
};
