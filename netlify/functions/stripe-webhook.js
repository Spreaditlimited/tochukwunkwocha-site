const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { verifyStripeSignature } = require("./_lib/payments");
const { markOrderPaidBy } = require("./_lib/orders");
const { ensureSchoolTables, markSchoolOrderPaidBy } = require("./_lib/schools");
const { ensureStudentAuthTables, findStudentByEmail } = require("./_lib/student-auth");
const { creditFamilySeats, provisionFamilyOrder } = require("./_lib/families");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const pool = getPool();
  try { await applyRuntimeSettings(pool); } catch (_error) {}

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";
  const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"] || "";

  try {
    if (!verifyStripeSignature(rawBody, signature)) {
      return json(401, { ok: false, error: "Invalid Stripe signature" });
    }
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Stripe signature check failed" });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  if (String(body.type || "") !== "checkout.session.completed") {
    return json(200, { ok: true, ignored: true });
  }

  const session = body.data && body.data.object ? body.data.object : {};
  if (String(session.payment_status || "").toLowerCase() !== "paid") {
    return json(200, { ok: true, ignored: true });
  }
  const metadata = session.metadata || {};
  if (metadata.school_order_uuid || String(metadata.payment_scope || "").toLowerCase() === "school_registration") {
    await ensureSchoolTables(pool);
    const schoolResult = await markSchoolOrderPaidBy(pool, {
      provider: "stripe",
      providerReference: session.id ? String(session.id) : null,
      providerOrderId: session.payment_intent ? String(session.payment_intent) : null,
      orderUuid: metadata.school_order_uuid ? String(metadata.school_order_uuid) : null,
    });
    if (!schoolResult.ok) {
      console.warn("stripe_webhook_school_order_mark_failed", {
        sessionId: session.id || null,
        orderUuid: metadata.school_order_uuid || null,
        error: schoolResult.error || "unknown_error",
      });
      return json(404, { ok: false, error: schoolResult.error });
    }
    return json(200, { ok: true });
  }

  const result = await markOrderPaidBy({
    pool,
    provider: "stripe",
    providerReference: session.id ? String(session.id) : null,
    providerOrderId: session.payment_intent ? String(session.payment_intent) : null,
    orderUuid: metadata.order_uuid ? String(metadata.order_uuid) : null,
  });

  if (!result.ok) {
    console.warn("stripe_webhook_order_mark_failed", {
      sessionId: session.id || null,
      orderUuid: metadata.order_uuid || null,
      error: result.error || "unknown_error",
    });
    return json(404, { ok: false, error: result.error });
  }

  if (String(result.buyerType || "").toLowerCase() === "family") {
    await ensureStudentAuthTables(pool);
    const account = await findStudentByEmail(pool, result.email);
    if (account && account.id) {
      await creditFamilySeats(pool, {
        sourceType: "course_order",
        sourceUuid: result.orderUuid,
        parentAccountId: Number(account.id),
        parentName: result.fullName,
        parentEmail: result.email,
        parentPhone: result.phone || "",
        courseSlug: result.courseSlug,
        batchKey: result.batchKey || "",
        batchLabel: result.batchLabel || "",
        quantity: Number(result.seatCount || 1),
      }).catch(() => null);
      await provisionFamilyOrder(pool, {
        sourceType: "course_order",
        sourceUuid: result.orderUuid,
        parentAccountId: Number(account.id),
        parentName: result.fullName,
        parentEmail: result.email,
        parentPhone: result.phone || "",
      }).catch(() => null);
    }
  }

  return json(200, { ok: true });
};
