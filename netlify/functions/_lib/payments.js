const crypto = require("crypto");

function required(name) {
  const value = process.env[name] && String(process.env[name]).trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function siteBaseUrl() {
  return required("SITE_BASE_URL").replace(/\/$/, "");
}

function paystackSecret() {
  return required("PAYSTACK_SECRET_KEY");
}

function buildError(message, extra) {
  const err = new Error(String(message || "Unknown error"));
  if (extra && typeof extra === "object") {
    Object.keys(extra).forEach((key) => {
      err[key] = extra[key];
    });
  }
  return err;
}

function paystackKeyMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.indexOf("sk_test_") === 0 || raw.indexOf("pk_test_") === 0) return "test";
  if (raw.indexOf("sk_live_") === 0 || raw.indexOf("pk_live_") === 0) return "live";
  return "";
}

function paystackSecretMode() {
  return paystackKeyMode(paystackSecret()) || "unknown";
}

function normalizePaystackErrorReason(input, statusCode) {
  const text = String(input || "").trim().toLowerCase();
  const status = Number(statusCode || 0);
  if (status === 401 || text.indexOf("unauthorized") !== -1 || text.indexOf("invalid key") !== -1) return "unauthorized";
  if (status === 403 || text.indexOf("forbidden") !== -1) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 408 || text.indexOf("timed out") !== -1 || text.indexOf("timeout") !== -1) return "timeout";
  if (status === 429 || text.indexOf("too many requests") !== -1 || text.indexOf("rate limit") !== -1) return "rate_limited";
  if (status >= 500 || text.indexOf("internal server error") !== -1 || text.indexOf("service unavailable") !== -1) return "provider_unavailable";
  if (status >= 400 && status < 500) return "bad_request";
  if (text.indexOf("fetch failed") !== -1 || text.indexOf("network") !== -1 || text.indexOf("econn") !== -1) return "network_error";
  if (text.indexOf("missing") !== -1) return "invalid_configuration";
  return "unknown";
}

function paystackPublicKey() {
  const candidates = [
    "PAYSTACK_PUBLIC_KEY",
    "PAYSTACK_PUBLIC",
    "PAYSTACK_KEY",
    "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY",
    "NEXT_PUBLIC_PAYSTACK_KEY",
  ];

  for (const name of candidates) {
    const value = process.env[name] && String(process.env[name]).trim();
    if (value) return value;
  }

  throw new Error(`Missing Paystack public key. Set one of: ${candidates.join(", ")}`);
}

function assertPaystackKeyModesCompatible() {
  const secret = paystackSecret();
  const secretMode = paystackKeyMode(secret);
  let publicMode = "";
  try {
    publicMode = paystackKeyMode(paystackPublicKey());
  } catch (_error) {
    publicMode = "";
  }

  if (secretMode && publicMode && secretMode !== publicMode) {
    throw new Error(
      `Paystack key mode mismatch: secret is ${secretMode}, public is ${publicMode}. ` +
      `Set both keys to the same mode (live/live or test/test).`
    );
  }
}

function verifyPaystackSignature(rawBody, signature) {
  const hash = crypto.createHmac("sha512", paystackSecret()).update(String(rawBody || "")).digest("hex");
  return hash === String(signature || "").trim();
}

async function paystackInitialize({ email, amountMinor, reference, metadata, callbackUrl }) {
  assertPaystackKeyModesCompatible();
  const secret = paystackSecret();
  const safeCallbackUrl =
    String(callbackUrl || "").trim() || `${siteBaseUrl()}/.netlify/functions/paystack-return`;
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amountMinor,
      reference,
      callback_url: safeCallbackUrl,
      metadata,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.status || !json.data) {
    throw new Error((json && json.message) || `Paystack initialize failed (${res.status})`);
  }

  return {
    checkoutUrl: json.data.authorization_url || null,
    accessCode: json.data.access_code || null,
    providerReference: json.data.reference || reference,
  };
}

async function paystackVerifyTransaction(reference) {
  const secret = paystackSecret();
  const ref = String(reference || "").trim();
  if (!ref) throw new Error("Missing Paystack reference");

  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.status || !json.data) {
    throw new Error((json && json.message) || `Paystack verify failed (${res.status})`);
  }

  return json.data;
}

