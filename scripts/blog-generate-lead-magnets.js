#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const chromium = require("@sparticuz/chromium").default;
const puppeteer = require("puppeteer-core");

const { getPool } = require("../netlify/functions/_lib/db");
const { applyRuntimeSettings } = require("../netlify/functions/_lib/runtime-settings");
const { listPosts } = require("../netlify/functions/_lib/blog-cms");
const {
  getLeadMagnetDownloadUrl,
  getLeadMagnetForPost,
  saveLeadMagnetFile,
  saveLeadMagnetForPost,
} = require("../netlify/functions/_lib/blog-lead-magnets");

const DEFAULT_MODEL = "gpt-4.1";
const LOCAL_DOWNLOAD_DIR = path.join(process.cwd(), "assets", "downloads", "blog-lead-magnets");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => String(item || "").startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function boolArg(name) {
  return process.argv.includes(`--${name}`);
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 1000);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|h1|h2|li|ol|ul|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(input) {
  return clean(input, 180)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseArgs() {
  const limit = Number(arg("limit", "200"));
  return {
    slug: clean(arg("slug", ""), 255),
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 300) : 200,
    force: boolArg("force"),
    dryRun: boolArg("dry-run"),
    localOnly: boolArg("local-only"),
    status: clean(arg("status", "published"), 40),
    model: arg("model", process.env.OPENAI_LEAD_MAGNET_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL),
    timeoutMs: Math.max(15000, Number(arg("timeout-ms", process.env.OPENAI_LEAD_MAGNET_TIMEOUT_MS || "120000")) || 120000),
  };
}

