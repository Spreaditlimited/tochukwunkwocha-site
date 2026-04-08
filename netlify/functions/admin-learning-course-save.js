const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureLearningTables, upsertLearningCourse } = require("./_lib/learning");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const id = Number(body.id || 0);
  const slug = clean(body.course_slug, 120).toLowerCase();
  const title = clean(body.course_title, 220);
  const description = clean(body.course_description, 4000);
  const isPublished = body.is_published === true || Number(body.is_published) === 1;
  const releaseAt = clean(body.release_at, 64);

  if (!slug) return json(400, { ok: false, error: "course_slug is required" });
  if (!title) return json(400, { ok: false, error: "course_title is required" });

  const pool = getPool();
  try {
    await ensureLearningTables(pool);
    const course = await upsertLearningCourse(pool, {
      id: Number.isFinite(id) && id > 0 ? id : null,
      course_slug: slug,
      course_title: title,
      course_description: description,
      is_published: isPublished,
      release_at: releaseAt || null,
    });
    return json(200, { ok: true, course: course || null });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not save course." });
  }
};
