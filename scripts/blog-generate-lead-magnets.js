#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

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

function deDuplicateLocalContext(value, post) {
  let text = String(value || "").replace(/\s+/g, " ").trim();
  const postText = `${post && post.blogTitle ? post.blogTitle : ""} ${post && post.excerpt ? post.excerpt : ""}`;
  const alreadyContextual = /\bNigeria(?:n)?\b/i.test(postText);
  if (!alreadyContextual || !text) return text;
  const matches = text.match(/\bNigeria(?:n)?\b/gi) || [];
  if (matches.length <= 1) return text;
  let seen = 0;
  text = text.replace(/\b(Nigerian|Nigeria)\b/gi, (match) => {
    seen += 1;
    return seen === 1 ? match : "";
  });
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\bfor\s+(parents|schools|students|businesses|owners|teams)\b/gi, "for $1")
    .trim();
}

function stripCountPhrases(value) {
  return String(value || "")
    .replace(/\b\d{1,2}-page\s+/gi, "")
    .replace(/\b(?:one|two|three)-page\s+/gi, "")
    .replace(/\b\d{1,2}\s+(?=(?:[a-z-]+\s+){0,4}(?:area|areas|check|checks|essential|essentials|factor|factors|idea|ideas|item|items|lesson|lessons|mistake|mistakes|project|projects|prompt|prompts|question|questions|skill|skills|step|steps|task|tasks|tip|tips|tool|tools|way|ways)\b)/gi, "")
    .replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?=(?:[a-z-]+\s+){0,4}(?:area|areas|check|checks|essential|essentials|factor|factors|idea|ideas|item|items|lesson|lessons|mistake|mistakes|project|projects|prompt|prompts|question|questions|skill|skills|step|steps|task|tasks|tip|tips|tool|tools|way|ways)\b)/gi, "")
    .replace(/\b(?:top|the)\s+\d{1,2}\s+(?=(?:ai\s+)?(?:area|areas|check|checks|essential|essentials|factor|factors|idea|ideas|item|items|lesson|lessons|mistake|mistakes|project|projects|prompt|prompts|question|questions|skill|skills|step|steps|task|tasks|tip|tips|tool|tools|way|ways)\b)/gi, "")
    .replace(/\b\d{1,2}\s+(?=(?:ai\s+)?(?:area|areas|check|checks|essential|essentials|factor|factors|idea|ideas|item|items|lesson|lessons|mistake|mistakes|project|projects|prompt|prompts|question|questions|skill|skills|step|steps|task|tasks|tip|tips|tool|tools|way|ways)\b)/gi, "")
    .replace(/^\s*(?:top|the)\s+\d{1,2}\s+/i, "")
    .replace(/^\s*\d{1,2}\s+/, "")
    .replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?=(?:ai\s+)?(?:area|areas|check|checks|essential|essentials|factor|factors|idea|ideas|item|items|lesson|lessons|mistake|mistakes|project|projects|prompt|prompts|question|questions|skill|skills|step|steps|task|tasks|tip|tips|tool|tools|way|ways)\b)/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function cleanContext(value, post) {
  return stripCountPhrases(deDuplicateLocalContext(value, post));
}

function compactContext(value, max, fallback, post) {
  return compact(cleanContext(value, post), max, stripCountPhrases(fallback));
}

function normalizeList(value, limit, maxLength) {
  const arr = Array.isArray(value) ? value : [];
  return arr.map((item) => cleanListItem(item, maxLength || 220)).filter(Boolean).slice(0, limit || 8);
}

function normalizeContextList(value, limit, maxLength, post) {
  const arr = Array.isArray(value) ? value : [];
  return arr
    .map((item) => cleanListItem(cleanContext(item, post), maxLength || 220))
    .filter(Boolean)
    .slice(0, limit || 8);
}

function cleanListItem(value, maxLength) {
  return stripCountPhrases(clean(value, maxLength || 220))
    .replace(/^\s*(?:[-*•]\s*)?(?:\d{1,2}|[a-zA-Z])[\.)]\s+/, "")
    .replace(/^\s*(?:[-*•]\s*)?(?:step|part)\s+\d{1,2}\s*[:.)-]\s*/i, "")
    .trim();
}