function truncate(value, max) {
  const text = clean(value, max + 80);
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}...`;
}

function compact(value, max, fallback) {
  const text = truncate(value, max || 120).replace(/\s+/g, " ").trim();
  return text || clean(fallback, max || 120);
}

function normalizeList(value, limit, maxLength) {
  const arr = Array.isArray(value) ? value : [];
  return arr.map((item) => cleanListItem(item, maxLength || 220)).filter(Boolean).slice(0, limit || 8);
}

function cleanListItem(value, maxLength) {
  return clean(value, maxLength || 220)
    .replace(/^\s*(?:[-*•]\s*)?(?:\d{1,2}|[a-zA-Z])[\.)]\s+/, "")
    .replace(/^\s*(?:[-*•]\s*)?(?:step|part)\s+\d{1,2}\s*[:.)-]\s*/i, "")
    .trim();
}

function extractLeadingCount(value) {
  const match = clean(value, 120).match(/^(\d{1,2})\s+\S+/);
  if (!match) return 0;
  const count = Number(match[1]);
  return Number.isFinite(count) && count >= 2 && count <= 8 ? count : 0;
}

function extractPromisedCount(value) {
  const match = clean(value, 180).match(/\b(\d{1,2})\s+(?:ai\s+)?(?:project|projects|idea|ideas|step|steps|question|questions|way|ways|mistake|mistakes|check|checks|tip|tips)\b/i);
  if (!match) return 0;
  const count = Number(match[1]);
  return Number.isFinite(count) && count >= 2 && count <= 8 ? count : 0;
}

function normalizeSectionHeading(value, itemCount) {
  const heading = compact(value, 55, "");
  if (!heading) return "";
  const stated = extractLeadingCount(heading);
  if (!stated) return heading;
  return stated === Math.max(0, Number(itemCount || 0)) ? heading : compact(heading.replace(/^\d{1,2}\s+/, ""), 55, heading);
}

function buildLeadMagnetPrompt(post) {
  const content = truncate(stripHtml(post.blogContent), 4200);
  const tags = Array.isArray(post.tags) ? post.tags.join(", ") : "";
  return [
    "You are creating a premium lead magnet for a Nigerian practical AI education website.",
    "The lead magnet will be promoted inside a blog post and through Facebook traffic.",
    "The reader must feel the PDF is specific, useful, and worth submitting their first name and email for.",
    "",
    "Create a concise 1-2 page PDF concept and the matching CMS lead capture fields.",
    "",
    "Rules:",
    "- The PDF must be immediately useful, not fluffy.",
    "- It must match the exact article theme and audience.",
    "- It must be mobile-readable when opened as a PDF.",
    "- It must be practical for Nigerian parents, schools, students, professionals, or business owners depending on the article.",
    "- Do not promise unrealistic outcomes.",
    "- Do not mention Facebook ads.",
    "- Avoid generic titles like 'Ultimate Guide'.",
    "- Use simple direct language.",
    "- The PDF must fit comfortably within two pages. It must never rely on overflow or tiny text.",
    "- Keep every sentence short. Avoid clauses stacked with commas.",
    "- Prefer 2 to 3 compact sections. Each section should usually have 3 to 5 useful bullets.",
    "- If the title, offer, or section heading promises a number, the PDF body must deliver exactly that number of relevant items.",
    "- If the lead magnet promises '5 projects', include one section with exactly 5 project bullets. Do not reduce it to 3.",
    "- Each bullet must be concise but complete, usually 6 to 16 words.",
    "- Do not put a number in a section heading unless it exactly matches the number of bullets in that section.",
    "- If space is tight, shorten each item, not the number of promised items.",
    "- The action plan must use 3 to 4 short next steps.",
    "- The PDF must include a natural service CTA that connects the reader to the most relevant Tochukwu service.",
    "- The service CTA body must be one short sentence and must not exceed 110 characters.",
    "- Pick the CTA URL carefully: schools use /courses/prompt-to-profit-schools/, children/parents use /courses/prompt-to-profit/, business owners use /courses/ai-for-everyday-business-owners/, build/system/website/app topics use /build/, team training or advisory topics use /contact/.",
    "- Do not put numbers, letters, or bullet symbols at the start of list items. The PDF design supplies bullets already.",
    "",
    "Return only valid JSON with this exact shape:",
    "{",
    '  "leadMagnetTitle": "string, max 95 chars",',
    '  "offerHeadline": "string, max 120 chars",',
    '  "description": "string, max 190 chars",',
    '  "buttonText": "string, max 36 chars",',
    '  "bullets": ["3 to 5 short benefit bullets"],',
    '  "emailSubject": "string, max 80 chars",',
    '  "deliveryMessage": "string, max 280 chars",',
    '  "pdf": {',
    '    "title": "string, max 90 chars",',
    '    "subtitle": "string, max 140 chars",',
    '    "audience": "string, max 75 chars",',
    '    "promise": "string, max 120 chars",',
    '    "sections": [',
    '      { "heading": "string, max 55 chars", "items": ["3 to 5 short practical bullets, max 90 chars each; exact count if heading/title promises a number"] }',
    "    ],",
    '    "actionPlan": ["3 to 4 short next steps, max 85 chars each"],',
    '    "closingNote": "string, max 130 chars",',
    '    "serviceCta": {',
    '      "label": "string, max 28 chars",',
    '      "headline": "string, max 62 chars",',
    '      "body": "one short sentence, max 110 chars",',
    '      "url": "one of /courses/prompt-to-profit-schools/, /courses/prompt-to-profit/, /courses/ai-for-everyday-business-owners/, /build/, /contact/"',
    "    }",
    "  }",
    "}",
    "",
    `Blog title: ${post.blogTitle}`,
    `Blog slug: ${post.blogSlug}`,
    post.excerpt ? `Excerpt: ${post.excerpt}` : "",
    tags ? `Tags: ${tags}` : "",
    `Article content: ${content}`,
  ].filter(Boolean).join("\n");
}

async function generateWithOpenAi(post, model, timeoutMsInput) {
  const apiKey = clean(process.env.OPENAI_API_KEY, 500);
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const prompt = buildLeadMagnetPrompt(post);
  const timeoutMs = Math.max(15000, Number(timeoutMsInput || process.env.OPENAI_LEAD_MAGNET_TIMEOUT_MS || "120000") || 120000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.45,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You write precise JSON for high-converting educational lead magnets." },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError") throw new Error(`OpenAI lead magnet generation timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((payload && payload.error && payload.error.message) || `OpenAI lead magnet generation failed (${res.status})`);
  }
  const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message
    ? payload.choices[0].message.content
    : "";
  if (!content) throw new Error("OpenAI returned no lead magnet content.");
  return JSON.parse(content);
}

