const crypto = require("crypto");
const { nowSql } = require("./db");
const { uploadBufferToCloudinary, destroyCloudinaryAsset } = require("./cloudinary");
const {
  BLOG_IMAGE_FOLDER,
  getPost,
  savePost,
  getBlogImageUrl,
  normalizeBlogImagePublicId,
} = require("./blog-cms");
const { triggerBlogBuildHook } = require("./build-hooks");

const BLOG_IMAGE_JOBS_TABLE = "tochukwu_blog_image_jobs";

function clean(value, max) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max || 1000);
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (error) {
    const code = String(error && error.code || "");
    if (!["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME", "ER_CANT_DROP_FIELD_OR_KEY"].includes(code)) throw error;
  }
}

async function ensureBlogImageJobsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${BLOG_IMAGE_JOBS_TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      job_uuid VARCHAR(72) NOT NULL,
      pid_blog VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'queued',
      error_message TEXT NULL,
      prompt LONGTEXT NULL,
      image_public_id VARCHAR(500) NULL,
      image_url TEXT NULL,
      build_hook_json TEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      finished_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_blog_image_job_uuid (job_uuid),
      KEY idx_blog_image_job_pid_created (pid_blog, created_at),
      KEY idx_blog_image_job_status_created (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await safeAlter(pool, `ALTER TABLE ${BLOG_IMAGE_JOBS_TABLE} ADD COLUMN build_hook_json TEXT NULL`);
}

function mapJob(row) {
  if (!row) return null;
  return {
    jobUuid: row.job_uuid,
    pidBlog: row.pid_blog,
    status: row.status,
    errorMessage: row.error_message || "",
    prompt: row.prompt || "",
    imagePublicId: row.image_public_id || "",
    imageUrl: row.image_url || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}

async function createBlogImageJob(pool, pidBlog) {
  await ensureBlogImageJobsTable(pool);
  const jobUuid = `BIMG${crypto.randomBytes(12).toString("hex")}`;
  const now = nowSql();
  await pool.query(
    `INSERT INTO ${BLOG_IMAGE_JOBS_TABLE}
     (job_uuid, pid_blog, status, created_at, updated_at)
     VALUES (?, ?, 'queued', ?, ?)`,
    [jobUuid, clean(pidBlog, 64), now, now]
  );
  return getBlogImageJob(pool, jobUuid);
}

async function getBlogImageJob(pool, jobUuid) {
  await ensureBlogImageJobsTable(pool);
  const [rows] = await pool.query(
    `SELECT * FROM ${BLOG_IMAGE_JOBS_TABLE} WHERE job_uuid = ? LIMIT 1`,
    [clean(jobUuid, 72)]
  );
  return mapJob(rows[0]);
}

async function updateBlogImageJob(pool, jobUuid, fields) {
  await ensureBlogImageJobsTable(pool);
  const sets = ["updated_at = NOW()"];
  const params = [];
  const data = fields && typeof fields === "object" ? fields : {};
  if (Object.prototype.hasOwnProperty.call(data, "status")) {
    sets.push("status = ?");
    params.push(clean(data.status, 32));
  }
  if (Object.prototype.hasOwnProperty.call(data, "errorMessage")) {
    sets.push("error_message = ?");
    params.push(clean(data.errorMessage, 2000));
  }
  if (Object.prototype.hasOwnProperty.call(data, "prompt")) {
    sets.push("prompt = ?");
    params.push(String(data.prompt || ""));
  }
  if (Object.prototype.hasOwnProperty.call(data, "imagePublicId")) {
    sets.push("image_public_id = ?");
    params.push(clean(data.imagePublicId, 500));
  }
  if (Object.prototype.hasOwnProperty.call(data, "imageUrl")) {
    sets.push("image_url = ?");
    params.push(clean(data.imageUrl, 1000));
  }
  if (Object.prototype.hasOwnProperty.call(data, "buildHook")) {
    sets.push("build_hook_json = ?");
    params.push(JSON.stringify(data.buildHook || {}));
  }
  if (data.finished) {
    sets.push("finished_at = NOW()");
  }
  params.push(clean(jobUuid, 72));
  await pool.query(`UPDATE ${BLOG_IMAGE_JOBS_TABLE} SET ${sets.join(", ")} WHERE job_uuid = ?`, params);
  return getBlogImageJob(pool, jobUuid);
}

function openAiImageModel() {
  return clean(process.env.OPENAI_IMAGE_MODEL, 120) || "gpt-image-1";
}

function openAiImageSize() {
  return clean(process.env.OPENAI_IMAGE_SIZE, 40) || "1536x1024";
}

function openAiImageQuality() {
  return clean(process.env.OPENAI_IMAGE_QUALITY, 40) || "high";
}

function openAiTimeoutMs() {
  const raw = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS || process.env.LEADPAGE_AI_TIMEOUT_MS || 240000);
  if (!Number.isFinite(raw) || raw < 10000) return 240000;
  return Math.min(raw, 600000);
}

function getOpenAiApiKey() {
  const apiKey = clean(process.env.OPENAI_API_KEY, 500);
  if (!apiKey) {
    const error = new Error("Missing OPENAI_API_KEY. Add a valid OpenAI API key to local .env or the admin settings.");
    error.statusCode = 500;
    throw error;
  }
  if (/^bearer\s+/i.test(apiKey) || !apiKey.startsWith("sk-")) {
    const error = new Error("OPENAI_API_KEY is not a valid OpenAI API key. It should start with sk-.");
    error.statusCode = 500;
    throw error;
  }
  return apiKey;
}

function shouldDeleteOldImage(value) {
  const raw = clean(value, 500);
  if (!raw) return false;
  if (/^https?:\/\/res\.cloudinary\.com\//i.test(raw)) return true;
  if (raw.startsWith(`${BLOG_IMAGE_FOLDER}/`)) return true;
  return raw.startsWith("BLOG_");
}

function buildPrompt(post) {
  const title = clean(post.blogTitle, 220);
  const excerpt = clean(post.excerpt, 500);
  const tags = Array.isArray(post.tags) ? post.tags.map((tag) => clean(tag, 60)).filter(Boolean).slice(0, 8).join(", ") : "";
  const content = clean(stripHtml(post.blogContent), 1000);

  return [
    "Create a modern, pristine editorial hero image for a blog post.",
    "The image must be fully aligned with the article theme and suitable for a premium AI education/business website.",
    "",
    `Blog title: ${title}`,
    excerpt ? `Excerpt: ${excerpt}` : "",
    tags ? `Tags: ${tags}` : "",
    content ? `Article context: ${content}` : "",
    "",
    "Style requirements:",
    "- 16:9 landscape composition.",
    "- landscape hero image, strong central subject, clear depth, balanced negative space, safe when cropped to 16:10.",
    "- premium editorial visual, modern, crisp, clean, polished, high-end, professional blog feature image.",
    "- abstract, symbolic, product, workspace, technology, or object-led composition only.",
    "- every image should feel conceptually specific to this article, with a fresh focal object, camera angle, background, depth, and accent palette.",
    "- use tasteful technology, learning, workflow, dashboard, classroom, business, productivity, strategy, data, or digital-building metaphors when relevant.",
    "- layered depth, balanced negative space, soft cinematic lighting, precise details, refined color palette.",
    "- if papers, labels, screens, dashboards, charts, boards, or interfaces appear, they must contain only blank lines, abstract marks, simple grids, check marks, or blurred non-readable shapes.",
    "- no visible text, no letters, no numbers, no UI copy, no fake gibberish, no logos, no watermarks.",
    "- no human beings, no faces, no portraits, no silhouettes, no hands, no arms, no body parts, no crowds, no reflections of people.",
    "- avoid stock-photo realism with people; use elegant symbolic scenes, devices, diagrams, interfaces, architecture, objects, or abstract forms.",
  ].filter(Boolean).join("\n");
}

async function generateOpenAiImage(prompt) {
  const apiKey = getOpenAiApiKey();
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, openAiTimeoutMs());

  let res;
  try {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: openAiImageModel(),
        prompt,
        size: openAiImageSize(),
        quality: openAiImageQuality(),
        n: 1,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError") throw new Error(`OpenAI image request timed out after ${openAiTimeoutMs()}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((payload && payload.error && payload.error.message) || `OpenAI image request failed (${res.status})`);
  }

  const first = payload && payload.data && payload.data[0] ? payload.data[0] : null;
  if (first && first.b64_json) return Buffer.from(first.b64_json, "base64");
  if (first && first.url) {
    const imageRes = await fetch(first.url);
    if (!imageRes.ok) throw new Error(`Could not download generated image (${imageRes.status})`);
    return Buffer.from(await imageRes.arrayBuffer());
  }
  throw new Error("OpenAI image response was empty.");
}

async function processBlogImageJob(pool, jobUuid) {
  const job = await getBlogImageJob(pool, jobUuid);
  if (!job) {
    const error = new Error("Image generation job not found.");
    error.statusCode = 404;
    throw error;
  }
  if (job.status === "succeeded") return job;
  if (job.status === "running") return job;

  await updateBlogImageJob(pool, jobUuid, { status: "running", errorMessage: "" });
  try {
    const post = await getPost(pool, { pidBlog: job.pidBlog });
    if (!post) throw new Error("Blog post not found.");

    const prompt = buildPrompt(post);
    await updateBlogImageJob(pool, jobUuid, { prompt });
    const imageBuffer = await generateOpenAiImage(prompt);
    const publicId = `BLOG_${crypto.randomBytes(10).toString("hex")}`;
    const uploaded = await uploadBufferToCloudinary(imageBuffer, {
      folder: BLOG_IMAGE_FOLDER,
      publicId,
      filename: `${publicId}.png`,
      contentType: "image/png",
      useFilename: false,
      uniqueFilename: false,
      overwrite: true,
    });

    const saved = await savePost(pool, {
      pidBlog: post.pidBlog,
      blogTitle: post.blogTitle,
      blogSlug: post.blogSlug,
      blogContent: post.blogContent,
      blogPublished: post.blogPublished,
      blogFeatured: post.blogFeatured,
      blogBy: post.blogBy,
      blogExt1: post.blogExt1,
      blogExt2: post.blogExt2,
      excerpt: post.excerpt,
      tags: post.tags,
      seo: post.seo,
      createdAt: post.createdAt,
      blogImage: uploaded.publicId,
    });

    if (post.blogImage && shouldDeleteOldImage(post.blogImage) && normalizeBlogImagePublicId(post.blogImage) !== uploaded.publicId) {
      destroyCloudinaryAsset(normalizeBlogImagePublicId(post.blogImage)).catch((error) => {
        console.error("blog_generated_old_image_delete_failed", error && error.message ? error.message : error);
      });
    }

    let buildHook = { triggered: false };
    try {
      buildHook = await triggerBlogBuildHook();
    } catch (error) {
      console.error("blog_generated_image_build_hook_failed", error && error.message ? error.message : error);
      buildHook = { triggered: false, error: error.message || "Build hook failed" };
    }

    return updateBlogImageJob(pool, jobUuid, {
      status: "succeeded",
      imagePublicId: saved.blogImage,
      imageUrl: getBlogImageUrl(saved.blogImage),
      buildHook,
      finished: true,
    });
  } catch (error) {
    await updateBlogImageJob(pool, jobUuid, {
      status: "failed",
      errorMessage: error.message || "Could not generate blog image.",
      finished: true,
    });
    throw error;
  }
}

module.exports = {
  ensureBlogImageJobsTable,
  createBlogImageJob,
  getBlogImageJob,
  processBlogImageJob,
};
