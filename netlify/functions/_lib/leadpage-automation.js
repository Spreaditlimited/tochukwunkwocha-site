const { nowSql } = require("./db");
const { generateText, selectedProviderName } = require("./ai-client");
const {
  TEMPLATE_VERSION,
  selectTemplateForBrief,
  buildTemplatePrompt,
  validateGeneratedContent,
} = require("./leadpage-templates");
const {
  ensureLeadpageTables,
  findLeadpageJobByUuid,
  updateLeadpageJob,
  updateLeadpageClientContent,
  appendLeadpageEvent,
} = require("./leadpage-jobs");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function parseJsonLoose(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_error) {}

  const blockMatch = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  if (blockMatch && blockMatch[1]) {
    try {
      return JSON.parse(blockMatch[1].trim());
    } catch (_error) {}
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch (_error) {}
  }

  return null;
}

function splitNotesSections(notes) {
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

  const general = raw
    .replace(/what\s+sets\s+us\s+apart\s*:[\s\S]*?(?:\n\s*testimonials?\s*:|$)/i, "")
    .replace(/testimonials?\s*:[\s\S]*$/i, "")
    .trim();

  return {
    generalNotes: clean(general, 3000),
    valueProp: clean(valueMatch && valueMatch[1], 3000),
    testimonials: clean(testimonialsMatch && testimonialsMatch[1], 5000),
  };
}

function splitOfferAndTestimonials(rawOffer, rawTestimonials) {
  const offerText = clean(rawOffer, 5000);
  const testimonialsText = clean(rawTestimonials, 5000);
  if (testimonialsText) {
    return { offer: offerText, testimonials: testimonialsText };
  }

  const marker = /testimonials?\s*:\s*/i;
  if (marker.test(offerText)) {
    const parts = offerText.split(marker);
    return {
      offer: clean(parts[0], 1400),
      testimonials: clean(parts.slice(1).join(" "), 3200),
    };
  }

  return { offer: offerText, testimonials: "" };
}

function splitSentences(text, maxEach, maxItems) {
  const raw = clean(text, 12000);
  if (!raw) return [];
  return raw
    .split(/(?<=[.!?])\s+/)
    .map(function (part) {
      return clean(part, maxEach);
    })
    .filter(Boolean)
    .slice(0, maxItems);
}

function extractQuotedTestimonials(text) {
  const raw = clean(text, 7000);
  if (!raw) return [];
  const quoted = raw.match(/"([^"]{30,420})"/g) || [];
  const picked = quoted
    .map(function (item) {
      return clean(item.replace(/^"|"$/g, ""), 420);
    })
    .filter(Boolean)
    .slice(0, 3);
  if (picked.length) return picked;
  return splitSentences(raw, 380, 3);
}

function deriveBenefits(brief, notesParts) {
  const joined = clean(
    [brief.primaryGoal, notesParts.valueProp, notesParts.generalNotes].filter(Boolean).join(" "),
    9000
  );
  const candidates = splitSentences(joined, 220, 6);
  return candidates.length ? candidates.slice(0, 3) : ["Fast response", "Clear process", "Reliable delivery"];
}

function deriveFaqs(brief) {
  return [
    {
      q: `How quickly can ${clean(brief.businessName || "you", 80)} start?`,
      a: "Most projects start after a short consultation and requirement alignment.",
    },
    {
      q: "Is this tailored to my business?",
      a: "Yes. The page and messaging are built around your audience, offer, and conversion goal.",
    },
    {
      q: "What is the next step?",
      a: `Use "${clean(brief.ctaText || "Get Started", 40)}" and our team will follow up with the implementation steps.`,
    },
  ];
}

function buildStructuredBrief(brief) {
  const notes = splitNotesSections(brief.notes);
  return {
    notes,
    benefits: deriveBenefits(brief, notes),
    testimonials: extractQuotedTestimonials(notes.testimonials || notes.generalNotes),
    faqs: deriveFaqs(brief),
  };
}

function normalizeBrief(job) {
  return {
    jobUuid: clean(job.job_uuid, 72),
    businessName: clean(job.business_name, 220),
    businessType: clean(job.business_type, 160),
    serviceOffer: clean(job.service_offer, 280),
    targetLocation: clean(job.target_location, 180),
    primaryGoal: clean(job.primary_goal, 320),
    ctaText: clean(job.cta_text, 180),
    tone: clean(job.tone, 80),
    notes: clean(job.notes, 4000),
  };
}

