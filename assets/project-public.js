(function () {
  function currentProjectId() {
    const path = String(window.location.pathname || "");
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === "projects") return parts[1];
    const qs = new URLSearchParams(window.location.search || "");
    return String(qs.get("job_uuid") || "").trim();
  }

  async function loadProject() {
    const jobUuid = currentProjectId();
    if (!jobUuid) return;

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
      const res = await fetch(url.toString(), { method: "GET" });
      const json = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Project not found");
      }

      const project = json.project || {};
      const content = json.content || {};

      if (labelEl) labelEl.textContent = String(project.businessName || "Project");
      if (headlineEl) headlineEl.textContent = String(content.headline || project.businessName || "Project Page");
      if (subheadlineEl) subheadlineEl.textContent = String(content.subheadline || "");
      if (offerEl) offerEl.textContent = String(content.offer || "");
      if (ctaEl) ctaEl.textContent = String(content.cta || "Contact Us");
      if (testimonialsEl) {
        testimonialsEl.textContent = String(content.testimonials || "No testimonials available yet.");
      }
      if (contactNoteEl) {
        contactNoteEl.textContent = String(content.contactNote || "Please reach out for more details.");
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
