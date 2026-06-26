#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SITE_URL = String(process.env.SITE_URL || "https://tochukwunkwocha.com").replace(/\/+$/, "");

const EXCLUDED_PREFIXES = [
  "assets/",
  "dashboard/",
  "internal/",
  "node_modules/",
  "projects/",
  "schools/dashboard/",
  "schools/login/",
  "schools/reset-password/",
  "schools/reset-password-request/",
];

const REDIRECTED_PREFIXES = [
  "courses/prompt-to-profit-children/",
  "courses/prompt-to-profit-for-job-seekers/",
  "courses/prompt-to-profit-holiday/",
  "blog/nigerian-parents-guide-to-ai-skills-for-children/",
];

function escapeXml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isExcluded(relativePath) {
  return EXCLUDED_PREFIXES.some((prefix) => relativePath.startsWith(prefix)) ||
    REDIRECTED_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function canonicalForFile(relativePath) {
  if (relativePath === "index.html") return `${SITE_URL}/`;
  return `${SITE_URL}/${relativePath.replace(/index\.html$/, "")}`;
}

function extractCanonical(html) {
  const match = String(html || "").match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i) ||
    String(html || "").match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
  return match ? match[1].replace(/\/?$/, (value) => value === "/" ? "/" : "/") : "";
}

function hasNoindex(html) {
  return /<meta\s+[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(String(html || ""));
}

function dateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function collectHtmlFiles(dir, out) {
  for (const item of fs.readdirSync(dir)) {
    if (item === ".git" || item === "node_modules") continue;
    const abs = path.join(dir, item);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      collectHtmlFiles(abs, out);
      continue;
    }
    if (item === "index.html") out.push(abs);
  }
}

function pagePriority(relativePath) {
  if (relativePath === "index.html") return "1.0";
  if (relativePath === "courses/index.html") return "0.95";
  if (relativePath.startsWith("courses/")) return "0.90";
  if (relativePath === "blog/index.html") return "0.90";
  if (relativePath.startsWith("services/") || relativePath === "build/index.html") return "0.85";
  if (relativePath.startsWith("enrol-")) return "0.70";
  if (relativePath === "contact/index.html") return "0.65";
  return "0.55";
}

function pageChangefreq(relativePath) {
  if (relativePath === "privacy-policy/index.html" || relativePath === "terms-and-conditions/index.html") return "yearly";
  if (relativePath.startsWith("blog/")) return "weekly";
  return "monthly";
}

function buildPageSitemap() {
  const files = [];
  collectHtmlFiles(ROOT, files);
  const seen = new Set();
  const urls = [];
  for (const abs of files) {
    const relativePath = path.relative(ROOT, abs).replace(/\\/g, "/");
    if (isExcluded(relativePath)) continue;
    if (relativePath.startsWith("blog/") && relativePath !== "blog/index.html") continue;
    const html = fs.readFileSync(abs, "utf8");
    if (hasNoindex(html)) continue;
    const canonical = extractCanonical(html) || canonicalForFile(relativePath);
    if (!canonical.startsWith(`${SITE_URL}/`)) continue;
    const expected = canonicalForFile(relativePath);
    if (canonical !== expected) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    urls.push({
      loc: canonical,
      lastmod: dateOnly(fs.statSync(abs).mtime),
      changefreq: pageChangefreq(relativePath),
      priority: pagePriority(relativePath),
    });
  }
  urls.sort((a, b) => a.loc.localeCompare(b.loc));
  const homeIndex = urls.findIndex((item) => item.loc === `${SITE_URL}/`);
  if (homeIndex > 0) urls.unshift(urls.splice(homeIndex, 1)[0]);
  return urls;
}

function writeUrlSet(filePath, urls) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((url) => [
      "  <url>",
      `    <loc>${escapeXml(url.loc)}</loc>`,
      url.lastmod ? `    <lastmod>${escapeXml(url.lastmod)}</lastmod>` : "",
      url.changefreq ? `    <changefreq>${escapeXml(url.changefreq)}</changefreq>` : "",
      url.priority ? `    <priority>${escapeXml(url.priority)}</priority>` : "",
      "  </url>",
    ].filter(Boolean).join("\n")).join("\n") +
    `\n</urlset>\n`;
  fs.writeFileSync(filePath, xml, "utf8");
}

function writeSitemapIndex(filePath) {
  const today = dateOnly(new Date());
  const entries = [
    `${SITE_URL}/sitemap-pages.xml`,
    `${SITE_URL}/blog/sitemap.xml`,
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries.map((loc) => [
      "  <sitemap>",
      `    <loc>${escapeXml(loc)}</loc>`,
      `    <lastmod>${escapeXml(today)}</lastmod>`,
      "  </sitemap>",
    ].join("\n")).join("\n") +
    `\n</sitemapindex>\n`;
  fs.writeFileSync(filePath, xml, "utf8");
}

function main() {
  const pageUrls = buildPageSitemap();
  writeUrlSet(path.join(ROOT, "sitemap-pages.xml"), pageUrls);
  writeSitemapIndex(path.join(ROOT, "sitemap.xml"));
  console.log(`Built sitemap index with ${pageUrls.length} page URL(s).`);
}

main();