function fallbackContent(brief) {
  const structured = buildStructuredBrief(brief);
  const notes = structured.notes;
  return {
    headline: brief.serviceOffer || `Work with ${brief.businessName}`,
    subheadline:
      brief.primaryGoal ||
      notes.generalNotes ||
      `Trusted ${brief.businessType || "service"} support for your next step.`,
    offer: notes.valueProp || notes.generalNotes || `Get started with ${brief.businessName} today.`,
    cta: brief.ctaText || "Get Started",
    testimonials: (structured.testimonials || []).join(" "),
    contactNote: `Serving ${brief.targetLocation || "clients"}. Reach out today.`,
  };
}

function ensureContentShape(value, brief) {
  const base = fallbackContent(brief);
  const obj = value && typeof value === "object" ? value : {};

  const split = splitOfferAndTestimonials(obj.offer || base.offer, obj.testimonials || base.testimonials);

  return {
    headline: clean(obj.headline || base.headline, 180),
    subheadline: clean(obj.subheadline || base.subheadline, 500),
    offer: clean(split.offer || base.offer, 1400),
    cta: clean(obj.cta || base.cta, 80),
    testimonials: clean(split.testimonials || base.testimonials, 3200),
    contactNote: clean(obj.contactNote || base.contactNote, 500),
  };
}

async function generateLandingContent(input) {
  const brief = input && input.brief ? input.brief : {};
  const template = input && input.template ? input.template : null;

  if (!template || !template.id) throw new Error("Template is required");

  const systemPrompt = [
    "You are a conversion-focused landing-page copywriter.",
    "Return ONLY valid JSON.",
    "Write concise, practical, high-converting copy for service lead capture pages.",
  ].join(" ");

  const userPrompt = [
    "Generate landing page content JSON with keys:",
    "headline, subheadline, offer, cta, testimonials, contactNote.",
    "Constraints:",
    "- No markdown",
    "- Keep headline under 90 chars",
    "- Keep cta under 30 chars",
    "- Keep language clear and direct",
    buildTemplatePrompt({ template, brief }),
  ].join("\n");

  const mockText = JSON.stringify(fallbackContent(brief));

  const result = await generateText({
    systemPrompt,
    userPrompt,
    mockText,
    temperature: 0.35,
    maxTokens: 900,
  });

  const parsed = parseJsonLoose(result.text);
  const content = ensureContentShape(parsed, brief);
  const validation = validateGeneratedContent(content);

  return {
    provider: result.provider,
    model: result.model,
    mock: Boolean(result.mock),
    content,
    validation,
  };
}

