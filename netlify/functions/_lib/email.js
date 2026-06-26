const nodemailer = require("nodemailer");
const { renderBrandedEmail } = require("./branded-email");

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function smtpConfig() {
  const host = required("SMTP_HOST");
  const port = Number(required("SMTP_PORT"));
  const user = required("SMTP_USER");
  const pass = required("SMTP_PASS");
  const secureRaw = String(process.env.SMTP_SECURE || "").trim().toLowerCase();
  const secure = secureRaw ? secureRaw === "1" || secureRaw === "true" : port === 465;

  return { host, port, secure, auth: { user, pass } };
}

function fromAddress() {
  const email = String(process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "").trim();
  if (!email) throw new Error("Missing SMTP_FROM_EMAIL or SMTP_USER");
  const name = String(process.env.SMTP_FROM_NAME || "Tochukwu Tech and AI Academy").trim() || "Tochukwu Tech and AI Academy";
  return `${name} <${email}>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shouldDecorateHtml(html) {
  var content = String(html || "").trim().toLowerCase();
  if (!content) return false;
  return !(content.includes("<html") || content.includes("<!doctype"));
}

function decorateHtmlEmail(input) {
  var subject = String(input && input.subject ? input.subject : "");
  var html = String(input && input.html ? input.html : "").trim();
  if (!shouldDecorateHtml(html)) return html;
  return renderBrandedEmail({
    subject: subject,
    title: subject,
    eyebrow: input && input.eyebrow ? input.eyebrow : "Tochukwu Tech and AI Academy",
    bodyHtml: html,
  });
}

async function sendEmail(input) {
  const to = String(input.to || "").trim();
  const subject = String(input.subject || "").trim();
  const rawHtml = String(input.html || "").trim();
  const html = rawHtml ? decorateHtmlEmail({ subject, html: rawHtml }) : "";
  const text = String(input.text || "").trim();

  if (!to || !subject || (!html && !text)) {
    throw new Error("to, subject, and email body are required");
  }

  try {
    const transporter = nodemailer.createTransport(smtpConfig());

    const result = await transporter.sendMail({
      from: fromAddress(),
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
    });

    return { ok: true, messageId: result && result.messageId ? String(result.messageId) : null };
  } catch (error) {
    console.warn("smtp_send_failed", {
      to,
      subject,
      error: error && error.message ? error.message : String(error || "unknown error"),
    });
    throw error;
  }
}

module.exports = { sendEmail };
