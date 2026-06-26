const crypto = require("crypto");
const { nowSql } = require("./db");

const BLOG_POSTS_TABLE = "tochukwu_blog_posts";
const BLOG_IMAGE_FOLDER = "tochukwu/blog";

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 1000);
}

function slugify(input) {
  return clean(input, 240)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(String(value || ""));
  } catch (_error) {
    return fallback;
  }
}

function safeJsonStringify(value, fallback) {
  try {
    return JSON.stringify(value == null ? fallback : value);
  } catch (_error) {
    return JSON.stringify(fallback);
  }
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function excerptFrom(content, fallback) {
  const explicit = clean(fallback, 320);
  if (explicit) return explicit;
  return stripHtml(content).slice(0, 220);
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((tag) => clean(tag, 60)).filter(Boolean).slice(0, 12);
  return String(value || "")
    .split(",")
    .map((tag) => clean(tag, 60))
    .filter(Boolean)
    .slice(0, 12);
}

function mapRow(row) {
  if (!row) return null;
  const seo = safeJsonParse(row.seo_json, {});
  const tags = safeJsonParse(row.tags_json, []);
  return {
    id: row.id,
    pidBlog: row.pid_blog,
    blogTitle: row.blog_title,
    blogContent: row.blog_content,
    blogSlug: row.blog_slug,
    blogPublished: Boolean(row.blog_published),
    blogFeatured: Boolean(row.blog_featured),
    blogImage: row.blog_image || "",
    blogBy: row.blog_by || "",
    blogExt1: row.blog_ext1 || "",
    blogExt2: row.blog_ext2 || "",
    excerpt: row.excerpt || "",
    tags: Array.isArray(tags) ? tags : [],
    seo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (error) {
    const code = String(error && error.code || "");
    if (!["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME", "ER_CANT_DROP_FIELD_OR_KEY"].includes(code)) throw error;
  }
}

async function ensureBlogTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${BLOG_POSTS_TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      pid_blog VARCHAR(64) NOT NULL,
      blog_title VARCHAR(255) NOT NULL,
      blog_content LONGTEXT NULL,
      blog_slug VARCHAR(255) NOT NULL,
      blog_published TINYINT(1) NOT NULL DEFAULT 0,
      blog_featured TINYINT(1) NOT NULL DEFAULT 0,
      blog_image VARCHAR(500) NULL,
      blog_by VARCHAR(120) NULL,
      blog_ext1 VARCHAR(700) NULL,
      blog_ext2 LONGTEXT NULL,
      excerpt TEXT NULL,
      tags_json TEXT NULL,
      seo_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_blog_pid (pid_blog),
      UNIQUE KEY uniq_tochukwu_blog_slug (blog_slug),
      KEY idx_tochukwu_blog_status_created (blog_published, created_at),
      KEY idx_tochukwu_blog_featured (blog_featured, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await safeAlter(pool, `ALTER TABLE ${BLOG_POSTS_TABLE} ADD COLUMN blog_featured TINYINT(1) NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE ${BLOG_POSTS_TABLE} ADD COLUMN excerpt TEXT NULL`);
  await safeAlter(pool, `ALTER TABLE ${BLOG_POSTS_TABLE} ADD COLUMN tags_json TEXT NULL`);
  await safeAlter(pool, `ALTER TABLE ${BLOG_POSTS_TABLE} ADD COLUMN seo_json LONGTEXT NULL`);
}

async function makeUniqueSlug(pool, title, currentPidBlog) {
  const base = slugify(title) || `blog-${Date.now()}`;
  let slug = base;
  let index = 2;
  while (true) {
    const params = currentPidBlog ? [slug, currentPidBlog] : [slug];
    const sql = currentPidBlog
      ? `SELECT pid_blog FROM ${BLOG_POSTS_TABLE} WHERE blog_slug = ? AND pid_blog <> ? LIMIT 1`
      : `SELECT pid_blog FROM ${BLOG_POSTS_TABLE} WHERE blog_slug = ? LIMIT 1`;
    const [rows] = await pool.query(sql, params);
    if (!rows.length) return slug;
    slug = `${base}-${index}`;
    index += 1;
  }
}

async function listPosts(pool, options) {
  await ensureBlogTables(pool);
  const opts = options && typeof options === "object" ? options : {};
  const page = Math.max(1, Number(opts.page || 1));
  const limit = Math.min(100, Math.max(1, Number(opts.limit || 20)));
  const offset = (page - 1) * limit;
  const where = [];
  const params = [];
  const status = clean(opts.status, 40).toLowerCase();
  if (status === "published") where.push("blog_published = 1 AND created_at <= NOW()");
  if (status === "draft") where.push("blog_published = 0");
  if (status === "scheduled") where.push("blog_published = 1 AND created_at > NOW()");
  const search = clean(opts.search, 160);
  if (search) {
    where.push("(blog_title LIKE ? OR blog_slug LIKE ? OR blog_content LIKE ? OR blog_by LIKE ?)");
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM ${BLOG_POSTS_TABLE} ${whereSql}`, params);
  const orderSql = status === "scheduled"
    ? "ORDER BY created_at ASC, id ASC"
    : "ORDER BY created_at DESC, id DESC";
  const [rows] = await pool.query(
    `SELECT * FROM ${BLOG_POSTS_TABLE} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    params.concat([limit, offset])
  );
  const [[stats]] = await pool.query(`
    SELECT
      COUNT(*) AS totalArticles,
      SUM(CASE WHEN blog_published = 1 AND created_at <= NOW() THEN 1 ELSE 0 END) AS publishedArticles,
      SUM(CASE WHEN blog_published = 1 AND created_at > NOW() THEN 1 ELSE 0 END) AS scheduledArticles,
      SUM(CASE WHEN blog_published = 0 THEN 1 ELSE 0 END) AS draftArticles
    FROM ${BLOG_POSTS_TABLE}
  `);
  return {
    posts: rows.map(mapRow),
    pagination: { total: Number(countRow.total || 0), page, limit, totalPages: Math.ceil(Number(countRow.total || 0) / limit) },
    stats,
  };
}

async function getPost(pool, options) {
  await ensureBlogTables(pool);
  const pidBlog = clean(options && options.pidBlog, 80);
  const slug = clean(options && options.slug, 255);
  if (!pidBlog && !slug) return null;
  const [rows] = await pool.query(
    `SELECT * FROM ${BLOG_POSTS_TABLE} WHERE ${pidBlog ? "pid_blog = ?" : "blog_slug = ?"} LIMIT 1`,
    [pidBlog || slug]
  );
  return mapRow(rows[0]);
}

async function savePost(pool, input) {
  await ensureBlogTables(pool);
  const data = input && typeof input === "object" ? input : {};
  const pidBlog = clean(data.pidBlog, 80) || `BLOG${Date.now()}`;
  const blogTitle = clean(data.blogTitle, 255);
  const blogContent = String(data.blogContent || "").trim();
  if (!blogTitle || !blogContent) {
    const error = new Error("Blog title and content are required.");
    error.statusCode = 400;
    throw error;
  }

  const existing = await getPost(pool, { pidBlog });
  const slug = data.blogSlug ? slugify(data.blogSlug) : await makeUniqueSlug(pool, blogTitle, existing && existing.pidBlog);
  const published = data.blogPublished === true || String(data.blogPublished) === "true" || String(data.blogPublished) === "1";
  const featured = data.blogFeatured === true || String(data.blogFeatured) === "true" || String(data.blogFeatured) === "1";
  const image = clean(data.blogImage, 500) || (existing && existing.blogImage) || "";
  const createdAt = clean(data.createdAt, 40) || (existing && existing.createdAt) || nowSql();
  const values = {
    pidBlog,
    blogTitle,
    blogContent,
    blogSlug: slug,
    blogPublished: published ? 1 : 0,
    blogFeatured: featured ? 1 : 0,
    blogImage: image,
    blogBy: clean(data.blogBy, 120) || "Tochukwu Nkwocha",
    blogExt1: clean(data.blogExt1, 700),
    blogExt2: String(data.blogExt2 || ""),
    excerpt: excerptFrom(blogContent, data.excerpt),
    tagsJson: safeJsonStringify(normalizeTags(data.tags), []),
    seoJson: safeJsonStringify(data.seo && typeof data.seo === "object" ? data.seo : safeJsonParse(data.blogExt2, {}), {}),
    createdAt,
  };

  if (existing) {
    await pool.query(
      `UPDATE ${BLOG_POSTS_TABLE}
       SET blog_title = ?, blog_content = ?, blog_slug = ?, blog_published = ?, blog_featured = ?,
           blog_image = ?, blog_by = ?, blog_ext1 = ?, blog_ext2 = ?, excerpt = ?, tags_json = ?, seo_json = ?,
           created_at = ?, updated_at = NOW()
       WHERE pid_blog = ?`,
      [values.blogTitle, values.blogContent, values.blogSlug, values.blogPublished, values.blogFeatured, values.blogImage, values.blogBy, values.blogExt1, values.blogExt2, values.excerpt, values.tagsJson, values.seoJson, values.createdAt, pidBlog]
    );
  } else {
    await pool.query(
      `INSERT INTO ${BLOG_POSTS_TABLE}
       (pid_blog, blog_title, blog_content, blog_slug, blog_published, blog_featured, blog_image, blog_by, blog_ext1, blog_ext2, excerpt, tags_json, seo_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [pidBlog, values.blogTitle, values.blogContent, values.blogSlug, values.blogPublished, values.blogFeatured, values.blogImage, values.blogBy, values.blogExt1, values.blogExt2, values.excerpt, values.tagsJson, values.seoJson, values.createdAt]
    );
  }
  return getPost(pool, { pidBlog });
}

async function deletePost(pool, pidBlog) {
  await ensureBlogTables(pool);
  const post = await getPost(pool, { pidBlog });
  if (!post) return null;
  await pool.query(`DELETE FROM ${BLOG_POSTS_TABLE} WHERE pid_blog = ?`, [pidBlog]);
  return post;
}

function getCloudinaryBaseUrl() {
  const explicit = clean(process.env.CLOUDINARY_BASE_URL || process.env.NEXT_PUBLIC_CLOUDINARY_BASE_URL, 500);
  if (explicit) return explicit.replace(/\/+$/, "");
  const cloudName = clean(process.env.CLOUDINARY_CLOUD_NAME, 120);
  return cloudName ? `https://res.cloudinary.com/${cloudName}/image/upload` : "";
}

function getBlogImageUrl(publicId) {
  const value = clean(publicId, 500);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return value;
  const base = getCloudinaryBaseUrl();
  return base ? `${base}/${value}` : value;
}

function normalizeBlogImagePublicId(value) {
  const raw = clean(value, 500);
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) {
    if (raw.startsWith(`${BLOG_IMAGE_FOLDER}/`)) return raw;
    if (raw.startsWith("BLOG_")) return `${BLOG_IMAGE_FOLDER}/${raw}`;
    return raw;
  }
  const marker = "/image/upload/";
  const idx = raw.indexOf(marker);
  if (idx < 0) return raw;
  return raw.slice(idx + marker.length).replace(/^v\d+\//, "").replace(/\.[a-z0-9]+$/i, "");
}

module.exports = {
  BLOG_IMAGE_FOLDER,
  ensureBlogTables,
  listPosts,
  getPost,
  savePost,
  deletePost,
  getBlogImageUrl,
  normalizeBlogImagePublicId,
};
