const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureLeadpageTables,
  findPublishedLeadpageProject,
  findLeadpageJobByUuid,
  validateLeadpageClientToken,
} = require("./_lib/leadpage-jobs");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function parseNotesSections(notes) {
  const raw = clean(notes, 12000);
  if (!raw) {
    return {
      generalNotes: "",
      valueProp: "",
      testimonials: "",
    };
  }

  const valueMatch = raw.match(/what\s+sets\s+us\s+apart\s*:\s*([\s\S]*?)(?:\n\s*testimonials?\s*:|$)/i);
  const testimonialsMatch = raw.match(/testimonials?\s*:\s*([\s\S]*)$/i);

  let general = raw
    .replace(/what\s+sets\s+us\s+apart\s*:[\s\S]*?(?:\n\s*testimonials?\s*:|$)/i, "")
    .replace(/testimonials?\s*:[\s\S]*$/i, "")
    .trim();

  return {
    generalNotes: clean(general, 3000),
    valueProp: clean(valueMatch && valueMatch[1], 3000),
    testimonials: clean(testimonialsMatch && testimonialsMatch[1], 5000),
  };
}

function trimSentences(text, maxChars) {
  const raw = clean(text, 12000);
  if (!raw) return "";
  if (raw.length <= maxChars) return raw;
  const cut = raw.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  if (lastStop >= 80) return cut.slice(0, lastStop + 1).trim();
  return `${cut.trim()}...`;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const qs = event.queryStringParameters || {};
  const jobUuid = clean(qs.job_uuid || qs.slug || "", 72);
  const accessToken = clean(qs.access || qs.token || "", 96);
  if (!jobUuid) return json(400, { ok: false, error: "Missing project id" });

  const pool = getPool();
  try {
    await ensureLeadpageTables(pool);
    let project = null;

    if (accessToken) {
      const access = await validateLeadpageClientToken(pool, { jobUuid, accessToken });
      if (access && String(access.payment_status || "").toLowerCase() === "paid") {
        project = await findLeadpageJobByUuid(pool, jobUuid);
      }
    }

    if (!project) {
      project = await findPublishedLeadpageProject(pool, jobUuid);
    }

    if (!project) return json(404, { ok: false, error: "Project not found" });

    let content = null;
    let renderedHtml = "";
    let copyJson = null;
    try {
      content = project.client_content_json ? JSON.parse(project.client_content_json) : null;
    } catch (_error) {
      content = null;
    }
    try {
      copyJson = project.copy_json ? JSON.parse(project.copy_json) : null;
      renderedHtml = clean(copyJson && copyJson.html, 400000);
    } catch (_error) {
      copyJson = null;
      renderedHtml = "";
    }

    if (!renderedHtml && project.copy_json) {
      const rawCopy = String(project.copy_json || "");
      const htmlMatch = rawCopy.match(/"html"\s*:\s*"([\s\S]*?)"\s*,\s*"generatedAt"/i);
      if (htmlMatch && htmlMatch[1]) {
        try {
          renderedHtml = clean(JSON.parse(`"${htmlMatch[1]}"`), 400000);
        } catch (_error) {
          renderedHtml = "";
        }
      }
    }

    const notesParts = parseNotesSections(project.notes);
    const generated = content && typeof content === "object" ? content : {};

    const safeContent = {
      headline:
        clean(generated.headline, 220) ||
        clean(project.service_offer, 220) ||
        clean(project.business_name, 180) ||
        "",
      subheadline:
        clean(generated.subheadline, 420) ||
        clean(project.primary_goal, 320) ||
        trimSentences(notesParts.generalNotes || notesParts.valueProp, 260) ||
        "Get clear, practical help tailored to your business goals.",
      offer:
        clean(generated.offer, 1200) ||
        trimSentences(notesParts.valueProp || notesParts.generalNotes || project.service_offer, 520) ||
        "We deliver a clear offer page designed to convert visitors into leads.",
      cta: clean(generated.cta, 80) || clean(project.cta_text, 80) || "Contact Us",
      testimonials:
        clean(generated.testimonials, 3000) ||
        trimSentences(notesParts.testimonials, 1200) ||
        "",
      contactNote:
        clean(generated.contactNote, 500) ||
        (clean(project.target_location, 200)
          ? `Serving ${clean(project.target_location, 200)}. Reach out today.`
          : "Reach out today to get started."),
    };

    return json(200, {
      ok: true,
      project: {
        jobUuid: project.job_uuid,
        businessName: project.business_name,
        status: project.status || "",
        publishStatus: project.publish_status || "",
        updatedAt: project.updated_at,
      },
      content: safeContent,
      renderedHtml,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load project" });
  }
};