function buildSimpleHtml(brief, content) {
  const esc = function (v) {
    return clean(v, 20000)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  return [
    "<!doctype html>",
    "<html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    `<title>${esc(brief.businessName || "Lead Page")}</title>`,
    "<style>body{font-family:Inter,Arial,sans-serif;margin:0;background:#f7f7fb;color:#111}main{max-width:860px;margin:0 auto;padding:48px 20px}h1{font-size:40px;line-height:1.1;margin:0 0 12px}p{line-height:1.6}.card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:22px;margin-top:20px}.btn{display:inline-block;background:#14213d;color:#fff;padding:12px 16px;border-radius:10px;font-weight:700;text-decoration:none;margin-top:18px}</style>",
    "</head><body><main>",
    `<h1>${esc(content.headline)}</h1>`,
    `<p>${esc(content.subheadline)}</p>`,
    `<div class=\"card\"><h2>Offer</h2><p>${esc(content.offer)}</p><a href=\"#lead-form\" class=\"btn\">${esc(content.cta || "Get Started")}</a></div>`,
    `<div class=\"card\"><h3>Testimonials</h3><p>${esc(content.testimonials || "Trusted by clients who value fast results.")}</p></div>`,
    `<div id=\"lead-form\" class=\"card\"><h3>Contact</h3><p>${esc(content.contactNote)}</p></div>`,
    "</main></body></html>",
  ].join("");
}

function buildPolishedFallbackHtml(brief, content, structured) {
  const esc = function (v) {
    return clean(v, 20000)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const business = esc(brief.businessName || "Your Business");
  const headline = esc(content.headline || `Work with ${brief.businessName || "us"}`);
  const subheadline = esc(content.subheadline || "Clear, practical service that drives results.");
  const offer = esc(content.offer || "Tell us your needs and we will propose the best next step.");
  const cta = esc(content.cta || "Book Consultation");
  const testimonials = content.testimonials || "Clients trust us for reliability, speed, and quality outcomes.";
  const contact = esc(content.contactNote || `Serving ${brief.targetLocation || "your area"}. Reach out today.`);
  const benefits = Array.isArray(structured && structured.benefits) ? structured.benefits : [];
  const testimonialItems = Array.isArray(structured && structured.testimonials) ? structured.testimonials : [];
  const faqItems = Array.isArray(structured && structured.faqs) ? structured.faqs : [];

  return [
    "<!doctype html>",
    "<html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    `<title>${business}</title>`,
    "<style>",
    ":root{--bg:#f4f5f8;--surface:#ffffff;--ink:#111827;--muted:#4b5563;--line:#d9dee8;--brand:#14213d;--brand-2:#1f325e;--radius:18px}",
    "*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:linear-gradient(180deg,#f7f8fb 0%,#eef1f7 100%);color:var(--ink)}",
    ".wrap{max-width:1120px;margin:0 auto;padding:42px 20px 80px}",
    ".hero{display:grid;grid-template-columns:1.1fr .9fr;gap:24px;align-items:stretch}",
    ".card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:24px}",
    ".eyebrow{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#667085;font-weight:700}",
    "h1{font-size:clamp(36px,6vw,66px);line-height:1.04;margin:12px 0 12px;color:var(--brand)}",
    ".lead{font-size:clamp(18px,2.6vw,24px);line-height:1.45;color:#283244;margin:0 0 20px}",
    ".cta{display:inline-flex;align-items:center;justify-content:center;border:0;background:linear-gradient(135deg,var(--brand),var(--brand-2));color:#fff;padding:14px 20px;border-radius:12px;font-size:18px;font-weight:700;text-decoration:none}",
    "h2{margin:0 0 12px;font-size:clamp(24px,3vw,36px);color:#121a33}",
    "p{margin:0;color:#2c374e;line-height:1.75;font-size:18px}",
    ".grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:22px}",
    ".bullet{background:#f8f9fd;border:1px solid var(--line);border-radius:14px;padding:16px}",
    ".bullet h3{margin:0 0 8px;color:#1d2a4d;font-size:18px}.bullet p{font-size:16px;line-height:1.6;color:#44506a}",
    ".stack{display:grid;gap:18px;margin-top:20px}",
    ".faq-item{padding:16px;border:1px solid var(--line);border-radius:12px;background:#fbfcff}",
    ".faq-item strong{display:block;color:#1a2750;margin-bottom:6px}",
    "footer{margin-top:26px}",
    "@media (max-width:960px){.hero{grid-template-columns:1fr}.grid{grid-template-columns:1fr}.wrap{padding-top:28px}}",
    "</style></head><body><main class=\"wrap\">",
    "<section class=\"hero\">",
    `<article class=\"card\"><div class=\"eyebrow\">${business}</div><h1>${headline}</h1><p class=\"lead\">${subheadline}</p><a href=\"#contact\" class=\"cta\">${cta}</a></article>`,
    `<aside class=\"card\"><h2>Offer Summary</h2><p>${offer}</p></aside>`,
    "</section>",
    "<section class=\"grid\" aria-label=\"Benefits\">",
    `<article class=\"bullet\"><h3>Clear Process</h3><p>${esc(
      clean(benefits[0], 200) || "Simple steps from inquiry to delivery with transparent communication."
    )}</p></article>`,
    `<article class=\"bullet\"><h3>Trusted Execution</h3><p>${esc(
      clean(benefits[1], 200) || "Consistent service quality focused on your business outcomes and timelines."
    )}</p></article>`,
    `<article class=\"bullet\"><h3>Fast Response</h3><p>${esc(
      clean(benefits[2], 200) || "Prompt support so your team can move quickly and confidently."
    )}</p></article>`,
    "</section>",
    `<section class=\"card stack\" aria-label=\"Testimonials\"><h2>Client Feedback</h2><p>${esc(
      clean(testimonialItems.join(" "), 2600) || testimonials
    )}</p></section>`,
    "<section class=\"card stack\" aria-label=\"FAQ\"><h2>Frequently Asked Questions</h2>",
    `<div class=\"faq-item\"><strong>${esc(clean(faqItems[0] && faqItems[0].q, 180) || "How quickly can we start?")}</strong><span>${esc(
      clean(faqItems[0] && faqItems[0].a, 280) || "Most projects begin after a short discovery call and requirement check."
    )}</span></div>`,
    `<div class=\"faq-item\"><strong>${esc(
      clean(faqItems[1] && faqItems[1].q, 180) || "Is this tailored to my business?"
    )}</strong><span>${esc(
      clean(faqItems[1] && faqItems[1].a, 280) || "Yes. We shape the approach around your goal, audience, and location."
    )}</span></div>`,
    `<div class=\"faq-item\"><strong>${esc(clean(faqItems[2] && faqItems[2].q, 180) || "What is the next step?")}</strong><span>${esc(
      clean(faqItems[2] && faqItems[2].a, 280) || "Click the call to action to book a consultation and get your implementation plan."
    )}</span></div>`,
    "</section>",
    `<section id=\"contact\" class=\"card\"><h2>Ready to Get Started?</h2><p>${contact}</p><footer><a href=\"#contact\" class=\"cta\">${cta}</a></footer></section>`,
    "</main></body></html>",
  ].join("");
}

function extractHtmlDocument(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  if (/<html[\s>]/i.test(raw) && /<body[\s>]/i.test(raw)) return raw;

  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1] && /<html[\s>]/i.test(fenced[1])) {
    return String(fenced[1]).trim();
  }

  const doctypeStart = raw.toLowerCase().indexOf("<!doctype");
  if (doctypeStart >= 0) {
    const sliced = raw.slice(doctypeStart).trim();
    if (/<html[\s>]/i.test(sliced)) return sliced;
  }

  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    return [
      "<!doctype html>",
      "<html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body>",
      bodyMatch[1],
      "</body></html>",
    ].join("");
  }

  if (/(<section[\s>]|<main[\s>]|<h1[\s>]|<div[\s>])/i.test(raw)) {
    return [
      "<!doctype html>",
      "<html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head><body>",
      raw,
      "</body></html>",
    ].join("");
  }

  return "";
}

