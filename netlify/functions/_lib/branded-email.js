function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function siteBaseUrl() {
  return String(process.env.SITE_BASE_URL || "https://tochukwunkwocha.com").trim().replace(/\/+$/, "");
}

function renderButton(input) {
  const data = input && typeof input === "object" ? input : {};
  const href = String(data.href || "").trim();
  const label = String(data.label || "").trim();
  if (!href || !label) return "";
  return [
    '<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 4px;">',
    '<tr><td>',
    '<a href="' + escapeHtml(href) + '" style="display:inline-block;background:#1a2849;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 20px;font-size:14px;font-weight:800;">' + escapeHtml(label) + '</a>',
    '</td></tr>',
    '</table>',
  ].join("");
}

function renderBrandedEmail(input) {
  const data = input && typeof input === "object" ? input : {};
  const title = String(data.title || data.subject || "").trim();
  const eyebrow = String(data.eyebrow || "Practical AI Building Lessons").trim();
  const previewText = String(data.previewText || "").trim();
  const bodyHtml = String(data.bodyHtml || data.html || "").trim();
  const footerHtml = String(data.footerHtml || "").trim();
  const baseUrl = siteBaseUrl();
  const year = String(new Date().getFullYear());

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<meta name="x-apple-disable-message-reformatting" />',
    '<meta name="color-scheme" content="light only" />',
    '<meta name="supported-color-schemes" content="light only" />',
    "<title>" + escapeHtml(title) + "</title>",
    "</head>",
    '<body style="margin:0;padding:0;background:#f6f7fb;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#111827;">',
    previewText ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' + escapeHtml(previewText) + "</div>" : "",
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;">',
    "<tr>",
    '<td align="center" style="padding:28px 16px;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;font-family:Inter,Arial,sans-serif;color:#111827;">',
    "<tr>",
    '<td style="padding:26px 28px;background:#0f172a;color:#ffffff;">',
    '<p style="margin:0 0 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#a5d6ff;font-weight:800;">' + escapeHtml(eyebrow) + "</p>",
    '<h1 style="margin:0;font-size:26px;line-height:1.2;color:#ffffff;">' + escapeHtml(title) + "</h1>",
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:28px;font-size:16px;line-height:1.68;color:#1f2937;">',
    bodyHtml,
    footerHtml || '<p style="margin:30px 0 0;color:#374151;">Tochukwu Nkwocha</p>',
    "</td>",
    "</tr>",
    "<tr>",
    '<td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;">',
    '<p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">You are receiving this because you requested a guide or joined the practical AI notes from <a href="' + escapeHtml(baseUrl) + '" style="color:#1a2849;text-decoration:none;font-weight:700;">Tochukwu Tech and AI Academy</a>.</p>',
    '<p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">&copy; ' + year + " Tochukwu Tech and AI Academy.</p>",
    "</td>",
    "</tr>",
    "</table>",
    "</td>",
    "</tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("");
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h1|h2|li|ol|ul|pre|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

module.exports = {
  escapeHtml,
  renderButton,
  renderBrandedEmail,
  stripHtml,
};
