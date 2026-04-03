const { getPool } = require("./_lib/db");
const { siteBaseUrl, paystackVerifyTransaction } = require("./_lib/payments");
const {
  ensureDomainTables,
  findDomainRenewalCheckoutByReference,
  markDomainRenewalCheckoutPaid,
  finalizeDomainRenewalCheckout,
  applyPaidDomainRenewal,
} = require("./_lib/domains");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function redirect(location) {
  return {
    statusCode: 302,
    headers: {
      Location: location,
    },
    body: "",
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const reference = clean(
    (event.queryStringParameters && (event.queryStringParameters.reference || event.queryStringParameters.trxref)) || "",
    120
  );
  if (!reference) {
    return redirect(`${siteBaseUrl()}/dashboard/domains/?renewal=failed`);
  }

  const pool = getPool();
  try {
    await ensureDomainTables(pool);

    const tx = await paystackVerifyTransaction(reference);
    const status = String(tx && tx.status ? tx.status : "").toLowerCase();
    if (status !== "success") {
      return redirect(`${siteBaseUrl()}/dashboard/domains/?renewal=failed`);
    }

    const checkout = await findDomainRenewalCheckoutByReference(pool, reference);
    if (!checkout) {
      return redirect(`${siteBaseUrl()}/dashboard/domains/?renewal=failed`);
    }

    const paidCurrency = String(tx.currency || checkout.payment_currency || "NGN").toUpperCase();
    const paidAmountMinor = Number(tx.amount || checkout.payment_amount_minor || 0);

    await markDomainRenewalCheckoutPaid(pool, {
      renewalUuid: checkout.renewal_uuid,
      paymentCurrency: paidCurrency,
      paymentAmountMinor: paidAmountMinor,
      status: "paid",
    });

    const accountId = Number(checkout.account_id || 0);
    const domainName = String(checkout.domain_name || "").trim().toLowerCase();
    const years = Math.max(1, Math.min(Number(checkout.years) || 1, 10));
    if (!accountId || !domainName) {
      await finalizeDomainRenewalCheckout(pool, {
        renewalUuid: checkout.renewal_uuid,
        status: "failed",
        note: "Invalid renewal checkout payload.",
      });
      return redirect(`${siteBaseUrl()}/dashboard/domains/?renewal=failed`);
    }

    const renewal = await applyPaidDomainRenewal(pool, {
      accountId,
      domainName,
      years,
    });

    await finalizeDomainRenewalCheckout(pool, {
      renewalUuid: checkout.renewal_uuid,
      status: "renewed",
      note: `Renewed for ${years} year(s). New due date: ${renewal.renewalDueAt || "n/a"}`,
    });

    return redirect(`${siteBaseUrl()}/dashboard/domains/?renewal=success&domain=${encodeURIComponent(domainName)}`);
  } catch (error) {
    console.error("[domain-renew-paystack-return] failed", {
      message: error && error.message ? String(error.message) : "unknown",
      stack: error && error.stack ? String(error.stack) : "",
    });
    return redirect(`${siteBaseUrl()}/dashboard/domains/?renewal=failed`);
  }
};
