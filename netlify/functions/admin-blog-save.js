const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { parseMultipartForm } = require("./_lib/multipart");
const { uploadBufferToCloudinary, destroyCloudinaryAsset } = require("./_lib/cloudinary");
const { BLOG_IMAGE_FOLDER, getPost, savePost, getBlogImageUrl, normalizeBlogImagePublicId } = require("./_lib/blog-cms");
const { getLeadMagnetDownloadUrl, getLeadMagnetForPost, saveLeadMagnetFile, saveLeadMagnetForPost } = require("./_lib/blog-lead-magnets");
const { triggerBlogBuildHook } = require("./_lib/build-hooks");

const ALLOWED_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const ALLOWED_PDF_EXT = new Set(["pdf"]);

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 1000);
}

function parseBody(event) {
  const headers = event && event.headers ? event.headers : {};
  const contentType = String(headers["content-type"] || headers["Content-Type"] || "");
  if (contentType.includes("multipart/form-data")) {
    const parsed = parseMultipartForm(event);
    return { fields: parsed.fields, files: parsed.files };
  }
  const body = JSON.parse(String(event.body || "{}"));
  return { fields: body, files: {} };
}

async function uploadImageIfPresent(file) {
  if (!file || !file.buffer || !file.buffer.length) return "";
  const ext = clean(file.filename.split(".").pop(), 12).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    const error = new Error(`Please select only valid images. ${ext || "unknown"} is not allowed.`);
    error.statusCode = 400;
    throw error;
  }
  if (file.buffer.length > 5 * 1024 * 1024) {
    const error = new Error("Blog image must be under 5MB.");
    error.statusCode = 400;
    throw error;
  }
  const publicId = `BLOG_${crypto.randomBytes(10).toString("hex")}`;
  const uploaded = await uploadBufferToCloudinary(file.buffer, {
    folder: BLOG_IMAGE_FOLDER,
    publicId,
    filename: file.filename,
    contentType: file.contentType,
    useFilename: false,
    uniqueFilename: false,
    overwrite: true,
  });
  return uploaded.publicId;
}

async function uploadPdfIfPresent(file) {
  if (!file || !file.buffer || !file.buffer.length) return null;
  const ext = clean(file.filename.split(".").pop(), 12).toLowerCase();
  if (!ALLOWED_PDF_EXT.has(ext)) {
    const error = new Error(`Please upload a PDF file. ${ext || "unknown"} is not allowed.`);
    error.statusCode = 400;
    throw error;
  }
  if (file.buffer.length > 8 * 1024 * 1024) {
    const error = new Error("Lead magnet PDF must be under 8MB.");
    error.statusCode = 400;
    throw error;
  }
  return {
    buffer: file.buffer,
    contentType: file.contentType || "application/pdf",
    filename: clean(file.filename, 255),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST" && event.httpMethod !== "PUT") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });
  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool); } catch (_error) {}
    const parsed = parseBody(event);
    const fields = parsed.fields || {};
    const files = parsed.files || {};
    const existing = fields.pidBlog ? await getPost(pool, { pidBlog: fields.pidBlog }) : null;
    const uploadedPublicId = await uploadImageIfPresent(files.file || files.image);
    const uploadedPdf = await uploadPdfIfPresent(files.leadMagnetFile || files.pdf || files.leadMagnetPdf);
    const saved = await savePost(pool, Object.assign({}, fields, {
      blogImage: uploadedPublicId || fields.blogImage || (existing && existing.blogImage) || "",
      tags: fields.tags,
      seo: fields.seo ? (typeof fields.seo === "string" ? JSON.parse(fields.seo) : fields.seo) : undefined,
    }));
    let leadMagnet = null;
    const hasLeadMagnetInput = Object.keys(fields).some((key) => String(key || "").indexOf("leadMagnet") === 0);
    if (hasLeadMagnetInput || uploadedPdf) {
      const existingMagnet = await getLeadMagnetForPost(pool, saved.pidBlog);
      leadMagnet = await saveLeadMagnetForPost(pool, {
        pidBlog: saved.pidBlog,
        enabled: fields.leadMagnetEnabled,
        slug: fields.leadMagnetSlug,
        title: fields.leadMagnetTitle,
        offerHeadline: fields.leadMagnetOfferHeadline,
        description: fields.leadMagnetDescription,
        buttonText: fields.leadMagnetButtonText,
        bullets: fields.leadMagnetBullets,
        pdfUrl: uploadedPdf ? "" : fields.leadMagnetPdfUrl,
        pdfPublicId: uploadedPdf ? "" : fields.leadMagnetPdfPublicId,
        pdfResourceType: uploadedPdf ? "database" : fields.leadMagnetPdfResourceType,
        pdfFilename: uploadedPdf ? uploadedPdf.filename : fields.leadMagnetPdfFilename,
        brevoListId: fields.leadMagnetBrevoListId,
        emailSubject: fields.leadMagnetEmailSubject,
        deliveryMessage: fields.leadMagnetDeliveryMessage,
      });
      if (uploadedPdf) {
        await saveLeadMagnetFile(pool, leadMagnet, uploadedPdf);
        leadMagnet = await saveLeadMagnetForPost(pool, {
          pidBlog: saved.pidBlog,
          enabled: fields.leadMagnetEnabled,
          slug: leadMagnet.slug,
          title: leadMagnet.title,
          offerHeadline: leadMagnet.offerHeadline,
          description: leadMagnet.description,
          buttonText: leadMagnet.buttonText,
          bullets: leadMagnet.bullets,
          pdfUrl: getLeadMagnetDownloadUrl(leadMagnet.slug),
          pdfPublicId: "",
          pdfResourceType: "database",
          pdfFilename: uploadedPdf.filename,
          brevoListId: leadMagnet.brevoListId,
          emailSubject: leadMagnet.emailSubject,
          deliveryMessage: leadMagnet.deliveryMessage,
        });
      }
      if (uploadedPdf && existingMagnet && existingMagnet.pdfPublicId && existingMagnet.pdfResourceType !== "database") {
        destroyCloudinaryAsset(existingMagnet.pdfPublicId, { resourceType: existingMagnet.pdfResourceType || "image" }).catch((error) => {
          console.error("blog_old_lead_magnet_pdf_delete_failed", error && error.message ? error.message : error);
        });
      }
    }
    if (uploadedPublicId && existing && existing.blogImage && normalizeBlogImagePublicId(existing.blogImage) !== uploadedPublicId) {
      destroyCloudinaryAsset(normalizeBlogImagePublicId(existing.blogImage)).catch((error) => {
        console.error("blog_old_image_delete_failed", error && error.message ? error.message : error);
      });
    }
    let buildHook = { triggered: false };
    try {
      buildHook = await triggerBlogBuildHook();
    } catch (error) {
      console.error("blog_build_hook_failed", error && error.message ? error.message : error);
      buildHook = { triggered: false, error: error.message || "Build hook failed" };
    }
    if (!leadMagnet) leadMagnet = await getLeadMagnetForPost(pool, saved.pidBlog).catch(() => null);
    return json(200, { ok: true, data: Object.assign({}, saved, { imageUrl: getBlogImageUrl(saved.blogImage), leadMagnet }), buildHook });
  } catch (error) {
    return json(error.statusCode || 500, { ok: false, error: error.message || "Could not save blog post." });
  }
};