function normalizePdfHeading(value) {
  return compact(stripCountPhrases(value), 55, "");
}

function buildLeadMagnetPrompt(post) {
  const content = truncate(stripHtml(post.blogContent), 4200);
  const tags = Array.isArray(post.tags) ? post.tags.join(", ") : "";
  return [
    "You are creating a premium lead magnet for a practical AI education website with a strong Nigerian audience.",
    "The lead magnet will be promoted inside a blog post and through Facebook traffic.",
    "The reader must feel the PDF is specific, useful, and worth submitting their first name and email for.",
    "",
    "Create a concise PDF concept and the matching CMS lead capture fields.",
    "",
    "Rules:",
    "- The PDF must be immediately useful, not fluffy.",
    "- It must match the exact article theme and audience.",
    "- It must be mobile-readable when opened as a PDF.",
    "- It must be practical for the specific readers in the article: parents, schools, students, professionals, teams, or business owners.",
    "- Do not repeat 'Nigeria' or 'Nigerian' mechanically. If the blog title already says Nigeria/Nigerian, use it sparingly in the PDF and prefer natural phrasing like 'parents', 'schools', 'business owners', or 'your team'.",
    "- Do not promise unrealistic outcomes.",
    "- Do not mention Facebook ads.",
    "- Avoid generic titles like 'Ultimate Guide'.",
    "- Use simple direct language.",
    "- The PDF must fit comfortably within two pages. It must never rely on overflow or tiny text.",
    "- Keep every sentence short. Avoid clauses stacked with commas.",
    "- Do not use numeric promises anywhere in titles, headings, labels, button text, CTA copy, bullets, or body text.",
    "- Do not write counted promises about prompts, areas, steps, ways, projects, skills, tips, or tools.",
    "- Use natural headings like 'AI prompts for everyday business tasks', 'Key areas to score for AI readiness', or 'Project ideas to try this week'.",
    "- Use compact sections with enough useful bullets to feel valuable while still fitting the PDF.",
    "- Each bullet must be concise but complete.",
    "- If space is tight, shorten the wording instead of introducing a numeric promise.",
    "- The PDF must include a natural service CTA that connects the reader to the most relevant Tochukwu service.",
    "- The service CTA body must be one short sentence and must not exceed 110 characters.",
    "- Pick the CTA URL carefully: schools use /courses/prompt-to-profit-schools/, children/parents use /courses/prompt-to-profit/, business owners use /courses/ai-for-everyday-business-owners/, build/system/website/app topics use /build/, team training or advisory topics use /contact/.",
    "- Do not put numbers, letters, or bullet symbols at the start of list items. The PDF design supplies bullets already.",
    "",
    "Return only valid JSON with this exact shape:",
    "{",
    '  "leadMagnetTitle": "string, max 95 chars, no numbers or count promises",',
    '  "offerHeadline": "string, max 120 chars",',
    '  "description": "string, max 190 chars",',
    '  "buttonText": "string, max 36 chars",',
    '  "bullets": ["short benefit bullets, no numbers or count promises"],',
    '  "emailSubject": "string, max 80 chars",',
    '  "deliveryMessage": "string, max 280 chars",',
    '  "pdf": {',
    '    "title": "string, max 90 chars",',
    '    "subtitle": "string, max 140 chars",',
    '    "audience": "string, max 75 chars",',
    '    "promise": "string, max 120 chars",',
    '    "sections": [',
    '      { "heading": "string, max 55 chars, no numbers or count promises", "items": ["short practical bullets, max 90 chars each, no numbers or count promises"] }',
    "    ],",
    '    "actionPlan": ["short next steps, max 85 chars each, no numbers or count promises"],',
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
  const leadMagnetTitle = compactContext(data.leadMagnetTitle, 95, `${clean(post.blogTitle, 70)} Checklist`, post);
  const pdfTitle = compactContext(pdf.title, 88, compactContext(data.leadMagnetTitle, 88, `${clean(post.blogTitle, 70)} Checklist`, post), post);
  return {
    leadMagnetTitle,
    offerHeadline: compactContext(data.offerHeadline, 115, "Get the practical PDF for this article", post),
    description: compactContext(data.description, 190, "A concise guide you can save and use after reading this article.", post),
    buttonText: compact(stripCountPhrases(data.buttonText), 36, "Send me the PDF"),
    bullets: normalizeContextList(data.bullets, 5, 95, post),
    emailSubject: compact(data.emailSubject, 80, "Your PDF guide is ready"),
    deliveryMessage: compact(data.deliveryMessage, 240, "Here is the guide I promised in the article. Use it before taking the next step."),
    pdf: {
      title: pdfTitle,
      subtitle: compactContext(pdf.subtitle, 140, compactContext(data.description, 140, "", post), post),
      audience: compactContext(pdf.audience, 75, "For practical AI learners and decision makers", post),
      promise: compactContext(pdf.promise, 120, "Use this to turn the article into a clear next step.", post),
      sections: sections.map((section) => {
        const items = normalizeContextList(section && section.items, 5, 90, post);
        return {
          heading: normalizePdfHeading(section && section.heading),
          items,
        };
      }).filter((section) => section.heading && section.items.length).slice(0, 3),
      actionPlan: normalizeContextList(pdf.actionPlan, 5, 85, post),
      closingNote: compactContext(pdf.closingNote, 130, "Start small, make the next step concrete, and build from there.", post),
      serviceCta: normalizeServiceCta(pdf.serviceCta, post),
    },
  };
}

function ensurePdfCompleteness(item, post) {
  if (!item.bullets.length) item.bullets = ["Know what to check first", "Avoid common mistakes", "Take the next practical step"];
  if (!item.pdf.sections.length) {
    item.pdf.sections = [
      { heading: "What to check", items: item.bullets.slice(0, 5) },
      { heading: "What to do next", items: item.pdf.actionPlan.slice(0, 5) },
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
    label: compact(stripCountPhrases(data.label), 28, fallback.label),
    headline: compact(stripCountPhrases(data.headline), 62, fallback.headline),
    body: compact(stripCountPhrases(data.body), 110, fallback.body),
    url: allowed.has(url) ? url : fallback.url,
  };
}

function collectPdf(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function fillPage(doc) {
  doc.rect(0, 0, 595.28, 841.89).fill("#f6f7fb");
}

function textBlock(doc, text, x, y, width, options) {
  const opts = options || {};
  doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts.size || 12)
    .fillColor(opts.color || "#334155")
    .text(String(text || ""), x, y, {
      width,
      lineGap: opts.lineGap == null ? 2 : opts.lineGap,
      continued: false,
      link: opts.link,
      underline: opts.underline === true,
    });
  return doc.y;
}

function drawKicker(doc, text, x, y, color) {
  return textBlock(doc, String(text || "").toUpperCase(), x, y, 500, {
    size: 8.5,
    bold: true,
    color: color || "#a5d6ff",
    lineGap: 0,
  });
}

function drawBulletList(doc, items, x, y, width, options) {
  const opts = options || {};
  let cursor = y;
  (items || []).forEach((item) => {
    const text = cleanListItem(item, 220);
    if (!text) return;
    doc.circle(x + 3, cursor + 7, 3.2).fill(opts.dotColor || "#2a9d8f");
    doc.font("Helvetica").fontSize(opts.size || 10.5).fillColor(opts.color || "#334155");
    doc.text(text, x + 15, cursor, {
      width: width - 15,
      lineGap: opts.lineGap == null ? 2 : opts.lineGap,
    });
    cursor = doc.y + (opts.gap == null ? 6 : opts.gap);
  });
  return cursor;
}

function roundedPanel(doc, x, y, width, height, options) {
  const opts = options || {};
  doc.roundedRect(x, y, width, height, opts.radius || 13)
    .fillAndStroke(opts.fill || "#ffffff", opts.stroke || "#dbe3ef");
}

function drawMetaCard(doc, x, y, width, title, body) {
  roundedPanel(doc, x, y, width, 62, { radius: 11 });
  textBlock(doc, title, x + 12, y + 12, width - 24, { size: 10.5, bold: true, color: "#0f172a" });
  textBlock(doc, body, x + 12, y + 29, width - 24, { size: 9.5, color: "#475569", lineGap: 1.5 });
}

function estimateSectionHeight(doc, section, width) {
  doc.font("Helvetica-Bold").fontSize(15);
  const headingHeight = doc.heightOfString(section.heading || "", { width: width - 24, lineGap: 1 });
  doc.font("Helvetica").fontSize(10.2);
  const itemHeight = (section.items || []).reduce((sum, item) => {
    return sum + doc.heightOfString(String(item || ""), { width: width - 39, lineGap: 1.5 }) + 7;
  }, 0);
  return Math.max(118, 44 + headingHeight + itemHeight);
}

function drawSectionPanel(doc, section, x, y, width) {
  const safeSection = Object.assign({}, section, {
    heading: normalizePdfHeading(section && section.heading),
  });
  const height = estimateSectionHeight(doc, safeSection, width);
  roundedPanel(doc, x, y, width, height, { radius: 13 });
  drawKicker(doc, "Guide section", x + 12, y + 12, "#a5d6ff");
  textBlock(doc, safeSection.heading, x + 12, y + 32, width - 24, { size: 15, bold: true, color: "#14213d", lineGap: 1 });
  drawBulletList(doc, safeSection.items, x + 12, doc.y + 8, width - 24, { size: 10.2, lineGap: 1.5, gap: 5 });
  return height;
}

function drawFooter(doc, postTitle) {
  const y = 800;
  textBlock(doc, `Created as a companion guide for: ${postTitle}`, 40, y - 22, 430, { size: 8.5, color: "#64748b", lineGap: 1 });
  textBlock(doc, "Practical AI. Real-world building.", 40, y + 8, 220, { size: 8.5, color: "#64748b" });
  textBlock(doc, "tochukwunkwocha.com", 430, y + 8, 125, { size: 8.5, color: "#64748b" });
}

function drawPageOne(doc, item, post) {
  fillPage(doc);
  const margin = 40;
  const pageWidth = 595.28;
  const contentWidth = pageWidth - (margin * 2);
  roundedPanel(doc, margin, 38, contentWidth, 130, { radius: 15, fill: "#0f172a", stroke: "#0f172a" });
  drawKicker(doc, "Tochukwu Tech and AI Academy", margin + 18, 58);
  textBlock(doc, item.pdf.title, margin + 18, 78, contentWidth - 36, { size: 23, bold: true, color: "#ffffff", lineGap: 1 });
  textBlock(doc, item.pdf.subtitle, margin + 18, doc.y + 8, contentWidth - 36, { size: 10.8, color: "#cbd5e1", lineGap: 2 });

  const metaY = 182;
  drawMetaCard(doc, margin, metaY, 238, "Who this is for", item.pdf.audience);
  drawMetaCard(doc, margin + 252, metaY, contentWidth - 252, "What this helps you do", item.pdf.promise);

  const colGap = 12;
  const colWidth = (contentWidth - colGap) / 2;
  let leftY = metaY + 78;
  let rightY = metaY + 78;
  (item.pdf.sections || []).slice(0, 3).forEach((section, index) => {
    const useLeft = index % 2 === 0;
    const x = useLeft ? margin : margin + colWidth + colGap;
    const y = useLeft ? leftY : rightY;
    const height = drawSectionPanel(doc, section, x, y, colWidth);
    if (useLeft) leftY = y + height + 12;
    else rightY = y + height + 12;
  });

  drawFooter(doc, post.blogTitle);
}

function drawPageTwo(doc, item, post) {
  fillPage(doc);
  const margin = 40;
  const contentWidth = 595.28 - (margin * 2);
  const serviceCta = item.pdf.serviceCta || inferServiceCta(post);

  drawKicker(doc, "Action page", margin, 46);
  textBlock(doc, "Turn the checklist into a clear next step", margin, 68, contentWidth, { size: 25, bold: true, color: "#0f172a", lineGap: 1 });
  textBlock(doc, "Use this page to move from reading to a concrete decision. Print it, share it with the right person, and agree on an action before the day ends.", margin, doc.y + 10, contentWidth, { size: 11.2, color: "#475569", lineGap: 2 });

  let y = doc.y + 22;
  roundedPanel(doc, margin, y, contentWidth, 148, { radius: 16, fill: "#14213d", stroke: "#14213d" });
  drawKicker(doc, "Next steps", margin + 16, y + 18, "#a5d6ff");
  textBlock(doc, "Use this soon", margin + 16, y + 40, contentWidth - 32, { size: 17, bold: true, color: "#ffffff" });
  drawBulletList(doc, item.pdf.actionPlan, margin + 16, doc.y + 11, contentWidth - 32, { size: 10.8, color: "#e2e8f0", dotColor: "#2a9d8f", gap: 5 });

  y += 166;
  roundedPanel(doc, margin, y, contentWidth, 142, { radius: 16, fill: "#0f172a", stroke: "#2a9d8f" });
  drawKicker(doc, "Recommended next step", margin + 16, y + 16, "#7dd3fc");
  textBlock(doc, serviceCta.headline, margin + 16, y + 38, contentWidth - 32, { size: 17, bold: true, color: "#ffffff", lineGap: 1 });
  textBlock(doc, serviceCta.body, margin + 16, doc.y + 7, contentWidth - 32, { size: 10.8, color: "#cbd5e1", lineGap: 2 });
  const buttonY = doc.y + 12;
  const buttonWidth = Math.min(210, Math.max(112, doc.widthOfString(serviceCta.label) + 28));
  doc.roundedRect(margin + 16, buttonY, buttonWidth, 28, 14).fill("#2a9d8f");
  doc.link(margin + 16, buttonY, buttonWidth, 28, `https://tochukwunkwocha.com${serviceCta.url}`);
  textBlock(doc, serviceCta.label, margin + 30, buttonY + 8, buttonWidth - 28, { size: 9.5, bold: true, color: "#ffffff", lineGap: 0 });

  y += 160;
  doc.rect(margin, y, 4, 70).fill("#2a9d8f");
  roundedPanel(doc, margin + 4, y, contentWidth - 4, 70, { radius: 0, fill: "#ffffff", stroke: "#ffffff" });
  textBlock(doc, item.pdf.closingNote, margin + 18, y + 18, contentWidth - 34, { size: 11.2, color: "#334155", lineGap: 2 });

  drawFooter(doc, post.blogTitle);
}

async function renderPdfDocument(item, post) {
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: false, autoFirstPage: false });
  const done = collectPdf(doc);
  doc.addPage();
  drawPageOne(doc, item, post);
  doc.addPage();
  drawPageTwo(doc, item, post);
  doc.end();
  return done;
}

