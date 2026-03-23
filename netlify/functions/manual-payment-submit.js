const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureManualPaymentsTable,
  createManualPayment,
  markPreSynced,
} = require("./_lib/manual-payments");
const { syncFlodeskPreEnrolSubscriber } = require("./_lib/flodesk");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return ok ? email : "";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const firstName = String(body.firstName || "").trim().slice(0, 160);
  const email = normalizeEmail(body.email);
  const country = String(body.country || "").trim().slice(0, 120);
  const courseSlug = String(body.courseSlug || "prompt-to-profit").trim().slice(0, 120) || "prompt-to-profit";
  const transferReference = String(body.transferReference || "").trim().slice(0, 190);
  const proofUrl = String(body.proofUrl || "").trim();
  const proofPublicId = String(body.proofPublicId || "").trim().slice(0, 255);
  const currency = "NGN";

  if (!firstName || !email) {
    return json(400, { ok: false, error: "Full Name and valid email are required" });
  }

  if (!proofUrl || !/^https:\/\//i.test(proofUrl)) {
    return json(400, { ok: false, error: "Valid payment proof is required" });
  }

  const pool = getPool();

  try {
    await ensureManualPaymentsTable(pool);
    await ensureCourseBatchesTable(pool);
    const batch = await resolveCourseBatch(pool, { courseSlug, batchKey: body.batchKey });
    if (!batch) return json(500, { ok: false, error: "No active batch configured" });
    const amountMinor = Number(batch.paystack_amount_minor || process.env.PROMPT_TO_PROFIT_PRICE_NGN_MINOR || 1075000);

    const paymentUuid = await createManualPayment(pool, {
      courseSlug,
      batchKey: batch.batch_key,
      batchLabel: batch.batch_label,
      firstName,
      email,
      country,
      currency,
      amountMinor,
      transferReference,
      proofUrl,
      proofPublicId,
    });

    const synced = await syncFlodeskPreEnrolSubscriber({ firstName, email });
    if (synced.ok) {
      await markPreSynced(pool, paymentUuid);
    }

    return json(200, {
      ok: true,
      paymentUuid,
      pendingReview: true,
      flodeskPreSynced: !!synced.ok,
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not submit manual payment" });
  }
};
