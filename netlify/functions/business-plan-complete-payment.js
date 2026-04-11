const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { paystackVerifyTransaction } = require("./_lib/payments");
const {
  ensureBusinessPlanTables,
  findOrderByReference,
  markOrderPaid,
} = require("./_lib/business-plans");
const {
  ensureStudentAuthTables,
  findStudentByEmail,
  createStudentAccount,
  createStudentSession,
  setStudentCookieHeader,
} = require("./_lib/user-auth");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function dashboardPlansUrl() {
  const base = String(process.env.SITE_BASE_URL || "https://tochukwunkwocha.com").trim().replace(/\/$/, "");
  return `${base}/dashboard/business-plans/`;
}

function randomPassword() {
  return crypto.randomBytes(6).toString("base64url") + "A9!";
}

function selfBaseUrl(event) {
  const headers = event && event.headers ? event.headers : {};
  const host = String(headers.host || headers.Host || "").trim();
  const proto = String(headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "").trim() || "https";
  if (host) return `${proto}://${host}`;
  return String(process.env.SITE_BASE_URL || "https://tochukwunkwocha.com").trim().replace(/\/$/, "");
}

async function queueGeneration(event, reference) {
  const res = await fetch(`${selfBaseUrl(event)}/.netlify/functions/business-plan-generate-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference: clean(reference, 120) }),
  });
  if (!res.ok && res.status !== 202) {
    const data = await res.json().catch(function () {
      return null;
    });
    throw new Error((data && data.error) || "Could not queue generation");
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const reference = clean(body.reference, 120);
  if (!reference) return json(400, { ok: false, error: "reference is required" });

  const pool = getPool();

  try {
    await ensureBusinessPlanTables(pool);
    await ensureStudentAuthTables(pool);

    const tx = await paystackVerifyTransaction(reference);
    if (String(tx.status || "").toLowerCase() !== "success") {
      return json(400, { ok: false, error: "Payment not successful." });
    }

    const order = await findOrderByReference(pool, reference);
    if (!order) return json(404, { ok: false, error: "Payment order not found." });

    if (String(order.plan_status || "").toLowerCase() === "generated" && String(order.plan_text || "").trim()) {
      const payload = {
        ok: true,
        alreadyGenerated: true,
        planUuid: clean(order.plan_uuid, 64),
        planText: String(order.verification_status || "").toLowerCase() === "verified" ? String(order.plan_text || "") : "",
        verificationStatus: clean(order.verification_status, 30) || "awaiting_verification",
        canDownload: String(order.verification_status || "").toLowerCase() === "verified",
        dashboardUrl: dashboardPlansUrl(),
      };

      return json(200, payload);
    }

    await markOrderPaid(pool, {
      id: order.id,
      paymentReference: reference,
      providerOrderId: tx.id ? String(tx.id) : null,
      paymentCurrency: clean(tx.currency, 16) || "NGN",
      paymentAmountMinor: Number(tx.amount || 0),
    });

    let account = await findStudentByEmail(pool, order.email);
    let tempPassword = "";
    let accountCreated = false;
    if (!account) {
      tempPassword = randomPassword();
      account = await createStudentAccount(pool, {
        fullName: clean(order.full_name, 180),
        email: clean(order.email, 190),
        password: tempPassword,
        mustResetPassword: true,
      });
      accountCreated = true;
    }

    await queueGeneration(event, reference);

    const dashboardUrl = dashboardPlansUrl();

    const payload = {
      ok: true,
      planUuid: clean(order.plan_uuid, 64) || null,
      planText: "",
      verificationStatus: "awaiting_verification",
      canDownload: false,
      generationQueued: true,
      accountCreated,
      tempPassword: accountCreated ? tempPassword : null,
      dashboardUrl,
    };

    if (accountCreated && account && account.id) {
      const sessionToken = await createStudentSession(pool, account.id, {
        event,
        enforceDeviceLimit: false,
      });
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": setStudentCookieHeader(event, sessionToken),
          "Cache-Control": "no-store",
        },
        body: JSON.stringify(payload),
      };
    }

    return json(200, payload);
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not complete payment." });
  }
};
