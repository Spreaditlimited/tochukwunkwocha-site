const { getPool } = require("./_lib/db");
const { paystackVerifyTransaction, siteBaseUrl } = require("./_lib/payments");
const { ensureInstallmentTables, markInstallmentPaymentPaidByReference } = require("./_lib/installments");

function redirect(url) {
  return {
    statusCode: 302,
    headers: { Location: url },
    body: "",
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const qs = event.queryStringParameters || {};
  const reference = String(qs.reference || qs.trxref || "").trim();
  if (!reference) return redirect(`${siteBaseUrl()}/courses/installments/?payment=failed`);

  try {
    const tx = await paystackVerifyTransaction(reference);
    const status = String(tx.status || "").toLowerCase();
    if (status !== "success") return redirect(`${siteBaseUrl()}/courses/installments/?payment=failed`);

    const pool = getPool();
    await ensureInstallmentTables(pool);
    const result = await markInstallmentPaymentPaidByReference(pool, {
      providerReference: reference,
      providerOrderId: tx.id ? String(tx.id) : null,
    });
    if (!result.ok) return redirect(`${siteBaseUrl()}/courses/installments/?payment=failed`);
    return redirect(`${siteBaseUrl()}/courses/installments/?payment=success`);
  } catch (_error) {
    return redirect(`${siteBaseUrl()}/courses/installments/?payment=failed`);
  }
};