function normalizeGenerated(raw, post) {
  const data = raw && typeof raw === "object" ? raw : {};
  const pdf = data.pdf && typeof data.pdf === "object" ? data.pdf : {};
  const sections = Array.isArray(pdf.sections) ? pdf.sections : [];
  const leadMagnetTitle = compact(data.leadMagnetTitle, 95, `${clean(post.blogTitle, 70)} Checklist`);
  const pdfTitle = compact(pdf.title, 88, compact(data.leadMagnetTitle, 88, `${clean(post.blogTitle, 70)} Checklist`));
  const globalPromisedCount = extractPromisedCount(`${leadMagnetTitle} ${pdfTitle} ${data.offerHeadline || ""}`);
  return {
    leadMagnetTitle,
    offerHeadline: compact(data.offerHeadline, 115, "Get the practical 2-page PDF for this article"),
    description: compact(data.description, 190, "A concise guide you can save and use after reading this article."),
    buttonText: compact(data.buttonText, 36, "Send me the PDF"),
    bullets: normalizeList(data.bullets, 4, 95),
    emailSubject: compact(data.emailSubject, 80, "Your PDF guide is ready"),
    deliveryMessage: compact(data.deliveryMessage, 240, "Here is the guide I promised in the article. Use it before taking the next step."),
    pdf: {
      title: pdfTitle,
      subtitle: compact(pdf.subtitle, 140, compact(data.description, 140, "")),
      audience: compact(pdf.audience, 75, "For practical AI learners and decision makers"),
      promise: compact(pdf.promise, 120, "Use this to turn the article into a clear next step."),
      sections: sections.map((section) => {
        const headingCount = extractLeadingCount(section && section.heading);
        const sectionText = `${section && section.heading ? section.heading : ""} ${section && Array.isArray(section.items) ? section.items.join(" ") : ""}`;
        const shouldUseGlobalCount = globalPromisedCount && /project|idea|step|question|way|mistake|check|tip/i.test(sectionText);
        const itemLimit = headingCount || (shouldUseGlobalCount ? globalPromisedCount : 4);
        const items = normalizeList(section && section.items, Math.min(Math.max(itemLimit, 3), 8), 90);
        return {
          heading: normalizeSectionHeading(section && section.heading, items.length),
          items,
        };
      }).filter((section) => section.heading && section.items.length).slice(0, 3),
      actionPlan: normalizeList(pdf.actionPlan, 4, 85),
      closingNote: compact(pdf.closingNote, 130, "Start small, make the next step concrete, and build from there."),
      serviceCta: normalizeServiceCta(pdf.serviceCta, post),
    },
  };
}

function ensurePdfCompleteness(item, post) {
  if (!item.bullets.length) item.bullets = ["Know what to check first", "Avoid common mistakes", "Take the next practical step"];
  if (!item.pdf.sections.length) {
    item.pdf.sections = [
      { heading: "What to check", items: item.bullets.slice(0, 4) },
      { heading: "What to do next", items: item.pdf.actionPlan.slice(0, 4) },
    ];
  }
  if (!item.pdf.actionPlan.length) {
    item.pdf.actionPlan = ["Review the checklist", "Pick one immediate action", "Discuss it with the right person", "Set a date to execute"];
  }
  item.pdf.serviceCta = normalizeServiceCta(item.pdf.serviceCta, post);
  return item;
}

function inferServiceCta(post) {
  const text = `${clean(post && post.blogTitle, 300)} ${clean(post && post.excerpt, 500)} ${stripHtml(post && post.blogContent).slice(0, 1600)}`.toLowerCase();
  if (/\b(school|schools|principal|principals|classroom|curriculum|teacher|teachers)\b/.test(text)) {
    return {
      label: "Explore school training",
      headline: "Want this implemented in your school?",
      body: "Bring practical AI projects into your school with a guided rollout.",
      url: "/courses/prompt-to-profit-schools/",
    };
  }
  if (/\b(child|children|teen|teenager|teenagers|student|students|parent|parents|kids)\b/.test(text)) {
    return {
      label: "View children’s course",
      headline: "Help your child build real AI projects",
      body: "Give your child a guided path to build useful AI projects safely.",
      url: "/courses/prompt-to-profit/",
    };
  }
  if (/\b(website|websites|app|apps|application|internal tool|lead capture|automation|system|systems|build|building)\b/.test(text)) {
    return {
      label: "Start a build project",
      headline: "Need this built properly for your business?",
      body: "Turn the idea into a focused web system or lead capture flow.",
      url: "/build/",
    };
  }
  if (/\b(team|teams|business|businesses|company|companies|staff|employees|training|workshop|owners|professionals)\b/.test(text)) {
    return {
      label: "Discuss team training",
      headline: "Want practical AI training for your team?",
      body: "Book a conversation about hands-on AI training for your team.",
      url: "/contact/",
    };
  }
  return {
    label: "Contact Tochukwu",
    headline: "Want help choosing the right next step?",
    body: "Reach out for guidance on courses, training, or implementation.",
    url: "/contact/",
  };
}

