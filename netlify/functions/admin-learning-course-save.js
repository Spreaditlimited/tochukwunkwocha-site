const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureLearningTables, upsertLearningCourse } = require("./_lib/learning");
const { ensureCourseBatchesTable, listCourseBatches, createCourseBatch, activateCourseBatch } = require("./_lib/batch-store");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function prefixFromSlug(slug) {
  const pieces = String(slug || "").trim().toUpperCase().split("-").filter(Boolean);
  if (!pieces.length) return "CRS";
  const compact = pieces.map(function (part) { return part.charAt(0); }).join("").replace(/[^A-Z0-9]/g, "");
  return (compact || "CRS").slice(0, 10);
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

  const id = Number(body.id || 0);
  const slug = clean(body.course_slug, 120).toLowerCase();
  const title = clean(body.course_title, 220);
  const description = clean(body.course_description, 4000);
  const isPublished = body.is_published === true || Number(body.is_published) === 1;
  const isEnrollmentLocked = body.is_enrollment_locked === true || Number(body.is_enrollment_locked) === 1;
  const releaseAt = clean(body.release_at, 64);
  const enrollmentMode = clean(body.enrollment_mode, 24).toLowerCase() === "immediate" ? "immediate" : "batch";
  const priceNgnMinorRaw = Number(body.price_ngn_minor);
  const priceGbpMinorRaw = Number(body.price_gbp_minor);
  const priceUsdMinorRaw = Number(body.price_usd_minor);
  const priceEurMinorRaw = Number(body.price_eur_minor);
  const schoolAdvancedDiscountNgnMinorRaw = Number(body.school_advanced_discount_ngn_minor);
  const schoolAdvancedDiscountGbpMinorRaw = Number(body.school_advanced_discount_gbp_minor);
  const schoolAdvancedDiscountUsdMinorRaw = Number(body.school_advanced_discount_usd_minor);
  const schoolAdvancedDiscountEurMinorRaw = Number(body.school_advanced_discount_eur_minor);
  const paymentMethods = Array.isArray(body.payment_methods) ? body.payment_methods : String(body.payment_methods || "");
  const priceNgnMinor = Number.isFinite(priceNgnMinorRaw) && priceNgnMinorRaw > 0 ? Math.round(priceNgnMinorRaw) : null;
  const priceGbpMinor = Number.isFinite(priceGbpMinorRaw) && priceGbpMinorRaw > 0 ? Math.round(priceGbpMinorRaw) : null;
  const priceUsdMinor = Number.isFinite(priceUsdMinorRaw) && priceUsdMinorRaw > 0 ? Math.round(priceUsdMinorRaw) : null;
  const priceEurMinor = Number.isFinite(priceEurMinorRaw) && priceEurMinorRaw > 0 ? Math.round(priceEurMinorRaw) : null;
  const schoolAdvancedDiscountNgnMinor = Number.isFinite(schoolAdvancedDiscountNgnMinorRaw) && schoolAdvancedDiscountNgnMinorRaw >= 0 ? Math.round(schoolAdvancedDiscountNgnMinorRaw) : null;
  const schoolAdvancedDiscountGbpMinor = Number.isFinite(schoolAdvancedDiscountGbpMinorRaw) && schoolAdvancedDiscountGbpMinorRaw >= 0 ? Math.round(schoolAdvancedDiscountGbpMinorRaw) : null;
  const schoolAdvancedDiscountUsdMinor = Number.isFinite(schoolAdvancedDiscountUsdMinorRaw) && schoolAdvancedDiscountUsdMinorRaw >= 0 ? Math.round(schoolAdvancedDiscountUsdMinorRaw) : null;
  const schoolAdvancedDiscountEurMinor = Number.isFinite(schoolAdvancedDiscountEurMinorRaw) && schoolAdvancedDiscountEurMinorRaw >= 0 ? Math.round(schoolAdvancedDiscountEurMinorRaw) : null;

  if (!slug) return json(400, { ok: false, error: "course_slug is required" });
  if (!title) return json(400, { ok: false, error: "course_title is required" });

  const pool = getPool();
  try {
    await ensureLearningTables(pool);
    const course = await upsertLearningCourse(pool, {
      id: Number.isFinite(id) && id > 0 ? id : null,
      course_slug: slug,
      course_title: title,
      course_description: description,
      enrollment_mode: enrollmentMode,
      price_ngn_minor: priceNgnMinor,
      price_gbp_minor: priceGbpMinor,
      price_usd_minor: priceUsdMinor,
      price_eur_minor: priceEurMinor,
      school_advanced_discount_ngn_minor: schoolAdvancedDiscountNgnMinor,
      school_advanced_discount_gbp_minor: schoolAdvancedDiscountGbpMinor,
      school_advanced_discount_usd_minor: schoolAdvancedDiscountUsdMinor,
      school_advanced_discount_eur_minor: schoolAdvancedDiscountEurMinor,
      payment_methods: paymentMethods,
      is_enrollment_locked: isEnrollmentLocked,
      is_published: isPublished,
      release_at: releaseAt || null,
    });
    if (enrollmentMode === "batch") {
      await ensureCourseBatchesTable(pool);
      const courseSlug = clean(course && course.course_slug, 120).toLowerCase();
      const batches = await listCourseBatches(pool, courseSlug);
      if (!Array.isArray(batches) || batches.length === 0) {
        const created = await createCourseBatch(pool, {
          courseSlug,
          batchLabel: "Batch 1",
          batchKey: "batch-1",
          status: "open",
          paystackReferencePrefix: prefixFromSlug(courseSlug),
          paystackAmountMinor: priceNgnMinor,
          paypalAmountMinor: priceGbpMinor,
        });
        if (created && created.batch_key) {
          await activateCourseBatch(pool, {
            courseSlug,
            batchKey: created.batch_key,
            batchStartAt: created.batch_start_at || null,
          });
        }
      } else {
        const hasActive = batches.some(function (row) {
          return Number(row && row.is_active || 0) === 1;
        });
        if (!hasActive) {
          const first = batches[0];
          if (first && first.batch_key) {
            await activateCourseBatch(pool, {
              courseSlug,
              batchKey: String(first.batch_key || ""),
              batchStartAt: first.batch_start_at || null,
            });
          }
        }
      }
    }
    return json(200, { ok: true, course: course || null });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not save course." });
  }
};