async function paystackCreateTransferRecipient({ type, name, accountNumber, bankCode, currency }) {
  const secret = paystackSecret();
  const payload = {
    type: String(type || "nuban").trim() || "nuban",
    name: String(name || "").trim(),
    account_number: String(accountNumber || "").trim(),
    bank_code: String(bankCode || "").trim(),
    currency: String(currency || "NGN").trim().toUpperCase(),
  };
  if (!payload.name || !payload.account_number || !payload.bank_code) {
    throw new Error("Missing transfer recipient details");
  }

  const res = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.status || !json.data) {
    throw new Error((json && json.message) || `Paystack transfer recipient failed (${res.status})`);
  }
  return {
    recipientCode: json.data.recipient_code || null,
    active: Boolean(json.data.active),
    details: json.data.details || null,
  };
}

async function paystackListBanks({ country, currency, useCursor, perPage, includeMeta } = {}) {
  const secret = paystackSecret();
  const normalizedCountry = String(country || "").trim().toUpperCase();
  const normalizedCurrency = String(currency || "").trim().toUpperCase();
  const countryName = normalizedCountry === "NG" ? "nigeria" : String(country || "").trim().toLowerCase();

  const queries = [
    { label: "country_name_currency_verify", country: countryName, currency: normalizedCurrency, enabledForVerification: true },
    { label: "country_name_verify", country: countryName, enabledForVerification: true },
    { label: "country_name", country: countryName },
    { label: "country_code_currency_verify", country: normalizedCountry, currency: normalizedCurrency, enabledForVerification: true },
    { label: "country_code_verify", country: normalizedCountry, enabledForVerification: true },
    { label: "unfiltered" },
  ];

  let lastError = null;
  const attempts = [];
  let lastSuccessfulVariant = "";
  for (const query of queries) {
    const params = new URLSearchParams();
    if (query.country) params.set("country", String(query.country));
    if (query.currency) params.set("currency", String(query.currency));
    if (query.enabledForVerification) params.set("enabled_for_verification", "true");
    if (useCursor) params.set("use_cursor", "true");
    if (perPage) params.set("perPage", String(Number(perPage) || 100));

    const res = await fetch(`https://api.paystack.co/bank?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || !json.status || !Array.isArray(json.data)) {
      const message = (json && json.message) || `Paystack list banks failed (${res.status})`;
      const reason = normalizePaystackErrorReason(message, res.status);
      attempts.push({
        variant: query.label,
        ok: false,
        statusCode: Number(res.status || 0),
        errorReason: reason,
      });
      lastError = buildError(message, {
        paystackReason: reason,
        paystackStatusCode: Number(res.status || 0),
        queryVariant: query.label,
      });
      continue;
    }
    const banks = json.data.map((item) => ({
      name: String(item && item.name || "").trim(),
      code: String(item && item.code || "").trim(),
      active: Boolean(item && item.active),
    })).filter((item) => item.code && item.name);
    lastSuccessfulVariant = query.label;
    attempts.push({
      variant: query.label,
      ok: true,
      statusCode: Number(res.status || 200),
      count: banks.length,
    });
    if (banks.length) {
      if (includeMeta) {
        return {
          banks,
          source: "paystack",
          queryVariant: query.label,
          attempts,
          mode: paystackSecretMode(),
        };
      }
      return banks;
    }
  }

  if (includeMeta) {
    return {
      banks: [],
      source: "paystack",
      queryVariant: lastSuccessfulVariant || "none",
      attempts,
      mode: paystackSecretMode(),
      errorReason: lastError ? String(lastError.paystackReason || "unknown") : "empty",
    };
  }
  if (lastError) throw lastError;
  return [];
}

async function paystackResolveBankAccount({ accountNumber, bankCode }) {
  const secret = paystackSecret();
  const acct = String(accountNumber || "").trim();
  const code = String(bankCode || "").trim();
  if (!acct || !code) {
    throw buildError("Missing account resolve details", {
      paystackReason: "invalid_input",
      paystackStatusCode: 0,
    });
  }

  const params = new URLSearchParams();
  params.set("account_number", acct);
  params.set("bank_code", code);

  const res = await fetch(`https://api.paystack.co/bank/resolve?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.status || !json.data) {
    const message = (json && json.message) || `Paystack resolve account failed (${res.status})`;
    const reason = normalizePaystackErrorReason(message, res.status);
    throw buildError(message, {
      paystackReason: reason,
      paystackStatusCode: Number(res.status || 0),
      bankCode: code,
    });
  }
  return {
    accountName: String(json.data.account_name || "").trim(),
    accountNumber: String(json.data.account_number || "").trim(),
    bankId: Number(json.data.bank_id || 0),
  };
}

async function paystackCreateTransfer({ source, amountMinor, recipient, reason, reference }) {
  const secret = paystackSecret();
  const payload = {
    source: String(source || "balance").trim() || "balance",
    amount: Number(amountMinor || 0),
    recipient: String(recipient || "").trim(),
    reason: String(reason || "").trim() || "Affiliate payout",
    reference: String(reference || "").trim() || undefined,
  };
  if (!payload.recipient || !Number.isFinite(payload.amount) || payload.amount <= 0) {
    throw new Error("Invalid transfer payload");
  }

  const res = await fetch("https://api.paystack.co/transfer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.status || !json.data) {
    throw new Error((json && json.message) || `Paystack transfer failed (${res.status})`);
  }
  return {
    transferId: json.data.id || null,
    transferCode: json.data.transfer_code || null,
    reference: json.data.reference || payload.reference || null,
    status: json.data.status || null,
  };
}

function paypalBaseUrl() {
  const env = String(process.env.PAYPAL_ENV || "live").trim().toLowerCase();
  return env === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

async function paypalAccessToken() {
  const clientId = required("PAYPAL_CLIENT_ID");
  const secret = required("PAYPAL_CLIENT_SECRET");
  const token = Buffer.from(`${clientId}:${secret}`).toString("base64");

  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.access_token) {
    throw new Error((json && (json.error_description || json.message)) || "PayPal auth failed");
  }

  return json.access_token;
}

async function paypalCreateOrder({ amount, currency, customId, description, cancelPath }) {
  const token = await paypalAccessToken();
  const baseUrl = siteBaseUrl();
  const safeCancelPath = String(cancelPath || "/courses/prompt-to-profit").trim();
  const safeDescription = String(description || "Course pre-enrolment").trim();

  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: amount,
          },
          custom_id: customId,
          description: safeDescription,
        },
      ],
      application_context: {
        return_url: `${baseUrl}/.netlify/functions/paypal-return`,
        cancel_url: `${baseUrl}${safeCancelPath}?payment=cancelled`,
        user_action: "PAY_NOW",
      },
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.id) {
    throw new Error((json && json.message) || "PayPal create order failed");
  }

  const approveUrl = Array.isArray(json.links)
    ? json.links.find((item) => item && item.rel === "approve")?.href
    : null;

  if (!approveUrl) {
    throw new Error("Missing PayPal approval URL");
  }

  return {
    orderId: json.id,
    checkoutUrl: approveUrl,
  };
}

