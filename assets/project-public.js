(function () {
  function clean(value, max) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  function cleanHtml(value, max) {
    return String(value || "").trim().slice(0, max);
  }

  function isRenderableHtmlDocument(html) {
    const doc = cleanHtml(html, 600000);
    if (!doc) return false;
    if (doc.startsWith("{") || doc.startsWith("[")) return false;
    if (!/<html[\s>]/i.test(doc) || !/<body[\s>]/i.test(doc)) return false;
    if (!/(<h1[\s>]|<section[\s>]|<main[\s>]|<div[\s>])/i.test(doc)) return false;
    return true;
  }

  function splitOfferAndTestimonials(rawOffer, rawTestimonials) {
    const offerText = clean(rawOffer, 5000);
    const testimonialsText = clean(rawTestimonials, 5000);
    if (testimonialsText) {
      return { offer: offerText, testimonials: testimonialsText };
    }

    const marker = /testimonials?\s*:\s*/i;
    if (marker.test(offerText)) {
      const parts = offerText.split(marker);
      return {
        offer: clean(parts[0], 1200),
        testimonials: clean(parts.slice(1).join(" "), 3000),
      };
    }

    return { offer: offerText, testimonials: "" };
  }

  function clampSentence(text, max) {
    const raw = clean(text, 6000);
    if (!raw) return "";
    if (raw.length <= max) return raw;
    const cut = raw.slice(0, max);
    const stop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
    if (stop >= 60) return cut.slice(0, stop + 1).trim();
    return `${cut.trim()}...`;
  }

  function currentProjectId() {
    const qs = new URLSearchParams(window.location.search || "");
    const fromQuery = String(qs.get("job_uuid") || "").trim();
    if (fromQuery) return fromQuery;

    const path = String(window.location.pathname || "");
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === "projects" && parts[1] !== "index.html") return parts[1];
    return "";
  }

  function currentAccessToken() {
    const qs = new URLSearchParams(window.location.search || "");
    return String(qs.get("access") || qs.get("token") || "").trim();
  }

  async function loadProject() {
    const jobUuid = currentProjectId();
    if (!jobUuid) return;
    const accessToken = currentAccessToken();

    const headlineEl = document.getElementById("projectHeadline");
    const labelEl = document.getElementById("projectLabel");
    const subheadlineEl = document.getElementById("projectSubheadline");
    const ctaEl = document.getElementById("projectCta");
    const offerEl = document.getElementById("projectOffer");
    const testimonialsEl = document.getElementById("projectTestimonials");
    const contactNoteEl = document.getElementById("projectContactNote");

    try {
      const url = new URL("/.netlify/functions/leadpage-project-public", window.location.origin);
      url.searchParams.set("job_uuid", jobUuid);
      if (accessToken) {
        url.searchParams.set("access", accessToken);
      }
      const res = await fetch(url.toString(), { method: "GET" });
      const json = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Project not found");
      }

      const renderedHtml = cleanHtml(json.renderedHtml, 600000);
      if (isRenderableHtmlDocument(renderedHtml) && renderedHtml.length > 120) {
        try {
          document.open();
          document.write(renderedHtml);
          document.close();
          return;
        } catch (_error) {}
      }

      const project = json.project || {};
      const content = json.content || {};
      const split = splitOfferAndTestimonials(content.offer, content.testimonials);
      const headline = clean(content.headline, 180) || clean(project.businessName, 180) || "Project Page";
      const subheadline = clampSentence(content.subheadline, 320);
      const offer = clampSentence(split.offer, 620);
      const testimonials = clampSentence(split.testimonials, 900);
      const contactNote = clampSentence(content.contactNote, 320);
      const cta = clean(content.cta, 80) || "Contact Us";

      if (labelEl) labelEl.textContent = String(project.businessName || "Project");
      if (headlineEl) headlineEl.textContent = headline;
      if (subheadlineEl) subheadlineEl.textContent = subheadline;
      if (offerEl) offerEl.textContent = offer;
      if (ctaEl) ctaEl.textContent = cta;
      if (testimonialsEl) {
        testimonialsEl.textContent = testimonials || "No testimonials available yet.";
      }
      if (contactNoteEl) {
        contactNoteEl.textContent = contactNote || "Please reach out for more details.";
      }
      document.title = `${String(project.businessName || "Project")} | Offer Page`;
    } catch (_error) {
      if (headlineEl) headlineEl.textContent = "Project page unavailable";
      if (subheadlineEl) {
        subheadlineEl.textContent =
          "This page is not published yet or the link is invalid. Please contact support if you need help.";
      }
    }
  }

  loadProject();
})();
