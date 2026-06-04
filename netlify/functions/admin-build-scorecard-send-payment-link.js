const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { paystackInitialize, siteBaseUrl } = require("./_lib/payments");
const { buildDiscoveryPricing } = require("./_lib/build-discovery-pricing");
const { sendEmail } = require("./_lib/email");
const { ensureSchoolCallTablesTochukwu, SCHOOL_CALL_BOOKINGS_TABLE } = require("./_lib/school-calls-tochukwu");
const {
  ensureBuildScorecardTablesTochukwu,
  findBuildScorecardLeadByUuid,
  approveBuildDiscoveryPayment,
  markBuildDiscoveryPaymentLinkSent,
  createBuildDiscoveryPayment,
  findLatestBuildDiscoveryPaymentByLead,
} = require("./_lib/build-scorecards-tochukwu");

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max || 400);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstName(fullName) {
  return clean(fullName, 180).split(/\s+/).filter(Boolean)[0] || "there";
}

function formatNaira(minor) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(minor || 0) / 100);
}

async function hasLinkedBuildCall(pool, leadUuid, workEmail) {
  const [rows] = await pool.query(
    `SELECT id
       FROM ${SCHOOL_CALL_BOOKINGS_TABLE}
      WHERE lead_source_type = 'build'
        AND (source_lead_uuid = ? OR work_email = ?)
      LIMIT 1`,
    [leadUuid, clean(workEmail, 220).toLowerCase()]
  );
  return Boolean(rows && rows.length);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (_error) { return json(400, { ok: false, error: "Invalid JSON body" }); }
  const leadUuid = clean(body.leadUuid, 64);
  if (!leadUuid) return json(400, { ok: false, error: "leadUuid is required" });

  const pool = getPool();
  try {
    try { await applyRuntimeSettings(pool); } catch (_error) {}
    await ensureBuildScorecardTablesTochukwu(pool);
    await ensureSchoolCallTablesTochukwu(pool);

    const lead = await findBuildScorecardLeadByUuid(pool, leadUuid);
    if (!lead) return json(404, { ok: false, error: "Build scorecard lead not found" });
    if (clean(lead.bandKey, 40) !== "manual_review" && !lead.followUpRequired) {
      return json(400, { ok: false, error: "Payment-link approval is only available for manual-review submissions" });
    }
    if (await hasLinkedBuildCall(pool, leadUuid, lead.workEmail)) {
      return json(409, { ok: false, error: "This lead already has a linked call" });
    }

    const actor = clean(auth.payload && (auth.payload.email || auth.payload.fullName || auth.payload.role), 180) || "admin";
    await approveBuildDiscoveryPayment(pool, { leadUuid, approvedBy: actor });

    const pricing = buildDiscoveryPricing();
    let payment = await findLatestBuildDiscoveryPaymentByLead(pool, leadUuid);
    if (payment && payment.paymentStatus === "paid") {
      return json(409, { ok: false, error: "Discovery payment has already been completed" });
    }

    let checkoutUrl = clean(payment && payment.checkoutUrl, 1200);
    let reference = clean(payment && payment.paymentReference, 120);
    if (!checkoutUrl) {
      reference = `BLD_${leadUuid.replace(/[^a-z0-9]/gi, "").slice(0, 34).toUpperCase()}_${Date.now().toString().slice(-6)}`;
      const callbackUrl = `${siteBaseUrl()}/.netlify/functions/build-discovery-paystack-return`;
      const initialized = await paystackInitialize({
        email: clean(lead.workEmail, 220).toLowerCase(),
        amountMinor: Number(pricing.payableMinor || 0),
        reference,
        callbackUrl,
        metadata: {
          build_lead_uuid: leadUuid,
          lead_source_type: "build",
          manual_review_approved: true,
          full_name: clean(lead.fullName, 180),
          business_name: clean(lead.businessName, 220),
        },
      });
      checkoutUrl = clean(initialized.checkoutUrl, 1200);
      reference = clean(initialized.providerReference || reference, 120);
      await createBuildDiscoveryPayment(pool, {
        paymentUuid: `buildpay_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
        leadUuid,
        workEmail: clean(lead.workEmail, 220).toLowerCase(),
        fullName: clean(lead.fullName, 180),
        amountMinor: Number(pricing.payableMinor || 0),
        paymentReference: reference,
        checkoutUrl,
      });
      payment = await findLatestBuildDiscoveryPaymentByLead(pool, leadUuid);
    }

    if (!checkoutUrl) throw new Error("Paystack did not return a checkout URL");

    const amountText = formatNaira(pricing.payableMinor);
    const safeName = escapeHtml(firstName(lead.fullName));
    const safeUrl = escapeHtml(checkoutUrl);
    const subject = "Complete Your Build Discovery Call Payment";
    const html = [
      `<p>Hello ${safeName},</p>`,
      "<p>Your Build application has been reviewed and approved to proceed to a paid discovery call.</p>",
      `<p>The total payable amount is <strong>${escapeHtml(amountText)}</strong>.</p>`,
      `<p><a href="${safeUrl}">Pay for your discovery call</a></p>`,
      "<p>After successful payment, you will be redirected to select an available call slot.</p>",
      "<p>Regards,<br/>Tochukwu Nkwocha</p>",
    ].join("");
    const text = [
      `Hello ${firstName(lead.fullName)},`,
      "",
      "Your Build application has been reviewed and approved to proceed to a paid discovery call.",
      `Total payable: ${amountText}`,
      `Pay here: ${checkoutUrl}`,
      "",
      "After successful payment, you will be redirected to select an available call slot.",
    ].join("\n");

    await sendEmail({ to: clean(lead.workEmail, 220), subject, html, text });
    await markBuildDiscoveryPaymentLinkSent(pool, leadUuid);

    return json(200, {
      ok: true,
      leadUuid,
      checkoutUrl,
      reference,
      paymentStatus: clean(payment && payment.paymentStatus, 40) || "initiated",
      message: "Discovery payment link sent.",
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not send discovery payment link" });
  }
};
