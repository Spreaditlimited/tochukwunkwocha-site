const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireVerifierSession } = require("./_lib/admin-auth");
const { ensureBusinessPlanTables, listBusinessPlansForInternal } = require("./_lib/business-plans");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const pool = getPool();
  try {
    await applyRuntimeSettings(pool);
  } catch (_error) {}

  const auth = requireVerifierSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });
  const role = String((auth.payload && auth.payload.role) || "verifier").toLowerCase();

  const qs = event.queryStringParameters || {};
  const requestedStatus = clean(qs.status, 40);
  let status = requestedStatus;
  if (role === "verifier") {
    // Verifier defaults to all generated plans (awaiting + verified),
    // but can still request a specific status.
    if (!status || status === "all") status = "";
  }

  try {
    await ensureBusinessPlanTables(pool);
    const rows = await listBusinessPlansForInternal(pool, { status });
    const items = (rows || []).map((row) => ({
      planUuid: row.plan_uuid,
      orderUuid: row.order_uuid,
      paymentReference: role === "admin" ? row.payment_reference : null,
      amountMinor: Number(row.payment_amount_minor || 0),
      paymentCurrency: clean(row.payment_currency, 16) || "NGN",
      fullName: row.full_name,
      email: row.email,
      businessName: row.business_name,
      purpose: row.purpose,
      currency: row.currency,
      verificationStatus: row.verification_status || "awaiting_verification",
      verifiedAt: row.verified_at,
      verifiedBy: row.verified_by,
      verifierNotes: row.verifier_notes || "",
      planText: String(row.plan_text || ""),
      paidAt: row.paid_at,
      generatedAt: row.generated_at || row.created_at,
    }));

    return json(200, { ok: true, role, items });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load business plans" });
  }
};
