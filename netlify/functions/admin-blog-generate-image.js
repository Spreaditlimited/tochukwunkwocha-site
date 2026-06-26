const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { uploadBufferToCloudinary, destroyCloudinaryAsset } = require("./_lib/cloudinary");
const {
  BLOG_IMAGE_FOLDER,
  getPost,
  savePost,
  getBlogImageUrl,
  normalizeBlogImagePublicId,
} = require("./_lib/blog-cms");
const { triggerBlogBuildHook } = require("./_lib/build-hooks");

function clean(value, max) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max || 1000);
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function openAiImageModel() {
  return clean(process.env.OPENAI_IMAGE_MODEL, 120) || "gpt-image-2";
}

function openAiTimeoutMs() {
  const raw = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS || process.env.LEADPAGE_AI_TIMEOUT_MS || 120000);
  if (!Number.isFinite(raw) || raw < 10000) return 120000;
  return Math.min(raw, 240000);
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
    "- premium editorial visual, modern, crisp, clean, polished, high-end.",
    "- abstract or object-led composition only.",
    "- use tasteful technology, learning, workflow, dashboard, classroom, business, productivity, strategy, data, or digital-building metaphors when relevant.",
    "- layered depth, balanced negative space, soft cinematic lighting, precise details, refined color palette.",
    "- no visible text, no letters, no numbers, no UI copy, no logos, no watermarks.",
    "- no human beings, no faces, no portraits, no silhouettes, no hands, no body parts, no crowds.",
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
        size: "1536x1024",
        quality: "high",
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
  if (first && first.b64_json) {
    return Buffer.from(first.b64_json, "base64");
  }
  if (first && first.url) {
    const imageRes = await fetch(first.url);
    if (!imageRes.ok) throw new Error(`Could not download generated image (${imageRes.status})`);
    return Buffer.from(await imageRes.arrayBuffer());
  }
  throw new Error("OpenAI image response was empty.");
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const pidBlog = clean(body.pidBlog, 80);
  if (!pidBlog) return json(400, { ok: false, error: "Blog ID is required. Save the post before generating an image." });

  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool); } catch (_error) {}
    const post = await getPost(pool, { pidBlog });
    if (!post) return json(404, { ok: false, error: "Blog post not found." });

    const prompt = buildPrompt(post);
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

    return json(200, {
      ok: true,
      data: Object.assign({}, saved, { imageUrl: getBlogImageUrl(saved.blogImage) }),
      prompt,
      buildHook,
    });
  } catch (error) {
    return json(error.statusCode || 500, { ok: false, error: error.message || "Could not generate blog image." });
  }
};
