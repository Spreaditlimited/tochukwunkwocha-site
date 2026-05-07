const { json, badMethod } = require("./_lib/http");
const { syncBrevoSubscriber } = require("./_lib/brevo");
const { sendMetaLead, requestContextToMetaData } = require("./_lib/meta");
const { verifyRecaptchaToken, clientIpFromEvent } = require("./_lib/recaptcha");

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

  if (!fullName || !email || !phone) {
    return json(400, { ok: false, error: "Full name, email, and phone are required." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { ok: false, error: "Please enter a valid email address." });
  }

  const recaptcha = await verifyRecaptchaToken({
    token: body.recaptchaToken,
    expectedAction: "holiday_waitlist_submit",
    remoteip: clientIpFromEvent(event),
  });
  if (!recaptcha.ok) {
    return json(400, { ok: false, error: "We could not verify this submission. Please try again." });
  }

  const brevo = await syncBrevoSubscriber({
    fullName,
    email,
    listId: BREVO_HOLIDAY_WAITLIST_LIST_ID,
  });
  if (!brevo.ok) {
    return json(502, { ok: false, error: brevo.error || "Could not save waitlist record right now." });
  }

  const reqMeta = requestContextToMetaData({ headers: event.headers });
  const explicitOrigin = firstHeader(event.headers, ["origin"]);
  const forwardedProto = firstHeader(event.headers, ["x-forwarded-proto"]);
  const host = firstHeader(event.headers, ["host"]);
  const fallbackOrigin = forwardedProto && host ? `${forwardedProto}://${host}` : "";
  const originHeader = explicitOrigin || fallbackOrigin;
  const eventSourceUrl = clean(originHeader) ? `${clean(originHeader).replace(/\/+$/, "")}/join-holiday-waitlist/` : "";
  const metaEventId = `lead_holiday_waitlist_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;

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

  return json(200, {
    ok: true,
    message: "You are on the VIP waitlist.",
    meta: {
      eventId: metaEventId,
      leadSent: metaLeadSent,
    },
  });
};