function normalizeServiceCta(value, post) {
  const fallback = inferServiceCta(post);
  const data = value && typeof value === "object" ? value : {};
  const allowed = new Set([
    "/courses/prompt-to-profit-schools/",
    "/courses/prompt-to-profit/",
    "/courses/ai-for-everyday-business-owners/",
    "/build/",
    "/contact/",
  ]);
  const url = clean(data.url, 180);
  return {
    label: compact(data.label, 28, fallback.label),
    headline: compact(data.headline, 62, fallback.headline),
    body: compact(data.body, 110, fallback.body),
    url: allowed.has(url) ? url : fallback.url,
  };
}

function renderPdfHtml(item, post) {
  const accent = "#2a9d8f";
  const title = escapeHtml(item.pdf.title);
  const subtitle = escapeHtml(item.pdf.subtitle);
  const sections = item.pdf.sections.map((section, index) => `
    <section class="panel">
      <p class="kicker">Part ${index + 1}</p>
      <h2>${escapeHtml(section.heading)}</h2>
      <ul>${section.items.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
    </section>
  `).join("");
  const serviceCta = item.pdf.serviceCta || inferServiceCta(post);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6fb; color: #101827; font-family: Inter, Arial, sans-serif; }
    .page { width: 210mm; height: 297mm; padding: 14mm; background: #f6f7fb; page-break-after: always; display: flex; flex-direction: column; overflow: hidden; }
    .page:last-child { page-break-after: auto; }
    .hero { background: #0f172a; color: #fff; border-radius: 18px; padding: 20px; position: relative; overflow: hidden; }
    .hero:after { content: ""; position: absolute; right: -50px; top: -50px; width: 160px; height: 160px; border-radius: 999px; background: rgba(42,157,143,.22); }
    .eyebrow, .kicker { margin: 0 0 8px; color: #a5d6ff; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; font-weight: 800; }
    h1 { position: relative; margin: 0; max-width: 620px; font-size: 28px; line-height: 1.08; letter-spacing: -.03em; }
    .subtitle { position: relative; max-width: 620px; margin: 10px 0 0; color: #cbd5e1; font-size: 13px; line-height: 1.48; }
    .meta { display: grid; grid-template-columns: 1fr 1.2fr; gap: 10px; margin-top: 12px; }
    .meta-card { border: 1px solid #dbe3ef; background: #fff; border-radius: 14px; padding: 12px; }
    .meta-card strong { display: block; color: #0f172a; font-size: 13px; margin-bottom: 4px; }
    .meta-card span { color: #475569; font-size: 12px; line-height: 1.45; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
    .panel { border: 1px solid #dbe3ef; background: #fff; border-radius: 16px; padding: 13px; min-height: 96px; }
    h2 { margin: 0 0 9px; color: #14213d; font-size: 17px; line-height: 1.18; letter-spacing: -.02em; }
    h3 { margin: 0 0 8px; color: #14213d; font-size: 14px; line-height: 1.25; letter-spacing: -.01em; }
    ul, ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 7px; }
    li { position: relative; padding-left: 17px; color: #334155; font-size: 12px; line-height: 1.38; }
    li:before { content: ""; position: absolute; left: 0; top: .55em; width: 7px; height: 7px; border-radius: 999px; background: ${accent}; }
    .page-title { margin: 0; color: #0f172a; font-size: 26px; line-height: 1.12; letter-spacing: -.03em; }
    .page-subtitle { margin: 9px 0 0; max-width: 620px; color: #475569; font-size: 12.5px; line-height: 1.48; }
    .action { margin-top: 12px; border-radius: 18px; padding: 16px; color: #fff; background: linear-gradient(135deg, #14213d, #1a2849); }
    .action h2 { color: #fff; }
    .action li { color: #e2e8f0; }
    .service-cta { margin-top: 12px; border-radius: 18px; padding: 16px; color: #fff; background: #0f172a; border: 1px solid rgba(42,157,143,.32); display: grid; gap: 10px; align-items: start; }
    .service-cta > div { min-width: 0; }
    .service-cta .kicker { color: #7dd3fc; }
    .service-cta h2 { color: #fff; margin-bottom: 7px; font-size: 17px; }
    .service-cta p { margin: 0; color: #cbd5e1; font-size: 12px; line-height: 1.42; }
    .service-button { display: inline-block; justify-self: start; white-space: nowrap; border-radius: 999px; background: ${accent}; color: #fff; text-decoration: none; padding: 9px 13px; font-size: 10.5px; font-weight: 900; }
    .note { margin-top: 12px; border-left: 4px solid ${accent}; background: #fff; border-radius: 0 14px 14px 0; padding: 12px 14px; color: #334155; font-size: 12.5px; line-height: 1.48; }
    .footer { display: flex; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 10px; color: #64748b; font-size: 10px; }
    .source { color: #64748b; font-size: 10px; line-height: 1.45; margin-top: 8px; }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <p class="eyebrow">Tochukwu Tech and AI Academy</p>
      <h1>${title}</h1>
      <p class="subtitle">${subtitle}</p>
    </section>
    <section class="meta">
      <div class="meta-card"><strong>Who this is for</strong><span>${escapeHtml(item.pdf.audience)}</span></div>
      <div class="meta-card"><strong>What this helps you do</strong><span>${escapeHtml(item.pdf.promise)}</span></div>
    </section>
    <section class="grid">${sections}</section>
    <p class="source">Created as a companion guide for: ${escapeHtml(post.blogTitle)}</p>
    <div class="footer"><span>Practical AI. Real-world building.</span><span>tochukwunkwocha.com</span></div>
  </main>
  <main class="page">
    <p class="eyebrow">Action page</p>
    <h1 class="page-title">Turn the checklist into one clear next step</h1>
    <p class="page-subtitle">Use this page to move from reading to a concrete decision. Print it, share it with the right person, and agree on the first action before the day ends.</p>
    <section class="action">
      <p class="kicker">Next steps</p>
      <h2>Use this in the next 24 hours</h2>
      <ol>${item.pdf.actionPlan.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ol>
    </section>
    <section class="service-cta">
      <div>
        <p class="kicker">Recommended next step</p>
        <h2>${escapeHtml(serviceCta.headline)}</h2>
        <p>${escapeHtml(serviceCta.body)}</p>
      </div>
      <a class="service-button" href="https://tochukwunkwocha.com${escapeHtml(serviceCta.url)}">${escapeHtml(serviceCta.label)}</a>
    </section>
    <p class="note">${escapeHtml(item.pdf.closingNote)}</p>
    <p class="source">Created as a companion guide for: ${escapeHtml(post.blogTitle)}</p>
    <div class="footer"><span>Practical AI. Real-world building.</span><span>tochukwunkwocha.com</span></div>
  </main>
</body>
</html>`;
}

async function renderPdfBuffer(html) {
  const executablePath = await chromium.executablePath();
  if (!executablePath) throw new Error("Packaged Chromium executable was not found. Ensure @sparticuz/chromium is installed in production dependencies.");
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless == null ? true : chromium.headless,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: Math.max(10000, Number(process.env.PDF_EXPORT_TIMEOUT_MS || "60000") || 60000) });
    return Buffer.from(await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    }));
  } finally {
    await browser.close().catch(() => {});
  }
}

async function createPdfBuffer(item, post) {
  const slug = slugify(post.blogSlug || post.blogTitle) || `lead-magnet-${Date.now()}`;
  return {
    buffer: await renderPdfBuffer(renderPdfHtml(item, post)),
    filename: `${slug}-guide.pdf`,
  };
}

async function generateLeadMagnetForPost(pool, post, optionsInput) {
  const options = optionsInput && typeof optionsInput === "object" ? optionsInput : {};
  const model = options.model || process.env.OPENAI_LEAD_MAGNET_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const timeoutMs = Math.max(15000, Number(options.timeoutMs || process.env.OPENAI_LEAD_MAGNET_TIMEOUT_MS || "120000") || 120000);
  const localOnly = options.localOnly === true;
  const existing = await getLeadMagnetForPost(pool, post.pidBlog).catch(() => null);
  const generated = ensurePdfCompleteness(normalizeGenerated(await generateWithOpenAi(post, model, timeoutMs), post), post);
  if (existing && existing.magnetUuid) {
    generated.leadMagnetTitle = existing.title ? compact(existing.title, 95, generated.leadMagnetTitle) : generated.leadMagnetTitle;
    generated.offerHeadline = existing.offerHeadline ? compact(existing.offerHeadline, 115, generated.offerHeadline) : generated.offerHeadline;
    generated.description = existing.description ? compact(existing.description, 190, generated.description) : generated.description;
    generated.buttonText = existing.buttonText ? compact(existing.buttonText, 36, generated.buttonText) : generated.buttonText;
    generated.bullets = Array.isArray(existing.bullets) && existing.bullets.length ? normalizeList(existing.bullets, 4, 95) : generated.bullets;
    generated.emailSubject = existing.emailSubject ? compact(existing.emailSubject, 80, generated.emailSubject) : generated.emailSubject;
    generated.deliveryMessage = existing.deliveryMessage ? compact(existing.deliveryMessage, 240, generated.deliveryMessage) : generated.deliveryMessage;
    generated.pdf.title = existing.title ? compact(existing.title, 88, generated.pdf.title) : generated.pdf.title;
    generated.pdf.subtitle = existing.description ? compact(existing.description, 140, generated.pdf.subtitle) : generated.pdf.subtitle;
  }

  const pdf = await createPdfBuffer(generated, post);
  let pdfUrl = "";
  let pdfResourceType = "database";
  if (localOnly) {
    fs.mkdirSync(LOCAL_DOWNLOAD_DIR, { recursive: true });
    const localPath = path.join(LOCAL_DOWNLOAD_DIR, pdf.filename);
    fs.writeFileSync(localPath, pdf.buffer);
    pdfUrl = `/assets/downloads/blog-lead-magnets/${pdf.filename}`;
    pdfResourceType = "local";
  }

  let savedMagnet = await saveLeadMagnetForPost(pool, {
    pidBlog: post.pidBlog,
    enabled: true,
    slug: existing && existing.slug ? existing.slug : "",
    title: generated.leadMagnetTitle,
    offerHeadline: generated.offerHeadline,
    description: generated.description,
    buttonText: generated.buttonText,
    bullets: generated.bullets,
    pdfUrl,
    pdfPublicId: "",
    pdfResourceType,
    pdfFilename: pdf.filename,
    brevoListId: 17,
    emailSubject: generated.emailSubject,
    deliveryMessage: generated.deliveryMessage,
  });
  if (!localOnly) {
    await saveLeadMagnetFile(pool, savedMagnet, {
      buffer: pdf.buffer,
      filename: pdf.filename,
      contentType: "application/pdf",
    });
    pdfUrl = getLeadMagnetDownloadUrl(savedMagnet.slug);
    savedMagnet = await saveLeadMagnetForPost(pool, {
      pidBlog: post.pidBlog,
      enabled: true,
      slug: savedMagnet.slug,
      title: savedMagnet.title,
      offerHeadline: savedMagnet.offerHeadline,
      description: savedMagnet.description,
      buttonText: savedMagnet.buttonText,
      bullets: savedMagnet.bullets,
      pdfUrl,
      pdfPublicId: "",
      pdfResourceType: "database",
      pdfFilename: pdf.filename,
      brevoListId: savedMagnet.brevoListId,
      emailSubject: savedMagnet.emailSubject,
      deliveryMessage: savedMagnet.deliveryMessage,
    });
  }
  return {
    leadMagnet: savedMagnet,
    generated,
    pdf: {
      url: pdfUrl || savedMagnet.pdfUrl,
      filename: pdf.filename,
      byteSize: pdf.buffer.length,
    },
  };
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env"));
  loadEnv(path.join(process.cwd(), ".env.local"));
  const options = parseArgs();
  const pool = getPool();
  try {
    await applyRuntimeSettings(pool, { force: true });
    const result = await listPosts(pool, { status: options.status, limit: options.limit });
    const posts = (result.posts || []).filter((post) => {
      if (!options.slug) return true;
      return clean(post.blogSlug) === options.slug;
    });
    console.log(`Preparing lead magnets for ${posts.length} blog post(s).`);

    for (const post of posts) {
      const existing = await getLeadMagnetForPost(pool, post.pidBlog).catch(() => null);
      if (existing && existing.pdfUrl && existing.active && !options.force) {
        console.log(`[skip] ${post.blogSlug} already has an active PDF lead magnet`);
        continue;
      }

      console.log(`[generate] ${post.blogTitle}`);
      console.log(`  [openai] model=${options.model}`);
      if (options.dryRun) {
        const generated = ensurePdfCompleteness(normalizeGenerated(await generateWithOpenAi(post, options.model, options.timeoutMs), post), post);
        console.log(JSON.stringify({ slug: post.blogSlug, generated }, null, 2));
        continue;
      }
      console.log("  [pdf] exporting");
      console.log("  [cms] saving active lead magnet");
      const result = await generateLeadMagnetForPost(pool, post, options);
      console.log(`[saved] ${post.blogSlug} -> ${result.pdf.url || result.pdf.filename}`);
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("blog_generate_lead_magnets_failed", error && error.stack ? error.stack : error);
    process.exit(1);
  });
}

module.exports = {
  generateLeadMagnetForPost,
};
