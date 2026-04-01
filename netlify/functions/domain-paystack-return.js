const crypto = require("crypto");
const { getPool } = require("./_lib/db");
const { siteBaseUrl, paystackVerifyTransaction } = require("./_lib/payments");
const { sendEmail } = require("./_lib/email");
const { registerDomain, selectedDomainProviderName } = require("./_lib/domain-client");
const {
  ensureDomainTables,
  findDomainCheckoutByReference,
  markDomainCheckoutPaid,
  finalizeDomainCheckout,
  createDomainOrder,
  markDomainOrder,
  upsertUserDomain,
  addYearsSql,
} = require("./_lib/domains");
const {
  ensureStudentAuthTables,
  findStudentByEmail,
  createStudentAccount,
  createStudentSession,
  createPasswordResetToken,
  setStudentCookieHeader,
} = require("./_lib/student-auth");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function randomPassword() {
  return crypto.randomBytes(6).toString("base64url") + "A9!";
}

function buildWelcomeEmail({ fullName, email, tempPassword, resetLink }) {
  const safeName = String(fullName || "there").trim();
  const safeEmail = String(email || "").trim();
  const safePass = String(tempPassword || "").trim();
  const safeLink = String(resetLink || "").trim();
  const html = [
    `<p>Hello ${safeName},</p>`,
    `<p>Your dashboard account has been created.</p>`,
    `<p><strong>Email:</strong> ${safeEmail}<br/><strong>Temporary password:</strong> <code>${safePass}</code></p>`,
    `<p>Please reset your password using the link below (required before you can sign in):</p>`,
    `<p><a href="${safeLink}">${safeLink}</a></p>`,
    `<p>This link expires in 1 hour.</p>`,
  ].join("\n");
  const text = [
    `Hello ${safeName},`,
    "",
    "Your dashboard account has been created.",
    `Email: ${safeEmail}`,
    `Temporary password: ${safePass}`,
    "",
    "Please reset your password using the link below (required before you can sign in):",
    safeLink,
    "",
    "This link expires in 1 hour.",
  ].join("\n");
  return { html, text };
}

function redirect(location, setCookie) {
  return {
    statusCode: 302,
    headers: {
      Location: location,
      ...(setCookie ? { "Set-Cookie": setCookie } : {}),
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
    return redirect(`${siteBaseUrl()}/services/domain-registration/?payment=failed`, "");
  }

  const pool = getPool();
  try {
    await ensureDomainTables(pool);
    await ensureStudentAuthTables(pool);

    const tx = await paystackVerifyTransaction(reference);
    const status = String(tx && tx.status ? tx.status : "").toLowerCase();
    if (status !== "success") {
      return redirect(`${siteBaseUrl()}/services/domain-registration/?payment=failed`, "");
    }

    const checkout = await findDomainCheckoutByReference(pool, reference);
    if (!checkout) {
      return redirect(`${siteBaseUrl()}/services/domain-registration/?payment=failed`, "");
    }

    await markDomainCheckoutPaid(pool, {
      checkoutUuid: checkout.checkout_uuid,
      paymentCurrency: String(tx.currency || checkout.payment_currency || "NGN").toUpperCase(),
      paymentAmountMinor: Number(tx.amount || checkout.payment_amount_minor || 0),
      status: "paid",
    });

    const email = String(checkout.email || "").trim().toLowerCase();
    const fullName = String(checkout.full_name || "Student").trim();
    const years = Math.max(1, Math.min(Number(checkout.years) || 1, 10));
    const domainName = String(checkout.domain_name || "").trim().toLowerCase();
    const provider = String(checkout.provider || selectedDomainProviderName()).trim().toLowerCase() || "namecheap";

    let account = await findStudentByEmail(pool, email);
    let setCookie = "";
    if (!account) {
      const tempPassword = randomPassword();
      account = await createStudentAccount(pool, {
        fullName,
        email,
        password: tempPassword,
        mustResetPassword: true,
      });
      const reset = await createPasswordResetToken(pool, email);
      if (reset && reset.token) {
        const link = `${siteBaseUrl()}/dashboard/reset-password/?token=${encodeURIComponent(reset.token)}`;
        const mail = buildWelcomeEmail({
          fullName,
          email,
          tempPassword,
          resetLink: link,
        });
        try {
          await sendEmail({
            to: email,
            subject: "Your Dashboard Access (Password Reset Required)",
            html: mail.html,
            text: mail.text,
          });
        } catch (_error) {}
      }
    }

    if (!account || !account.id) {
      await finalizeDomainCheckout(pool, {
        checkoutUuid: checkout.checkout_uuid,
        status: "registration_failed",
        note: "Could not resolve dashboard account.",
      });
      return redirect(`${siteBaseUrl()}/services/domain-registration/?payment=failed`, "");
    }

    const token = await createStudentSession(pool, account.id);
    setCookie = setStudentCookieHeader(event, token);

    const orderUuid = await createDomainOrder(pool, {
      accountId: Number(account.id),
      email,
      domainName,
      years,
      provider,
      status: "registration_in_progress",
      paymentProvider: "paystack",
      paymentStatus: "paid",
      purchaseCurrency: String(tx.currency || checkout.payment_currency || "NGN").toUpperCase(),
      purchaseAmountMinor: Number(tx.amount || checkout.payment_amount_minor || 0),
      providerOrderId: reference,
    });

    const registration = await registerDomain({ domainName, years });
    if (!registration.success) {
      await markDomainOrder(pool, {
        orderUuid,
        status: "registration_failed",
        provider: registration.provider || provider,
        purchaseCurrency: registration.currency || "USD",
        purchaseAmountMinor: registration.amountMinor,
        providerOrderId: registration.orderId || reference,
        note: clean(registration.reason || "registration_failed", 500),
        setRegisteredAt: false,
      });
      await finalizeDomainCheckout(pool, {
        checkoutUuid: checkout.checkout_uuid,
        linkedAccountId: Number(account.id),
        orderUuid,
        status: "registration_failed",
        note: "Payment successful but domain registration failed.",
      });
      return redirect(`${siteBaseUrl()}/dashboard/domains/?domain=registration_failed`, setCookie);
    }

    const registeredAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    await markDomainOrder(pool, {
      orderUuid,
      status: "registered",
      provider: registration.provider || provider,
      purchaseCurrency: registration.currency || "USD",
      purchaseAmountMinor: registration.amountMinor,
      providerOrderId: registration.orderId || reference,
      setRegisteredAt: true,
    });
    await upsertUserDomain(pool, {
      accountId: Number(account.id),
      email,
      domainName: registration.domainName || domainName,
      provider: registration.provider || provider,
      status: "registered",
      years,
      purchaseCurrency: registration.currency || "USD",
      purchaseAmountMinor: registration.amountMinor,
      providerOrderId: registration.orderId || "",
      registeredAt,
      renewalDueAt: addYearsSql(registeredAt, years),
    });
    await finalizeDomainCheckout(pool, {
      checkoutUuid: checkout.checkout_uuid,
      linkedAccountId: Number(account.id),
      orderUuid,
      status: "registered",
      note: "Payment confirmed and domain registered.",
    });

    return redirect(`${siteBaseUrl()}/dashboard/domains/?domain=registered`, setCookie);
  } catch (_error) {
    return redirect(`${siteBaseUrl()}/services/domain-registration/?payment=failed`, "");
  }
};