async function createPdfBuffer(item, post) {
  const slug = slugify(post.blogSlug || post.blogTitle) || `lead-magnet-${Date.now()}`;
  return {
    buffer: await renderPdfDocument(item, post),
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
    generated.leadMagnetTitle = existing.title ? compactContext(existing.title, 95, generated.leadMagnetTitle, post) : generated.leadMagnetTitle;
    generated.offerHeadline = existing.offerHeadline ? compactContext(existing.offerHeadline, 115, generated.offerHeadline, post) : generated.offerHeadline;
    generated.description = existing.description ? compactContext(existing.description, 190, generated.description, post) : generated.description;
    generated.buttonText = existing.buttonText ? compact(stripCountPhrases(existing.buttonText), 36, generated.buttonText) : generated.buttonText;
    generated.bullets = Array.isArray(existing.bullets) && existing.bullets.length ? normalizeContextList(existing.bullets, 5, 95, post) : generated.bullets;
    generated.emailSubject = existing.emailSubject ? compact(stripCountPhrases(existing.emailSubject), 80, generated.emailSubject) : generated.emailSubject;
    generated.deliveryMessage = existing.deliveryMessage ? compactContext(existing.deliveryMessage, 240, generated.deliveryMessage, post) : generated.deliveryMessage;
    generated.pdf.title = existing.title ? compactContext(existing.title, 88, generated.pdf.title, post) : generated.pdf.title;
    generated.pdf.subtitle = existing.description ? compactContext(existing.description, 140, generated.pdf.subtitle, post) : generated.pdf.subtitle;
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
    pdfUrl = `${getLeadMagnetDownloadUrl(savedMagnet.slug)}&v=${Date.now()}`;
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
  createPdfBuffer,
  generateLeadMagnetForPost,
};
