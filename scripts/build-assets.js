const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(ROOT, "assets");
const BUNDLES_DIR = path.join(ASSETS_DIR, "bundles");
const GENERATED_DIR = path.join(ROOT, ".generated");
const INLINE_CSS_FILE = path.join(ASSETS_DIR, "tailwind-inline.css");
const SOURCE_CSS_FILE = path.join(ASSETS_DIR, "styles.source.css");
const OUTPUT_CSS_FILE = path.join(ASSETS_DIR, "styles.css");
const TAILWIND_INPUT_FILE = path.join(GENERATED_DIR, "tailwind.input.css");
const BUNDLE_MANIFEST_FILE = path.join(BUNDLES_DIR, "manifest.json");

const args = new Set(process.argv.slice(2));

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".generated") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function htmlFiles() {
  return walk(ROOT).filter((file) => file.endsWith(".html"));
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function captureInlineTailwind(files) {
  const blocks = [];
  const blockRe = /<style\b[^>]*type=["']text\/tailwindcss["'][^>]*>([\s\S]*?)<\/style>/gi;

  for (const file of files) {
    const html = fs.readFileSync(file, "utf8");
    let match;
    while ((match = blockRe.exec(html))) {
      blocks.push(`/* ${relative(file)} */\n${match[1].trim()}\n`);
    }
  }

  if (blocks.length > 0 || !fs.existsSync(INLINE_CSS_FILE)) {
    fs.writeFileSync(INLINE_CSS_FILE, `${blocks.join("\n")}\n`);
  }
}

function normalizeAssetScriptSrc(src) {
  if (!src.startsWith("/assets/") || !src.endsWith(".js")) return null;
  if (src.startsWith("/assets/bundles/")) return null;
  return src.slice(1);
}

function parseScriptTag(tag) {
  const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
  if (!srcMatch) return null;
  const cleanSrc = srcMatch[1].split("?")[0];
  const source = normalizeAssetScriptSrc(cleanSrc);
  if (!source) return null;
  return {
    source,
    defer: /\bdefer\b/i.test(tag),
  };
}

function makeBundleName(sources) {
  const hash = crypto.createHash("sha256").update(sources.join("\n")).digest("hex").slice(0, 12);
  return `bundle-${hash}.min.js`;
}

function readManifest() {
  if (!fs.existsSync(BUNDLE_MANIFEST_FILE)) return {};
  return JSON.parse(fs.readFileSync(BUNDLE_MANIFEST_FILE, "utf8"));
}

async function buildBundle(name, sources) {
  const banner = sources.map((source) => `/* ${source} */`).join("\n");
  const input = sources.map((source) => fs.readFileSync(path.join(ROOT, source), "utf8")).join("\n;\n");
  const result = await esbuild.transform(`${banner}\n${input}`, {
    loader: "js",
    minify: true,
    target: "es2018",
    legalComments: "none",
  });
  fs.mkdirSync(BUNDLES_DIR, { recursive: true });
  fs.writeFileSync(path.join(BUNDLES_DIR, name), result.code);
}

function collectScriptGroups(html) {
  const scriptRe = /<script\b[^>]*\bsrc=["'][^"']+["'][^>]*><\/script>/gi;
  const matches = [...html.matchAll(scriptRe)];
  const groups = [];
  let group = null;

  for (const match of matches) {
    const tag = match[0];
    const script = parseScriptTag(tag);
    if (!script) {
      if (group) {
        groups.push(group);
        group = null;
      }
      continue;
    }

    if (!group) {
      group = { start: match.index, end: match.index + tag.length, scripts: [script] };
      continue;
    }

    const between = html.slice(group.end, match.index);
    if (/^\s*$/.test(between)) {
      group.end = match.index + tag.length;
      group.scripts.push(script);
    } else {
      groups.push(group);
      group = { start: match.index, end: match.index + tag.length, scripts: [script] };
    }
  }

  if (group) groups.push(group);
  return groups;
}

function rewriteHtml(files) {
  const manifest = readManifest();

  for (const file of files) {
    let html = fs.readFileSync(file, "utf8");
    let changed = false;
    const hadTailwindCdn = /cdn\.tailwindcss\.com/.test(html);

    html = html.replace(/\s*<script\b[^>]*src=["']https:\/\/cdn\.tailwindcss\.com["'][^>]*><\/script>\s*/gi, "\n");
    html = html.replace(/\s*<script\b[^>]*>\s*tailwind\.config\s*=\s*[\s\S]*?<\/script>\s*/gi, "\n");
    html = html.replace(/\s*<style\b[^>]*type=["']text\/tailwindcss["'][^>]*>[\s\S]*?<\/style>\s*/gi, "\n");

    if (hadTailwindCdn && !/href=["']\/assets\/styles\.css(?:\?[^"']*)?["']/.test(html)) {
      html = html.replace(/<\/head>/i, '    <link rel="stylesheet" href="/assets/styles.css" />\n  </head>');
    }

    if (html !== fs.readFileSync(file, "utf8")) changed = true;

    const groups = collectScriptGroups(html);
    if (groups.length > 0) {
      let rewritten = "";
      let cursor = 0;

      for (const group of groups) {
        const sources = group.scripts.map((script) => script.source);
        const bundleName = makeBundleName(sources);
        const useDefer = group.scripts.some((script) => script.defer);
        const scriptTag = `<script src="/assets/bundles/${bundleName}"${useDefer ? " defer" : ""}></script>`;
        manifest[bundleName] = sources;
        rewritten += html.slice(cursor, group.start);
        rewritten += scriptTag;
        cursor = group.end;
      }

      rewritten += html.slice(cursor);
      html = rewritten;
      changed = true;
    }

    if (changed) fs.writeFileSync(file, html);
  }

  fs.mkdirSync(BUNDLES_DIR, { recursive: true });
  fs.writeFileSync(BUNDLE_MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function buildBundles(manifest) {
  for (const [name, sources] of Object.entries(manifest)) {
    await buildBundle(name, sources);
  }
}

function buildCss() {
  const sourceCss = fs.readFileSync(SOURCE_CSS_FILE, "utf8");
  const inlineCss = fs.existsSync(INLINE_CSS_FILE) ? fs.readFileSync(INLINE_CSS_FILE, "utf8") : "";

  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(
    TAILWIND_INPUT_FILE,
    `@tailwind base;\n@tailwind components;\n\n${sourceCss}\n\n${inlineCss}\n\n@tailwind utilities;\n`
  );

  execFileSync(
    path.join(ROOT, "node_modules", ".bin", "tailwindcss"),
    ["-c", path.join(ROOT, "tailwind.config.js"), "-i", TAILWIND_INPUT_FILE, "-o", OUTPUT_CSS_FILE, "--minify"],
    { cwd: ROOT, stdio: "inherit" }
  );
}

async function main() {
  const files = htmlFiles();

  if (args.has("--capture-inline")) {
    captureInlineTailwind(files);
    return;
  }

  let manifest = readManifest();
  if (args.has("--rewrite-html")) {
    captureInlineTailwind(files);
    manifest = rewriteHtml(files);
  }

  buildCss();
  await buildBundles(manifest);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
