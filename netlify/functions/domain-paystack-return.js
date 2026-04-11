const crypto = require("crypto");
const { getPool } = require("./_lib/db");
const { siteBaseUrl, paystackVerifyTransaction } = require("./_lib/payments");
const { sendEmail } = require("./_lib/email");
const { selectedDomainProviderName } = require("./_lib/domain-client");
const {
  ensureDomainTables,
  findDomainCheckoutByReference,
  markDomainCheckoutPaid,
  finalizeDomainCheckout,
  createDomainOrder,
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

function parseSelectedServicesJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function parseRegistrantProfileJson(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
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

    const paidCurrency = String(tx.currency || checkout.payment_currency || "NGN").toUpperCase();
    const paidAmountMinor = Number(tx.amount || checkout.payment_amount_minor || 0);

    const email = String(checkout.email || "").trim().toLowerCase();
    const fullName = String(checkout.full_name || "Student").trim();
    const years = Math.max(1, Math.min(Number(checkout.years) || 1, 10));
    const domainName = String(checkout.domain_name || "").trim().toLowerCase();
    const provider = String(checkout.provider || selectedDomainProviderName()).trim().toLowerCase() || "namecheap";
    const selectedServices = parseSelectedServicesJson(checkout.selected_services_json);
    const registrantProfile = parseRegistrantProfileJson(checkout.registrant_profile_json);
    const autoRenewEnabled = Number(checkout.auto_renew_enabled || 0) === 1;

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

    const token = await createStudentSession(pool, account.id, {
      event,
      enforceDeviceLimit: false,
    });
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
      purchaseCurrency: paidCurrency,
      purchaseAmountMinor: paidAmountMinor,
      providerOrderId: reference,
      registrantProfile,
      selectedServices,
      autoRenewEnabled,
    });

    await finalizeDomainCheckout(pool, {
      checkoutUuid: checkout.checkout_uuid,
      linkedAccountId: Number(account.id),
      orderUuid,
      status: "registration_in_progress",
      note: "Payment confirmed. Domain registration is being processed.",
    });

    return redirect(
      `${siteBaseUrl()}/dashboard/domains/?domain=payment_confirmed&order=${encodeURIComponent(String(orderUuid || ""))}`,
      setCookie
    );
  } catch (_error) {
    return redirect(`${siteBaseUrl()}/services/domain-registration/?payment=failed`, "");
  }
};
