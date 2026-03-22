const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureLeadpageTables, findPublishedLeadpageProject } = require("./_lib/leadpage-jobs");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const qs = event.queryStringParameters || {};
  const jobUuid = clean(qs.job_uuid || qs.slug || "", 72);
  if (!jobUuid) return json(400, { ok: false, error: "Missing project id" });

  const pool = getPool();
  try {
    await ensureLeadpageTables(pool);
    const project = await findPublishedLeadpageProject(pool, jobUuid);
    if (!project) return json(404, { ok: false, error: "Project not found" });

    let content = null;
    try {
      content = project.client_content_json ? JSON.parse(project.client_content_json) : null;
    } catch (_error) {
      content = null;
    }

    const safeContent = content || {
      headline: project.service_offer || "",
      subheadline: project.notes || "",
      offer: project.notes || "",
      cta: project.cta_text || "Contact Us",
      testimonials: "",
      contactNote: "",
    };

    return json(200, {
      ok: true,
      project: {
        jobUuid: project.job_uuid,
        businessName: project.business_name,
        updatedAt: project.updated_at,
      },
      content: safeContent,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load project" });
  }
};
