const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireVerifierSession } = require("./_lib/admin-auth");
const {
  ensureBusinessPlanTables,
  listBusinessPlansForInternal,
  markPlanVerified,
  markVerifiedEmailSent,
} = require("./_lib/business-plans");
const { sendEmail } = require("./_lib/email");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function dashboardPlansUrl() {
  const base = String(process.env.SITE_BASE_URL || "https://tochukwunkwocha.com").trim().replace(/\/$/, "");
  return `${base}/dashboard/business-plans/`;
}

function buildVerifiedEmail(input) {
  const fullName = clean(input.fullName, 120) || "there";
  const dashboardUrl = clean(input.dashboardUrl, 1000);
  const businessName = clean(input.businessName, 220) || "your business";
  const html = [
    `<p>Hello ${fullName},</p>`,
    `<p>Your business plan for <strong>${businessName}</strong> has been reviewed and verified by our expert.</p>`,
    `<p>You can now download it from your dashboard: <a href="${dashboardUrl}">${dashboardUrl}</a></p>`,
  ].join("\n");
  const text = [
    `Hello ${fullName},`,
    "",
    `Your business plan for ${businessName} has been reviewed and verified by our expert.`,
    `You can now download it from your dashboard: ${dashboardUrl}`,
  ].join("\n");
  return { html, text };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  const auth = requireVerifierSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });
  const actorRole = String((auth.payload && auth.payload.role) || "verifier").toLowerCase();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const planUuid = clean(body.planUuid, 64);
  const verifierNotes = clean(body.verifierNotes, 4000);
  if (!planUuid) return json(400, { ok: false, error: "planUuid is required" });

  try {
    await ensureBusinessPlanTables(pool);
    await markPlanVerified(pool, {
      planUuid,
      verifiedBy: actorRole,
      verifierNotes,
    });

    const rows = await listBusinessPlansForInternal(pool, { status: "verified" });
    const plan = (rows || []).find((row) => String(row.plan_uuid || "") === planUuid);
    if (plan && plan.email) {
      const dashboardUrl = dashboardPlansUrl();
      const message = buildVerifiedEmail({
        fullName: plan.full_name,
        businessName: plan.business_name,
        dashboardUrl,
      });
      try {
        await sendEmail({
          to: clean(plan.email, 190),
          subject: "Your Business Plan Has Been Verified",
          html: message.html,
          text: message.text,
        });
        if (plan.id) {
          await markVerifiedEmailSent(pool, plan.id);
        }
      } catch (emailError) {
        console.error("admin-business-plans-verify email send failed:", emailError && emailError.message ? emailError.message : emailError);
      }
    }

    return json(200, { ok: true, planUuid, verificationStatus: "verified" });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not verify business plan" });
  }
};