async function paypalCaptureOrder(orderId) {
  const token = await paypalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((json && json.message) || "PayPal capture failed");
  }

  return json;
}

async function paypalVerifyWebhook({ body, headers }) {
  const token = await paypalAccessToken();
  const webhookId = required("PAYPAL_WEBHOOK_ID");

  const payload = {
    webhook_id: webhookId,
    transmission_id: headers["paypal-transmission-id"] || null,
    transmission_time: headers["paypal-transmission-time"] || null,
    cert_url: headers["paypal-cert-url"] || null,
    auth_algo: headers["paypal-auth-algo"] || null,
    transmission_sig: headers["paypal-transmission-sig"] || null,
    webhook_event: body,
  };

  const res = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => null);
  return !!(res.ok && json && String(json.verification_status || "").toUpperCase() === "SUCCESS");
}

module.exports = {
  siteBaseUrl,
  paystackSecretMode,
  normalizePaystackErrorReason,
  paystackPublicKey,
  verifyPaystackSignature,
  paystackInitialize,
  paystackVerifyTransaction,
  paystackListBanks,
  paystackResolveBankAccount,
  paystackCreateTransferRecipient,
  paystackCreateTransfer,
  paypalCreateOrder,
  paypalCaptureOrder,
  paypalVerifyWebhook,
};
