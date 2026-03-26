const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureBusinessPlanTables, listGeneratedPlansByEmail } = require("./_lib/business-plans");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureBusinessPlanTables(pool);

    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const items = await listGeneratedPlansByEmail(pool, session.account.email);

    return json(200, {
      ok: true,
      account: {
        fullName: session.account.fullName,
        email: session.account.email,
      },
      items: (items || []).map((row) => ({
        planUuid: row.plan_uuid,
        orderUuid: row.order_uuid,
        businessName: row.business_name,
        purpose: row.purpose,
        currency: row.currency,
        planText: String(row.verification_status || "").toLowerCase() === "verified" ? row.plan_text : "",
        verificationStatus: row.verification_status || "awaiting_verification",
        verifiedAt: row.verified_at,
        canDownload: String(row.verification_status || "").toLowerCase() === "verified",
        generatedAt: row.generated_at || row.created_at,
      })),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load business plans" });
  }
};
