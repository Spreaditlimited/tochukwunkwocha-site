const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureLearningProgressTables, listCourseForLearner } = require("./_lib/learning-progress");
const { notifyDueDripModules } = require("./_lib/learning-drip");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

let ensureReadyPromise = null;
async function ensureLearningReaderReady(pool) {
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
  if (event.httpMethod !== "GET") return badMethod();

  const courseSlug = clean(event.queryStringParameters && event.queryStringParameters.course_slug, 120).toLowerCase();
  if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });

  const pool = getPool();
  try {
    await ensureLearningReaderReady(pool);

    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    await notifyDueDripModules(pool, courseSlug).catch(function () {
      return null;
    });

    const payload = await listCourseForLearner(pool, {
      account_id: session.account.id,
      account_email: session.account.email,
      course_slug: courseSlug,
    });

    if (!payload.ok) return json(403, { ok: false, error: payload.error || "Access denied" });

    return json(200, {
      ok: true,
      account: {
        id: session.account.id,
        full_name: session.account.fullName,
        email: session.account.email,
      },
      course: payload.course,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load course lessons." });
  }
};
