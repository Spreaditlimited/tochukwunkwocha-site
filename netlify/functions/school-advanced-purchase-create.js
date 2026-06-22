const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { paystackInitialize, stripeCreateCheckoutSession, siteBaseUrl } = require("./_lib/payments");
const {
  SCHOOL_ORDERS_TABLE,
  ensureSchoolTables,
  requireSchoolAdminSession,
  createSchoolOrder,
  isNigeriaCountry,
  schoolsAdvancedStripePricingForPool,
} = require("./_lib/schools");

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

async function resolveSchoolCountry(pool, schoolId) {
  const id = Number(schoolId || 0);
  if (!(id > 0)) return "Nigeria";
  const [rows] = await pool.query(
    `SELECT country
     FROM ${SCHOOL_ORDERS_TABLE}
     WHERE school_id = ?
       AND country IS NOT NULL
       AND country <> ''
     ORDER BY paid_at DESC, id DESC
     LIMIT 1`,
    [id]
  );
  const country = String(rows && rows[0] && rows[0].country || "").trim();
  return country || "Nigeria";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    const session = await requireSchoolAdminSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const seatsRequested = Number(body && body.seatCount || 0);
    const country = await resolveSchoolCountry(pool, session.admin.schoolId);
    const provider = isNigeriaCountry(country) ? "paystack" : "stripe";
    const pricing = provider === "stripe"
      ? await schoolsAdvancedStripePricingForPool(pool, seatsRequested, country)
      : null;
    const order = await createSchoolOrder(pool, {
      schoolId: session.admin.schoolId,
      schoolName: session.admin.schoolName,
      adminName: session.admin.fullName,
      adminEmail: session.admin.email,
      adminPhone: "",
      country,
      seatsRequested,
      courseSlug: session.admin.courseSlug,
      seatCourseSlug: "prompt-to-production",
      orderKind: "advanced_seat_purchase",
      provider,
      pricing,
    });

    console.info("school_advanced_purchase_initiated", {
      school_id: Number(session.admin.schoolId),
      admin_id: Number(session.admin.id),
      order_uuid: order.orderUuid,
      provider,
      country,
      seats_requested: Number(order && order.pricing && order.pricing.seats || 0),
    });

    const reference = `SCHADV_${order.orderUuid.replace(/[^a-z0-9]/gi, "").slice(0, 22).toUpperCase()}`;
    const metadata = {
        school_order_uuid: order.orderUuid,
        school_id: Number(session.admin.schoolId),
        order_kind: "advanced_seat_purchase",
        seat_course_slug: "prompt-to-production",
        seat_count: Number(order.pricing.seats || 0),
    };
    const payment = provider === "stripe"
      ? await stripeCreateCheckoutSession({
          email: String(session.admin.email || "").trim().toLowerCase(),
          amountMinor: Number(order.pricing.totalMinor || 0),
          currency: order.pricing.currency,
          courseName: "Prompt to Profit Advanced School Seats",
          orderUuid: order.orderUuid,
          metadata,
          successUrl: `${siteBaseUrl()}/.netlify/functions/school-advanced-stripe-return?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${siteBaseUrl()}/schools/dashboard/?advanced_payment=cancelled`,
        })
      : await paystackInitialize({
          email: String(session.admin.email || "").trim().toLowerCase(),
          amountMinor: Number(order.pricing.totalMinor || 0),
          reference,
          callbackUrl: `${siteBaseUrl()}/.netlify/functions/school-advanced-paystack-return`,
          metadata,
        });

    await pool.query(
      `UPDATE school_orders
       SET provider_reference = ?,
           provider_order_id = ?,
           updated_at = NOW()
       WHERE order_uuid = ?
       LIMIT 1`,
      [payment.providerReference || reference, payment.providerOrderId || null, order.orderUuid]
    );

    return json(200, {
      ok: true,
      orderUuid: order.orderUuid,
      provider,
      checkoutUrl: payment.checkoutUrl,
      pricing: order.pricing,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not create advanced seat payment." });
  }
};
