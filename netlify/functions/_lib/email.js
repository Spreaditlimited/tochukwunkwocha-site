const nodemailer = require("nodemailer");

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

function siteBaseUrl() {
  return String(process.env.SITE_BASE_URL || "https://tochukwunkwocha.com").trim().replace(/\/$/, "");
}

function brandName() {
  return String(process.env.SMTP_FROM_NAME || "Tochukwu Tech and AI Academy").trim() || "Tochukwu Tech and AI Academy";
}

function shouldDecorateHtml(html) {
  var content = String(html || "").trim().toLowerCase();
  if (!content) return false;
  return !(content.includes("<html") || content.includes("<!doctype"));
}

function decorateHtmlEmail(input) {
  var subject = escapeHtml(input && input.subject ? input.subject : "");
  var html = String(input && input.html ? input.html : "").trim();
  if (!shouldDecorateHtml(html)) return html;

  var baseUrl = siteBaseUrl();
  var homeUrl = baseUrl || "https://tochukwunkwocha.com";
  var brand = escapeHtml(brandName());
  var year = String(new Date().getFullYear());

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<meta name="x-apple-disable-message-reformatting" />',
    '<title>' + subject + '</title>',
    '</head>',
    '<body style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">',
    '<tr><td align="center">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">',
    '<tr><td style="padding:20px 24px;background:linear-gradient(120deg,#1a2849 0%,#22345f 100%);">',
    '<p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#c7d2fe;font-weight:700;">Notification</p>',
    '<h1 style="margin:8px 0 0 0;font-size:18px;line-height:1.4;color:#ffffff;font-weight:700;">' + subject + '</h1>',
    '</td></tr>',
    '<tr><td style="padding:24px;">',
    '<div style="font-size:15px;line-height:1.7;color:#111827;">' + html + '</div>',
    '</td></tr>',
    '<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;background:#f9fafb;">',
    '<p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">Sent by <a href="' + escapeHtml(homeUrl) + '" style="color:#1a2849;text-decoration:none;font-weight:600;">' + brand + '</a>.</p>',
    '<p style="margin:6px 0 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">&copy; ' + year + ' ' + brand + '</p>',
    '</td></tr>',
    '</table>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('');
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
