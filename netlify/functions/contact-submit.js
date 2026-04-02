const { json, badMethod } = require("./_lib/http");
const { sendEmail } = require("./_lib/email");

function clean(value, maxLen) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  // Simple honeypot support if added to the form later.
  if (clean(body.website, 120)) {
    return json(200, { ok: true });
  }

  const fullName = clean(body.fullName, 140);
  const email = clean(body.email, 190).toLowerCase();
  const purpose = clean(body.purpose, 80);
  const message = clean(body.message, 4000);

  if (!fullName || !email || !purpose || !message) {
    return json(400, { ok: false, error: "Full Name, Email, Purpose, and Message are required." });
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return json(400, { ok: false, error: "Please enter a valid email address." });
  }

  const to = "support@tochukwunkwocha.com";
  const subject = `New Contact Form Submission — ${purpose}`;
  const safeName = escapeHtml(fullName);
  const safeEmail = escapeHtml(email);
  const safePurpose = escapeHtml(purpose);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br/>");

  const html = [
    "<h2>New Contact Form Submission</h2>",
    `<p><strong>Full Name:</strong> ${safeName}</p>`,
    `<p><strong>Email:</strong> ${safeEmail}</p>`,
    `<p><strong>Purpose:</strong> ${safePurpose}</p>`,
    "<p><strong>Message:</strong></p>",
    `<p>${safeMessage}</p>`,
  ].join("");

  const text = [
    "New Contact Form Submission",
    `Full Name: ${fullName}`,
    `Email: ${email}`,
    `Purpose: ${purpose}`,
    "",
    "Message:",
    message,
  ].join("\n");

  try {
    await sendEmail({ to, subject, html, text });

    // Best-effort acknowledgement to sender.
    const ackSubject = "We received your message — Tochukwu Tech and AI Academy";
    const ackHtml = [
      `<p>Hello ${safeName},</p>`,
      "<p>Thank you for contacting Tochukwu Tech and AI Academy.</p>",
      "<p>We have received your message and our support team will get back to you shortly.</p>",
      "<p><strong>Your message summary:</strong></p>",
      `<p><strong>Purpose:</strong> ${safePurpose}<br/><strong>Message:</strong> ${safeMessage}</p>`,
      "<p>Support email: <a href=\"mailto:support@tochukwunkwocha.com\">support@tochukwunkwocha.com</a></p>",
      "<p>Regards,<br/>Tochukwu Tech and AI Academy</p>",
    ].join("");
    const ackText = [
      `Hello ${fullName},`,
      "",
      "Thank you for contacting Tochukwu Tech and AI Academy.",
      "We have received your message and our support team will get back to you shortly.",
      "",
      "Your message summary:",
      `Purpose: ${purpose}`,
      `Message: ${message}`,
      "",
      "Support email: support@tochukwunkwocha.com",
      "",
      "Regards,",
      "Tochukwu Tech and AI Academy",
    ].join("\n");

    try {
      await sendEmail({ to: email, subject: ackSubject, html: ackHtml, text: ackText });
    } catch (_ackError) {}

    return json(200, { ok: true, message: "Your message has been sent successfully." });
  } catch (error) {
    return json(500, { ok: false, error: error && error.message ? error.message : "Could not send message." });
  }
};
