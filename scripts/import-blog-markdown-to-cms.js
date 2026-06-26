#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content", "blogs");

function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx < 0) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) process.env[key] = value;
  });
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 1000);
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseFrontmatter(raw) {
  const text = String(raw || "");
  if (!text.startsWith("---\n")) return { data: {}, body: text };
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) return { data: {}, body: text };
  const fm = text.slice(4, end).split("\n");
  const body = text.slice(end + 5);
  const data = {};
  for (const line of fm) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = clean(line.slice(0, idx));
    let value = clean(line.slice(idx + 1), 5000);
    if (!key) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((x) => clean(x).replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    }
    data[key] = value;
  }
  return { data, body };
}

function renderInline(text) {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

function markdownToHtml(md) {
  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inList = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      const level = line.match(/^#+/)[0].length;
      html.push(`<h${level}>${renderInline(line.replace(/^#{1,6}\s+/, ""))}</h${level}>`);
      continue;
    }
    if (/^-\s+/.test(line)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInline(line.replace(/^-\s+/, ""))}</li>`);
      continue;
    }
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    html.push(`<p>${renderInline(line)}</p>`);
  }
  if (inList) html.push("</ul>");
  return html.join("\n");
}

function slugify(input) {
  return clean(input, 240)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function pidForSlug(slug) {
  const hash = crypto.createHash("sha1").update(slug).digest("hex").slice(0, 12).toUpperCase();
  return `BLOGMD${hash}`;
}

async function run() {
  loadDotEnv();
  const { getPool } = require("../netlify/functions/_lib/db");
  const { ensureBlogTables, savePost } = require("../netlify/functions/_lib/blog-cms");
  const pool = getPool();
  let imported = 0;
  let skipped = 0;
  try {
    await ensureBlogTables(pool);
    const files = fs.existsSync(CONTENT_DIR) ? fs.readdirSync(CONTENT_DIR).filter((file) => file.endsWith(".md")) : [];
    for (const file of files) {
      const parsed = parseFrontmatter(fs.readFileSync(path.join(CONTENT_DIR, file), "utf8"));
      const title = clean(parsed.data.title) || file.replace(/\.md$/, "");
      const slug = clean(parsed.data.slug) || slugify(title);
      if (!slug) {
        skipped += 1;
        continue;
      }
      const published = parsed.data.published === true || String(parsed.data.published).toLowerCase() === "true";
      await savePost(pool, {
        pidBlog: pidForSlug(slug),
        blogTitle: title,
        blogSlug: slug,
        blogContent: markdownToHtml(parsed.body),
        blogPublished: published,
        blogBy: clean(parsed.data.author) || "Tochukwu Tech and AI Academy",
        excerpt: clean(parsed.data.excerpt, 320),
        tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
        blogImage: clean(parsed.data.image) || clean(parsed.data.heroImage) || "",
        createdAt: clean(parsed.data.date) ? `${clean(parsed.data.date).slice(0, 10)} 00:00:00` : "",
        seo: {
          metaTitle: clean(parsed.data.seoTitle) || clean(parsed.data.metaTitle) || "",
          imageAlt: clean(parsed.data.imageAlt) || clean(parsed.data.heroImageAlt) || title,
        },
      });
      imported += 1;
    }
    console.log(`blog_markdown_import_ok imported=${imported} skipped=${skipped}`);
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("blog_markdown_import_failed", error && error.message ? error.message : error);
  process.exit(1);
});
