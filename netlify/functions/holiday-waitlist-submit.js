const { json, badMethod } = require("./_lib/http");
const { syncBrevoSubscriber } = require("./_lib/brevo");
const { sendMetaLead, requestContextToMetaData } = require("./_lib/meta");
const { verifyRecaptchaToken, clientIpFromEvent } = require("./_lib/recaptcha");
const { getPool, nowSql } = require("./_lib/db");
const { normalizePhoneE164 } = require("./_lib/whatsapp");
const {
  ensureWhatsAppWaitlistTables,
  upsertWaitlistContact,
  enqueueTemplateMessage,
} = require("./_lib/whatsapp-waitlist");

const BREVO_HOLIDAY_WAITLIST_LIST_ID = 10;

function clean(value, maxLen) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function firstHeader(headers, names) {
  const src = headers && typeof headers === "object" ? headers : {};
  for (const name of names || []) {
    if (!name) continue;
    const direct = src[name];
    if (direct) return String(direct);
    const lower = src[String(name).toLowerCase()];
    if (lower) return String(lower);
  }
  return "";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  if (clean(body.website, 120)) return json(200, { ok: true });

  const fullName = clean(body.fullName, 140);
  const email = clean(body.email, 190).toLowerCase();
  const phone = clean(body.phone, 80);
  const whatsappOptIn = Boolean(body.whatsappOptIn);
  const optInTextVersion = clean(body.optInTextVersion, 80) || "holiday_waitlist_v1";
  const phoneE164 = normalizePhoneE164(phone);

  if (!fullName || !email || !phone || !whatsappOptIn) {
    return json(400, { ok: false, error: "Full name, email, phone, and WhatsApp opt-in are required." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { ok: false, error: "Please enter a valid email address." });
  }
  if (!phoneE164) {
    return json(400, { ok: false, error: "Please enter a valid WhatsApp phone number with country code." });
  }

  const recaptcha = await verifyRecaptchaToken({
    token: body.recaptchaToken,
    expectedAction: "holiday_waitlist_submit",
    remoteip: clientIpFromEvent(event),
  });
  if (!recaptcha.ok) {
    console.warn("holiday_waitlist_recaptcha_failed", {
      reason: recaptcha.reason || "unknown",
      action: recaptcha.action || "",
      score: Number.isFinite(recaptcha.score) ? recaptcha.score : null,
    });
    let errorMessage = "We could not verify this submission. Please try again.";
    if (recaptcha.reason === "action_mismatch") {
      errorMessage = "Security verification mismatch. Please refresh and submit again.";
    } else if (recaptcha.reason === "score_too_low") {
      errorMessage = "Submission flagged as suspicious. Please retry in a moment.";
    } else if (recaptcha.reason === "verify_unreachable") {
      errorMessage = "Security verification is temporarily unavailable. Please try again.";
    }
    return json(400, { ok: false, error: errorMessage, reason: recaptcha.reason || "verify_failed" });
  }

  const reqMeta = requestContextToMetaData({ headers: event.headers });
  const explicitOrigin = firstHeader(event.headers, ["origin"]);
  const forwardedProto = firstHeader(event.headers, ["x-forwarded-proto"]);
  const host = firstHeader(event.headers, ["host"]);
  const fallbackOrigin = forwardedProto && host ? `${forwardedProto}://${host}` : "";
  const originHeader = explicitOrigin || fallbackOrigin;
  const eventSourceUrl = clean(originHeader) ? `${clean(originHeader).replace(/\/+$/, "")}/join-holiday-waitlist/` : "";
  const metaEventId = `lead_holiday_waitlist_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  const reqMetaUserAgent = clean(firstHeader(event.headers, ["user-agent"]), 255);
  const reqMetaIp = clean(clientIpFromEvent(event), 80);

  let metaLeadSent = false;
  try {
    const metaRes = await sendMetaLead({
      eventId: metaEventId,
      eventSourceUrl,
      email,
      phone,
      fullName,
      externalId: `holiday_waitlist:${email}`,
      fbp: reqMeta.fbp,
      fbc: reqMeta.fbc,
      clientIpAddress: reqMeta.clientIpAddress,
      clientUserAgent: reqMeta.clientUserAgent,
      customData: {
        content_name: "Prompt to Profit Holiday Waitlist",
        content_category: "waitlist",
        lead_type: "holiday_waitlist_submit",
      },
    });
    metaLeadSent = Boolean(metaRes && metaRes.ok);
  } catch (_error) {}

  let whatsappQueued = false;
  let whatsappQueueError = "";
  try {
    const pool = getPool();
    await ensureWhatsAppWaitlistTables(pool);
    await upsertWaitlistContact(pool, {
      email,
      fullName,
      phoneE164,
      optInVersion: optInTextVersion,
      optInSourceUrl: eventSourceUrl,
      optInIp: reqMetaIp,
      optInUserAgent: reqMetaUserAgent,
    });
    await enqueueTemplateMessage(pool, {
      phoneE164,
      templateName: clean(process.env.META_WA_WAITLIST_WELCOME_TEMPLATE, 120) || "waitlist_welcome_marketing",
      templateLanguage: clean(process.env.META_WA_WAITLIST_TEMPLATE_LANG, 20) || "en",
      templateParamsJson: JSON.stringify({
        fullName,
        email,
      }),
      dueAtSql: nowSql(),
    });
    whatsappQueued = true;
  } catch (error) {
    whatsappQueueError = clean(error && error.message ? error.message : "Queue enqueue failed", 300);
    console.error("holiday_waitlist_whatsapp_queue_error", whatsappQueueError);
  }

  const brevo = await syncBrevoSubscriber({
    fullName,
    email,
    listId: BREVO_HOLIDAY_WAITLIST_LIST_ID,
    attributes: {
      WA_OPT_IN: "1",
      WA_OPT_IN_AT: new Date().toISOString(),
      WA_OPT_IN_SOURCE: "join_holiday_waitlist",
    },
  });
  if (!brevo.ok) {
    return json(502, { ok: false, error: brevo.error || "Could not save waitlist record right now." });
  }

  return json(200, {
    ok: true,
    message: "You are on the VIP waitlist.",
    whatsappQueued,
    whatsappQueueError,
    normalizedPhone: phoneE164,
    meta: {
      eventId: metaEventId,
      leadSent: metaLeadSent,
    },
  });
};
