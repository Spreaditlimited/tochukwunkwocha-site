const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { siteBaseUrl, paystackInitialize, paystackPublicKey } = require("./_lib/payments");
const {
  ensureBusinessPlanTables,
  insertBusinessPlanOrder,
  setOrderPaymentInitiated,
  findLatestPaidOrderForSamePlan,
} = require("./_lib/business-plans");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function priceMinor() {
  const raw = Number(process.env.BUSINESS_PLAN_PRICE_NGN_MINOR || 20000);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 20000;
}

function buildReference(orderUuid) {
  const compact = clean(orderUuid, 72).replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
  const nonce = crypto.randomBytes(3).toString("hex");
  return `BPL_${compact}_${nonce}`.slice(0, 80);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const fullName = clean(body.fullName, 180);
  const email = clean(body.email, 190).toLowerCase();
  const purpose = clean(body.purpose, 40) || "loan";
  const currency = clean(body.currency, 16) || "NGN";
  const exchangeRate = Number(body.exchangeRate || 0);
  const intake = body.intake && typeof body.intake === "object" ? body.intake : null;

  if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { ok: false, error: "Full name and valid email are required." });
  }
  if (!intake || !clean(intake.businessName, 220) || !clean(intake.productLine, 220)) {
    return json(400, { ok: false, error: "Business name and project/product line are required." });
  }

  const pool = getPool();
  try {
    await ensureBusinessPlanTables(pool);

    const existingPaid = await findLatestPaidOrderForSamePlan(pool, {
      email,
      businessName: clean(intake.businessName, 220),
      purpose,
    });
    if (existingPaid && existingPaid.payment_reference) {
      return json(200, {
        ok: true,
        skipCheckout: true,
        alreadyPaid: true,
        reference: String(existingPaid.payment_reference),
        dashboardUrl: `${siteBaseUrl()}/dashboard/business-plans/`,
        message: "Payment already exists for this plan. Resuming generation.",
      });
    }

    const amountMinor = priceMinor();
    const order = await insertBusinessPlanOrder(pool, {
      fullName,
      email,
      businessName: clean(intake.businessName, 220),
      purpose,
      currency,
      exchangeRate,
      intake,
      paymentAmountMinor: amountMinor,
    });

    const reference = buildReference(order.orderUuid);
    const payment = await paystackInitialize({
      email,
      amountMinor,
      reference,
      callbackUrl: `${siteBaseUrl()}/services/business-plan/?payment=verify`,
      metadata: {
        flow: "business_plan",
        order_uuid: order.orderUuid,
        business_name: clean(intake.businessName, 120),
      },
    });

    await setOrderPaymentInitiated(pool, {
      orderUuid: order.orderUuid,
      paymentReference: payment.providerReference || reference,
    });

    return json(200, {
      ok: true,
      orderUuid: order.orderUuid,
      amountMinor,
      currency: "NGN",
      publicKey: paystackPublicKey(),
      reference: payment.providerReference || reference,
      accessCode: payment.accessCode || null,
      email,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not initialize payment" });
  }
};
