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
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function clean(value) {
  return String(value || "").trim();
}

function parseFrontmatter(raw) {
  const text = String(raw || "");
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) return {};
  const data = {};
  for (const line of text.slice(4, end).split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = clean(line.slice(0, idx));
    let value = clean(line.slice(idx + 1));
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return data;
}

function slugify(input) {
  return clean(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function dateOnly(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }
  const raw = clean(value);
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : raw.slice(0, 10);
}

function readMarkdownDates() {
  const map = new Map();
  if (!fs.existsSync(CONTENT_DIR)) return map;
  for (const file of fs.readdirSync(CONTENT_DIR).filter((item) => item.endsWith(".md"))) {
    const data = parseFrontmatter(fs.readFileSync(path.join(CONTENT_DIR, file), "utf8"));
    const title = clean(data.title) || file.replace(/\.md$/, "");
    const slug = clean(data.slug) || slugify(title);
    const date = clean(data.date).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && slug) map.set(slug, date);
  }
  return map;
}

async function main() {
  loadEnv(path.join(ROOT, ".env"));
  loadEnv(path.join(ROOT, ".env.local"));
  const dryRun = process.argv.includes("--dry-run");
  const markdownDates = readMarkdownDates();
  const { getPool } = require("../netlify/functions/_lib/db");
  const { applyRuntimeSettings } = require("../netlify/functions/_lib/runtime-settings");
  const { ensureBlogTables } = require("../netlify/functions/_lib/blog-cms");
  const pool = getPool();
  try {
    await applyRuntimeSettings(pool, { force: true });
    await ensureBlogTables(pool);
    const [rows] = await pool.query(
      `SELECT pid_blog, blog_slug, blog_title, blog_published, created_at
       FROM ${BLOG_POSTS_TABLE}
       WHERE blog_published = 1
       ORDER BY created_at ASC, id ASC`
    );
    let matched = 0;
    let changed = 0;
    let skipped = 0;
    for (const row of rows) {
      const slug = clean(row.blog_slug);
      const expected = markdownDates.get(slug);
      if (!expected) {
        skipped += 1;
        console.log(`[skip] ${slug} has no matching markdown date`);
        continue;
      }
      matched += 1;
      const current = dateOnly(row.created_at);
      if (current === expected) {
        console.log(`[ok] ${slug} ${current}`);
        continue;
      }
      changed += 1;
      console.log(`[fix] ${slug} ${current || "none"} -> ${expected}`);
      if (!dryRun) {
        await pool.query(
          `UPDATE ${BLOG_POSTS_TABLE}
           SET created_at = CONCAT(?, ' 00:00:00'), updated_at = NOW()
           WHERE pid_blog = ?`,
          [expected, row.pid_blog]
        );
      }
    }
    console.log(`blog_date_fix_${dryRun ? "dry_run" : "done"} matched=${matched} changed=${changed} skipped=${skipped}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error("blog_date_fix_failed", error && error.stack ? error.stack : error);
  process.exit(1);
});
