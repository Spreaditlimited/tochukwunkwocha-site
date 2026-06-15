const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(ROOT, "assets");
const OUTPUT_DIR = path.join(ASSETS_DIR, "optimized");

const IMAGE_JOBS = [
  {
    source: "tochukwu.jpg",
    output: "tochukwu-portrait.webp",
    width: 900,
    options: { quality: 78 },
  },
  {
    source: "Prompt to Profit_bkgrd.png",
    output: "prompt-to-profit-logo.webp",
    width: 700,
    options: { quality: 82, lossless: false },
  },
  {
    source: "revers_logo.png",
    output: "revers-logo.webp",
    width: 700,
    options: { quality: 82, lossless: false },
  },
];

const REWRITES = [
  ["/assets/tochukwu.jpg", "/assets/optimized/tochukwu-portrait.webp"],
  ["/assets/Prompt to Profit_bkgrd.png", "/assets/optimized/prompt-to-profit-logo.webp"],
  ["/assets/revers_logo.png", "/assets/optimized/revers-logo.webp"],
];

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

async function buildImage(job) {
  const input = path.join(ASSETS_DIR, job.source);
  const output = path.join(OUTPUT_DIR, job.output);

  await sharp(input)
    .resize({ width: job.width, withoutEnlargement: true })
    .webp(job.options)
    .toFile(output);
}

function rewriteHtmlImages() {
  for (const file of htmlFiles()) {
    let html = fs.readFileSync(file, "utf8");
    const original = html;

    for (const [from, to] of REWRITES) {
      html = html.split(from).join(to);
    }

    if (html !== original) {
      fs.writeFileSync(file, html);
    }
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const job of IMAGE_JOBS) {
    await buildImage(job);
  }

  rewriteHtmlImages();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
