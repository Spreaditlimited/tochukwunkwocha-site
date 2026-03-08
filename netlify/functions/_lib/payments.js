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

function verifyPaystackSignature(rawBody, signature) {
  const hash = crypto.createHmac("sha512", paystackSecret()).update(String(rawBody || "")).digest("hex");
  return hash === String(signature || "").trim();
}

async function paystackInitialize({ email, amountMinor, reference, metadata }) {
  const secret = paystackSecret();
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
      callback_url: `${siteBaseUrl()}/courses/prompt-to-profit?payment=paystack_pending`,
      metadata,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.status || !json.data || !json.data.authorization_url) {
    throw new Error((json && json.message) || `Paystack initialize failed (${res.status})`);
  }

  return {
    checkoutUrl: json.data.authorization_url,
    providerReference: json.data.reference || reference,
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

async function paypalCreateOrder({ amount, currency, customId }) {
  const token = await paypalAccessToken();
  const baseUrl = siteBaseUrl();

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
          description: "Prompt to Profit pre-enrolment",
        },
      ],
      application_context: {
        return_url: `${baseUrl}/.netlify/functions/paypal-return`,
        cancel_url: `${baseUrl}/courses/prompt-to-profit?payment=cancelled`,
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
  verifyPaystackSignature,
  paystackInitialize,
  paypalCreateOrder,
  paypalCaptureOrder,
  paypalVerifyWebhook,
};