function assessHtmlQuality(html) {
  const doc = String(html || "");
  const issues = [];
  const sectionCount = (doc.match(/<section\b/gi) || []).length;
  const styleTag = doc.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const cssLen = styleTag && styleTag[1] ? String(styleTag[1]).trim().length : 0;

  if (!/<h1[\s>]/i.test(doc)) issues.push("missing_h1");
  if (!/<a[^>]+href=/i.test(doc)) issues.push("missing_cta_link");
  if (sectionCount < 4) issues.push("too_few_sections");
  if (cssLen < 500) issues.push("css_too_thin");
  if (!/faq|frequently asked/i.test(doc)) issues.push("missing_faq");
  if (!/testimonial|client feedback|social proof/i.test(doc)) issues.push("missing_social_proof");
  if (!/@media\s*\(/i.test(doc)) issues.push("missing_responsive_rules");
  if (/what\s+sets\s+us\s+apart\s*:/i.test(doc) || /testimonials?\s*:/i.test(doc)) issues.push("raw_notes_dumped");

  const textBlocks = doc.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  const tooLongParagraph = textBlocks.some(function (block) {
    const txt = clean(block.replace(/<[^>]+>/g, " "), 5000);
    return txt.length > 750;
  });
  if (tooLongParagraph) issues.push("paragraph_too_long");

  return {
    ok: issues.length === 0,
    issues,
    sectionCount,
    cssLen,
  };
}

function isHardQualityFailure(quality) {
  const issues = quality && Array.isArray(quality.issues) ? quality.issues : [];
  if (!issues.length) return false;
  const hardSet = new Set(["missing_h1", "missing_cta_link", "raw_notes_dumped", "paragraph_too_long"]);
  return issues.some(function (issue) {
    return hardSet.has(String(issue || ""));
  });
}

function htmlRetryEnabled() {
  return String(process.env.LEADPAGE_AUTOMATION_HTML_RETRY || "0").trim() === "1";
}

function aiRequestTimeoutMs() {
  const raw = Number(process.env.LEADPAGE_AI_TIMEOUT_MS || 22000);
  if (!Number.isFinite(raw)) return 22000;
  return Math.max(8000, Math.min(raw, 26000));
}

async function generateLandingHtml(input) {
  const brief = input && input.brief ? input.brief : {};
  const template = input && input.template ? input.template : null;
  const content = input && input.content ? input.content : {};
  const structured = input && input.structured ? input.structured : buildStructuredBrief(brief);

  const fallbackHtml = buildPolishedFallbackHtml(brief, content, structured);
  if (!template || !template.id) {
    return {
      html: fallbackHtml,
      quality: assessHtmlQuality(fallbackHtml),
      source: "template",
    };
  }

  const systemPrompt = [
    "You are a world-class direct-response landing page designer and copywriter.",
    "Return ONLY a complete HTML document (<!doctype html> ... </html>).",
    "Build a conversion-focused, modern, clean page for a service business.",
    "No markdown. No explanations. No code fences.",
    "Use semantic sections, clear hierarchy, and mobile-first responsive CSS.",
    "Keep accessibility in mind (contrast, button labels, readable text sizes).",
  ].join(" ");

  const userPrompt = [
    "Create a complete single-file landing page with embedded CSS for this brief.",
    "Include these sections in this order:",
    "1) Hero (headline, subheadline, CTA)",
    "2) Offer summary",
    "3) Benefits / why choose us",
    "4) Social proof/testimonials",
    "5) Simple FAQ (3 Q&As)",
    "6) Contact / final CTA",
    "Design constraints:",
    "- Professional, trustworthy, high-converting",
    "- Clean spacing and card-based layout",
    "- Responsive for desktop and mobile",
    "- Avoid giant text dumps; split long text into concise paragraphs/bullets",
    "- Use this primary color palette anchor: #14213d with neutrals",
    "Business brief and seed copy:",
    buildTemplatePrompt({ template, brief }),
    `Seed headline: ${clean(content.headline, 220)}`,
    `Seed subheadline: ${clean(content.subheadline, 500)}`,
    `Seed offer: ${clean(content.offer, 1200)}`,
    `Seed CTA: ${clean(content.cta, 80)}`,
    `Seed testimonials: ${clean(content.testimonials, 3000)}`,
    `Seed contact note: ${clean(content.contactNote, 500)}`,
    `Structured benefits: ${JSON.stringify(structured.benefits || [])}`,
    `Structured testimonials: ${JSON.stringify(structured.testimonials || [])}`,
    `Structured FAQ seeds: ${JSON.stringify(structured.faqs || [])}`,
  ].join("\n");

  const result = await generateText({
    systemPrompt,
    userPrompt,
    mockText: fallbackHtml,
    temperature: 0.45,
    maxTokens: 3400,
    timeoutMs: aiRequestTimeoutMs(),
  });

  let html = extractHtmlDocument(result && result.text ? result.text : "");
  let quality = assessHtmlQuality(html);

  if (!html) {
    return {
      html: fallbackHtml,
      quality: assessHtmlQuality(fallbackHtml),
      source: "template",
    };
  }

  if (isHardQualityFailure(quality)) {
    if (!htmlRetryEnabled()) {
      return {
        html: fallbackHtml,
        quality,
        source: "template",
      };
    }

    const retrySystemPrompt = [
      systemPrompt,
      "You must output only one complete HTML document.",
      "No explanation text before or after the HTML.",
      "Design must be premium quality with strong visual hierarchy and section structure.",
    ].join(" ");
    const retryUserPrompt = [
      userPrompt,
      "",
      "Quality guardrails:",
      "- Include at least 6 <section> blocks",
      "- Include a substantial <style> block with typography, spacing, cards, and responsive rules",
      "- Include clear testimonials content and a 3-item FAQ section",
      "- Use the provided seed content appropriately and do not dump raw notes into one paragraph",
    ].join("\n");

    const retry = await generateText({
      systemPrompt: retrySystemPrompt,
      userPrompt: retryUserPrompt,
      mockText: fallbackHtml,
      temperature: 0.35,
      maxTokens: 3800,
      timeoutMs: aiRequestTimeoutMs(),
    });

    const retryHtml = extractHtmlDocument(retry && retry.text ? retry.text : "");
    const retryQuality = assessHtmlQuality(retryHtml);
    if (retryHtml && !isHardQualityFailure(retryQuality)) {
      return {
        html: retryHtml,
        quality: retryQuality,
        source: "ai",
      };
    }

    return {
      html: fallbackHtml,
      quality: retryQuality,
      source: "template",
    };
  }

  return {
    html,
    quality,
    source: "ai",
  };
}

async function writeAutomationArtifacts(pool, input) {
  await pool.query(
    `UPDATE leadpage_jobs
     SET copy_json = ?,
         updated_at = ?
     WHERE job_uuid = ?`,
    [JSON.stringify(input.copyJson || {}), nowSql(), clean(input.jobUuid, 72)]
  );
}

async function runLeadpageAutomation(pool, input) {
  const jobUuid = clean(input && input.jobUuid, 72);
  const dryRun = Boolean(input && input.dryRun);
  const trigger = clean((input && input.trigger) || "manual", 80) || "manual";
  const requestedBy = clean((input && input.requestedBy) || "system", 80) || "system";

  if (!jobUuid) throw new Error("jobUuid is required");

  await ensureLeadpageTables(pool);
  const job = await findLeadpageJobByUuid(pool, jobUuid);
  if (!job) throw new Error("Job not found");

  const brief = normalizeBrief(job);
  const structured = buildStructuredBrief(brief);
  const selected = selectTemplateForBrief(brief);
  const template = selected.template;

  await appendLeadpageEvent(pool, {
    jobUuid,
    eventType: "automation_started",
    eventNote: `AI automation started (${trigger})`,
    payload: {
      requestedBy,
      provider: selectedProviderName(),
      templateId: template.id,
      templateVersion: selected.version,
      templateScore: selected.score,
      matchedKeywords: selected.matchedKeywords,
      dryRun,
    },
  });

  const content = ensureContentShape(fallbackContent(brief), brief);
  const generated = {
    provider: selectedProviderName(),
    model: "heuristic-content-v1",
    mock: false,
    validation: validateGeneratedContent(content),
    content,
  };
  const html = await generateLandingHtml({
    brief,
    template,
    content,
    structured,
  });

  const copyJson = {
    version: "v1",
    template: {
      id: template.id,
      name: template.name,
      category: template.category,
      sections: template.sections,
      voiceGuidance: template.voiceGuidance,
      score: selected.score,
      matchedKeywords: selected.matchedKeywords,
      version: TEMPLATE_VERSION,
    },
    provider: generated.provider,
    model: generated.model,
    mock: generated.mock,
    validation: generated.validation,
    content,
    html: html.html,
    htmlSource: html.source,
    htmlQuality: html.quality,
    structured,
    generatedAt: new Date().toISOString(),
  };

  if (!dryRun) {
    await updateLeadpageClientContent(pool, {
      jobUuid,
      contentJson: content,
      hasFacebookPixelId: false,
      hasGoogleTagId: false,
    });

    await writeAutomationArtifacts(pool, { jobUuid, copyJson });

    await updateLeadpageJob(pool, {
      jobUuid,
      status: "copy_generated",
      adminNote: "AI pipeline generated leadpage copy",
    });

    await updateLeadpageJob(pool, {
      jobUuid,
      status: "page_built",
      adminNote: "AI pipeline produced page artifact",
    });
  }

  await appendLeadpageEvent(pool, {
    jobUuid,
    eventType: "automation_completed",
    eventNote: `AI automation completed (${trigger})`,
    payload: {
      requestedBy,
      provider: generated.provider,
      model: generated.model,
      templateId: template.id,
      templateVersion: TEMPLATE_VERSION,
      templateScore: selected.score,
      matchedKeywords: selected.matchedKeywords,
      htmlSource: html.source,
      htmlQuality: html.quality,
      mock: generated.mock,
      dryRun,
      validationOk: Boolean(generated.validation && generated.validation.ok),
      validationIssues: generated.validation && generated.validation.issues ? generated.validation.issues : [],
    },
  });

  return {
    ok: true,
    jobUuid,
    dryRun,
    trigger,
    template: copyJson.template,
    provider: generated.provider,
    model: generated.model,
    mock: generated.mock,
    validation: generated.validation,
    content,
    artifact: {
      htmlPreviewBytes: Buffer.from(html.html, "utf8").byteLength,
      htmlSource: html.source,
      htmlQuality: html.quality,
    },
  };
}

function selectTemplateId(brief) {
  const selected = selectTemplateForBrief(brief || {});
  return selected && selected.template ? selected.template.id : "general_service_lead";
}

module.exports = {
  runLeadpageAutomation,
  normalizeBrief,
  selectTemplateId,
};
