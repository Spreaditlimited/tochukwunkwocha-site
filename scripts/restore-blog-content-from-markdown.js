#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content", "blogs");
const BLOG_POSTS_TABLE = "tochukwu_blog_posts";

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && process.env[key] == null) process.env[key] = value;
  }
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
  const data = {};
  for (const line of text.slice(4, end).split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = clean(line.slice(0, idx));
    let value = clean(line.slice(idx + 1), 5000);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!key) continue;
    data[key] = value;
  }
  return { data, body: text.slice(end + 5) };
}

function slugify(input) {
  return clean(input, 240)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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

function readSources() {
  const bySlug = new Map();
  const byTitle = new Map();
  if (!fs.existsSync(CONTENT_DIR)) return { bySlug, byTitle };
  for (const file of fs.readdirSync(CONTENT_DIR).filter((item) => item.endsWith(".md"))) {
    const parsed = parseFrontmatter(fs.readFileSync(path.join(CONTENT_DIR, file), "utf8"));
    const title = clean(parsed.data.title) || file.replace(/\.md$/, "");
    const slug = clean(parsed.data.slug) || slugify(title);
    if (!title || !slug) continue;
    const source = { file, title, slug, html: markdownToHtml(parsed.body) };
    bySlug.set(slug, source);
    byTitle.set(title.toLowerCase(), source);
  }
  return { bySlug, byTitle };
}

async function main() {
  loadEnv(path.join(ROOT, ".env"));
  loadEnv(path.join(ROOT, ".env.local"));
  const dryRun = process.argv.includes("--dry-run");
  const sources = readSources();
  const { getPool } = require("../netlify/functions/_lib/db");
  const { applyRuntimeSettings } = require("../netlify/functions/_lib/runtime-settings");
  const { ensureBlogTables } = require("../netlify/functions/_lib/blog-cms");
  const pool = getPool();
  try {
    await applyRuntimeSettings(pool, { force: true });
    await ensureBlogTables(pool);
    const [rows] = await pool.query(
      `SELECT pid_blog, blog_slug, blog_title FROM ${BLOG_POSTS_TABLE} ORDER BY created_at ASC, id ASC`
    );
    let restored = 0;
    let skipped = 0;
    for (const row of rows) {
      const slug = clean(row.blog_slug);
      const title = clean(row.blog_title);
      const source = sources.bySlug.get(slug) || sources.byTitle.get(title.toLowerCase());
      if (!source) {
        skipped += 1;
        console.log(`[skip] ${slug} | no markdown source`);
        continue;
      }
      restored += 1;
      const matchType = source.slug === slug ? "slug" : "title";
      console.log(`[restore:${matchType}] ${slug} <- ${source.file}`);
      if (!dryRun) {
        await pool.query(
          `UPDATE ${BLOG_POSTS_TABLE} SET blog_content = ?, updated_at = NOW() WHERE pid_blog = ?`,
          [source.html, row.pid_blog]
        );
      }
    }
    console.log(`blog_content_restore_${dryRun ? "dry_run" : "done"} restored=${restored} skipped=${skipped}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error("blog_content_restore_failed", error && error.stack ? error.stack : error);
  process.exit(1);
});
