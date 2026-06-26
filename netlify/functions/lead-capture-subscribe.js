const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { syncBrevoSubscriber } = require("./_lib/brevo");
const { sendEmail } = require("./_lib/email");
const { escapeHtml, renderButton, stripHtml } = require("./_lib/branded-email");
const { getPost } = require("./_lib/blog-cms");
const { createMarketingLead } = require("./_lib/marketing-leads");
const { getLeadMagnetBySlug, createBlogLeadSubmission } = require("./_lib/blog-lead-magnets");

const BREVO_LIST_ID = 17;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function siteBaseUrl() {
  return clean(process.env.SITE_BASE_URL || process.env.URL || "https://tochukwunkwocha.com", 240).replace(/\/$/, "");
}

function absoluteUrl(value) {
  const raw = clean(value, 2000);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${siteBaseUrl()}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function buildPdfEmail(input) {
  const data = input && typeof input === "object" ? input : {};
  const firstName = clean(data.firstName, 120);
  const magnet = data.leadMagnet || {};
  const post = data.post || {};
  const title = clean(magnet.title, 255) || "Your PDF guide";
  const pdfUrl = absoluteUrl(magnet.pdfUrl);
  const intro = clean(magnet.deliveryMessage, 2000) || "Here is the guide I promised. Use it as a quick reference while the article is still fresh.";
  const body = [
    `<p style="margin:0 0 16px;">Hi ${escapeHtml(firstName || "there")},</p>`,
    `<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>`,
    post.blogTitle ? `<p style="margin:0 0 16px;">You requested this after reading: <strong>${escapeHtml(post.blogTitle)}</strong>.</p>` : "",
    renderButton({ href: pdfUrl, label: "Download the PDF" }),
    `<p style="margin:20px 0 0;color:#4b5563;font-size:14px;line-height:1.65;">In about a week, I will start sending you practical AI notes that help you move from reading to building.</p>`,
  ].filter(Boolean).join("");
  return {
    subject: clean(magnet.emailSubject, 255) || `${title} is ready`,
    html: body,
    text: stripHtml(body),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const firstName = clean(body.firstName || body.first_name, 120);
  const email = clean(body.email, 190).toLowerCase();
  const leadMagnetSlug = clean(body.leadMagnetSlug || body.lead_magnet_slug, 255);

  if (!firstName) {
    return json(400, { ok: false, error: "First name is required." });
  }

  if (!EMAIL_RE.test(email)) {
    return json(400, { ok: false, error: "A valid email address is required." });
  }

  let pool;
  let leadMagnet = null;
  let post = null;
  try {
    pool = getPool();
    await applyRuntimeSettings(pool);
    if (leadMagnetSlug) {
      leadMagnet = await getLeadMagnetBySlug(pool, leadMagnetSlug);
      if (!leadMagnet || !leadMagnet.active) {
        return json(404, { ok: false, error: "This PDF offer is no longer available." });
      }
      if (!leadMagnet.pdfUrl) {
        return json(409, { ok: false, error: "This PDF is not ready yet." });
      }
      post = await getPost(pool, { pidBlog: leadMagnet.pidBlog }).catch(() => null);
    }
  } catch (error) {
    return json(500, {
      ok: false,
      error: "Lead capture is not configured correctly.",
    });
  }

  const listId = leadMagnet && leadMagnet.brevoListId ? leadMagnet.brevoListId : BREVO_LIST_ID;
  const pageType = clean(body.pageType || body.page_type, 40) || (leadMagnet ? "blog" : "");
  const source = clean(body.source, 100) || (leadMagnet ? "blog_lead_magnet" : "lead_capture_popup");
  const leadTrack = leadMagnet ? "blog_pdf" : pageType === "blog" ? "blog_newsletter" : pageType || "site";
  const blogSlug = clean((post && post.blogSlug) || body.blogSlug || body.blog_slug, 255);
  const blogPid = clean((post && post.pidBlog) || (leadMagnet && leadMagnet.pidBlog) || body.blogPid || body.blog_pid, 64);
  const leadMagnetPdfUrl = leadMagnet ? absoluteUrl(leadMagnet.pdfUrl) : "";

  const brevoAttributes = {
    JOINED_FROM: source,
    LEAD_TRACK: leadTrack,
    BLOG_SLUG: blogSlug,
    BLOG_TITLE: clean((post && post.blogTitle) || body.blogTitle || body.blog_title, 255),
    LEAD_MAGNET_SLUG: leadMagnet ? leadMagnet.slug : "",
    LEAD_MAGNET_TITLE: leadMagnet ? leadMagnet.title : "",
    PDF_URL: leadMagnetPdfUrl,
    UTM_SOURCE: clean(body.utmSource || body.utm_source, 190),
    UTM_CAMPAIGN: clean(body.utmCampaign || body.utm_campaign, 190),
    FBCLID: clean(body.fbclid, 190),
    LAST_CAPTURED_AT: new Date().toISOString(),
  };

  const brevo = await syncBrevoSubscriber({
    fullName: firstName,
    email,
    listId,
    attributes: brevoAttributes,
  });

  if (!brevo.ok) {
    return json(502, {
      ok: false,
      error: brevo.error || "Could not subscribe right now.",
    });
  }

  try {
    const marketingLead = await createMarketingLead(pool, {
      firstName,
      email,
      listId,
      source,
      pageType,
      pageUrl: clean(body.pageUrl || body.page_url, 2000),
      pathname: clean(body.pathname, 500),
      referrer: clean(body.referrer, 2000),
      utmSource: clean(body.utmSource || body.utm_source, 190),
      utmMedium: clean(body.utmMedium || body.utm_medium, 190),
      utmCampaign: clean(body.utmCampaign || body.utm_campaign, 190),
      utmContent: clean(body.utmContent || body.utm_content, 190),
      utmTerm: clean(body.utmTerm || body.utm_term, 190),
      fbclid: clean(body.fbclid, 2000),
      fbp: clean(body.fbp, 190),
      fbc: clean(body.fbc, 190),
      leadTrack,
      blogPid,
      blogSlug,
      leadMagnetSlug: leadMagnet ? leadMagnet.slug : "",
      leadMagnetTitle: leadMagnet ? leadMagnet.title : "",
      pdfUrl: leadMagnetPdfUrl,
    });
    if (leadMagnet) {
      await createBlogLeadSubmission(pool, {
        magnetUuid: leadMagnet.magnetUuid,
        pidBlog: leadMagnet.pidBlog,
        firstName,
        email,
        marketingLeadUuid: marketingLead.leadUuid,
        listId,
        source,
        pageType,
        pageUrl: clean(body.pageUrl || body.page_url, 2000),
        pathname: clean(body.pathname, 500),
        referrer: clean(body.referrer, 2000),
        utmSource: clean(body.utmSource || body.utm_source, 190),
        utmMedium: clean(body.utmMedium || body.utm_medium, 190),
        utmCampaign: clean(body.utmCampaign || body.utm_campaign, 190),
        utmContent: clean(body.utmContent || body.utm_content, 190),
        utmTerm: clean(body.utmTerm || body.utm_term, 190),
        fbclid: clean(body.fbclid, 2000),
        fbp: clean(body.fbp, 190),
        fbc: clean(body.fbc, 190),
      });
    }
  } catch (error) {
    console.error("Marketing lead save failed", error);
    return json(500, {
      ok: false,
      code: "MARKETING_LEAD_SAVE_FAILED",
      error: "We could not save your subscription details. Please try again.",
    });
  }

  let deliveryEmailSent = false;
  if (leadMagnet && leadMagnetPdfUrl) {
    try {
      const mail = buildPdfEmail({ firstName, leadMagnet: Object.assign({}, leadMagnet, { pdfUrl: leadMagnetPdfUrl }), post });
      await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
      deliveryEmailSent = true;
    } catch (error) {
      console.error("blog_lead_magnet_delivery_email_failed", error && error.message ? error.message : error);
    }
  }

  return json(200, {
    ok: true,
    listId,
    message: leadMagnet ? "Subscription successful. Your PDF is ready." : "Subscription successful.",
    leadMagnet: leadMagnet ? {
      title: leadMagnet.title,
      slug: leadMagnet.slug,
      pdfUrl: leadMagnetPdfUrl,
      deliveryEmailSent,
    } : null,
  });
};
