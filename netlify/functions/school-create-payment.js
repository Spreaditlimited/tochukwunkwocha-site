const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { paystackInitialize, siteBaseUrl } = require("./_lib/payments");
const { ensureSchoolTables, createSchoolOrder } = require("./_lib/schools");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { ensureLearningTables, findLearningCourseBySlug } = require("./_lib/learning");
const { ensureAffiliateTables, captureSchoolOrderReferral } = require("./_lib/affiliates");

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}
    await ensureLearningTables(pool);
    await ensureAffiliateTables(pool);
    const courseSlug = String(body.courseSlug || "prompt-to-profit").trim().toLowerCase() || "prompt-to-profit";
    const learningCourse = await findLearningCourseBySlug(pool, courseSlug);
    if (!learningCourse) {
      return json(400, { ok: false, error: "Unknown course. Please choose a valid course." });
    }
    await ensureSchoolTables(pool);
    const order = await createSchoolOrder(pool, {
      schoolName: body.schoolName,
      adminName: body.adminName,
      adminEmail: body.adminEmail,
      adminPhone: body.adminPhone,
      seatsRequested: body.seatCount,
      courseSlug,
      provider: "paystack",
    });

    const affiliateCode = String(body.affiliateCode || body.affiliate_code || "").trim().toUpperCase().slice(0, 40);
    if (affiliateCode) {
      await captureSchoolOrderReferral(pool, {
        orderUuid: order.orderUuid,
        affiliateCode,
      }).catch(function () {
        return null;
      });
    }

    const reference = `SCH_${order.orderUuid.replace(/[^a-z0-9]/gi, "").slice(0, 26).toUpperCase()}`;
    const payment = await paystackInitialize({
      email: String(body.adminEmail || "").trim().toLowerCase(),
      amountMinor: Number(order.pricing.totalMinor || 0),
      reference,
      callbackUrl: `${siteBaseUrl()}/.netlify/functions/school-paystack-return`,
      metadata: {
        school_order_uuid: order.orderUuid,
        school_name: String(body.schoolName || "").trim(),
        admin_email: String(body.adminEmail || "").trim().toLowerCase(),
        course_slug: courseSlug,
        seat_count: Number(order.pricing.seats || 0),
      },
    });

    await pool.query(
      `UPDATE school_orders
       SET provider_reference = ?, updated_at = NOW()
       WHERE order_uuid = ?
       LIMIT 1`,
      [payment.providerReference || reference, order.orderUuid]
    );

    return json(200, {
      ok: true,
      orderUuid: order.orderUuid,
      checkoutUrl: payment.checkoutUrl,
      pricing: order.pricing,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not create school payment." });
  }
};
