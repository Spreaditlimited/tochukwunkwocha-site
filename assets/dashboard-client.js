(function () {
  const qs = new URLSearchParams(window.location.search || "");
  const jobUuid = String(qs.get("job_uuid") || "").trim();
  const accessToken = String(qs.get("access") || "").trim();

  const projectMetaEl = document.getElementById("dashboardProjectMeta");
  const paymentStatusEl = document.getElementById("dashboardPaymentStatus");
  const buildStatusEl = document.getElementById("dashboardBuildStatus");
  const publishStatusEl = document.getElementById("dashboardPublishStatus");
  const publishedUrlEl = document.getElementById("dashboardPublishedUrl");
  const usageStatsEl = document.getElementById("dashboardUsageStats");
  const usageNoticeEl = document.getElementById("dashboardUsageNotice");
  const usageNoticeTextEl = document.getElementById("dashboardUsageNoticeText");
  const eventsEl = document.getElementById("dashboardEvents");
  const form = document.getElementById("dashboardContentForm");
  const formErrorEl = document.getElementById("dashboardFormError");
  const saveBtn = document.getElementById("dashboardSaveBtn");
  const publishBtn = document.getElementById("dashboardPublishBtn");

  function setFormError(message) {
    if (!formErrorEl) return;
    formErrorEl.textContent = String(message || "");
  }

  function requireAccess() {
    if (jobUuid && accessToken) return true;
    if (projectMetaEl) projectMetaEl.textContent = "Invalid dashboard link. Please use the access link from your payment confirmation.";
    setFormError("Missing dashboard access parameters.");
    if (saveBtn) saveBtn.disabled = true;
    if (publishBtn) publishBtn.disabled = true;
    return false;
  }

  function fillContentForm(content) {
    if (!form || !content) return;
    form.headline.value = String(content.headline || "");
    form.subheadline.value = String(content.subheadline || "");
    form.offer.value = String(content.offer || "");
    form.cta.value = String(content.cta || "");
    form.testimonials.value = String(content.testimonials || "");
    form.contactNote.value = String(content.contactNote || "");
  }

  function fallbackContent(project) {
    return {
      headline: project && project.serviceOffer ? project.serviceOffer : "",
      subheadline: project && project.primaryGoal ? project.primaryGoal : "",
      offer: project && project.notes ? project.notes : "",
      cta: project && project.ctaText ? project.ctaText : "",
      testimonials: "",
      contactNote: "",
    };
  }

  function renderEvents(events) {
    if (!eventsEl) return;
    if (!Array.isArray(events) || !events.length) {
      eventsEl.textContent = "No activity yet.";
      return;
    }
    const html = events
      .map(function (item) {
        const when = item && item.created_at ? new Date(item.created_at).toLocaleString() : "";
        const note = item && item.event_note ? String(item.event_note) : String(item.event_type || "update");
        return `<p style="margin-bottom:8px"><strong>${note}</strong><br/><span style="color:#6b7280">${when}</span></p>`;
      })
      .join("");
    eventsEl.innerHTML = html;
  }

  function renderUsage(usage, project) {
    const data = usage && typeof usage === "object" ? usage : null;
    if (!data) {
      if (usageStatsEl) usageStatsEl.textContent = "Monthly publish usage: --";
      if (usageNoticeEl) usageNoticeEl.style.display = "none";
      return;
    }

    if (usageStatsEl) {
      usageStatsEl.textContent = `Monthly publish usage: ${data.clientPublishedThisMonth}/${data.perClientLimit}`;
    }

    const notices = [];
    if (data.clientLimitReached) {
      notices.push("You have reached your monthly publish limit for this project.");
    }
    if (data.globalCreditWarning) {
      notices.push(
        `Platform credits are running low (${data.globalEstimatedCreditsRemaining} estimated credits remaining this month).`
      );
    }
    if (data.globalCreditsExhausted) {
      notices.push("Publishing is temporarily paused because monthly platform credits are exhausted.");
    }
    if (data.warningMessage) {
      notices.push(data.warningMessage);
    }

    if (usageNoticeEl && usageNoticeTextEl) {
      if (notices.length) {
        usageNoticeTextEl.textContent = notices.join(" ");
        usageNoticeEl.style.display = "block";
      } else {
        usageNoticeEl.style.display = "none";
      }
    }

    if (publishBtn) {
      const publishEnabled = !!(project && project.publishEnabled);
      const canPublish = !!data.canPublish;
      publishBtn.disabled = !publishEnabled || !canPublish;
      if (!publishEnabled) {
        publishBtn.title = "Publishing will be enabled after first publish by admin.";
      } else if (!canPublish) {
        publishBtn.title = data.warningMessage || "Publishing is unavailable right now.";
      } else {
        publishBtn.removeAttribute("title");
      }
    }
  }

  async function loadDashboard() {
    if (!requireAccess()) return;
    setFormError("");
    try {
      const url = new URL("/.netlify/functions/leadpage-client-dashboard", window.location.origin);
      url.searchParams.set("job_uuid", jobUuid);
      url.searchParams.set("access", accessToken);
      const res = await fetch(url.toString(), { method: "GET" });
      const json = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not load dashboard");
      }
      const project = json.project || {};
      if (projectMetaEl) {
        projectMetaEl.textContent = `${project.businessName || "Project"} • ${project.jobUuid || ""}`;
      }
      if (paymentStatusEl) paymentStatusEl.textContent = `Payment: ${project.paymentStatus || "--"}`;
      if (buildStatusEl) buildStatusEl.textContent = `Build status: ${project.status || "--"}`;
      if (publishStatusEl) publishStatusEl.textContent = `Publish status: ${project.publishStatus || "--"}`;
      if (publishedUrlEl) {
        const previewRoute = `/projects/${project.jobUuid || jobUuid}`;
        publishedUrlEl.textContent = project.publishedUrl
          ? `Published URL: ${project.publishedUrl} (Preview route: ${previewRoute})`
          : `Preview route: ${previewRoute}`;
      }
      renderUsage(json.usage, project);
      fillContentForm(json.content || fallbackContent(project));
      renderEvents(json.events || []);
    } catch (error) {
      setFormError(error.message || "Could not load dashboard");
    }
  }

  if (form) {
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!requireAccess()) return;
      setFormError("");

      const content = {
        headline: String(form.headline.value || "").trim(),
        subheadline: String(form.subheadline.value || "").trim(),
        offer: String(form.offer.value || "").trim(),
        cta: String(form.cta.value || "").trim(),
        testimonials: String(form.testimonials.value || "").trim(),
        contactNote: String(form.contactNote.value || "").trim(),
      };

      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      try {
        const res = await fetch("/.netlify/functions/leadpage-client-save-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobUuid,
            accessToken,
            content,
          }),
        });
        const json = await res.json().catch(function () {
          return null;
        });
        if (!res.ok || !json || !json.ok) {
          throw new Error((json && json.error) || "Could not save content");
        }
        setFormError("Saved successfully.");
        loadDashboard();
      } catch (error) {
        setFormError(error.message || "Could not save content");
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Changes";
      }
    });
  }

  if (publishBtn) {
    publishBtn.addEventListener("click", async function () {
      if (!requireAccess()) return;
      setFormError("");
      publishBtn.disabled = true;
      publishBtn.textContent = "Publishing...";
      try {
        const res = await fetch("/.netlify/functions/leadpage-client-publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobUuid,
            accessToken,
          }),
        });
        const json = await res.json().catch(function () {
          return null;
        });
        if (!res.ok || !json || !json.ok) {
          throw new Error((json && json.error) || "Could not publish now");
        }
        setFormError("Publish triggered successfully.");
        renderUsage(json.usage, { publishEnabled: true });
        loadDashboard();
      } catch (error) {
        setFormError(error.message || "Could not publish now");
      } finally {
        publishBtn.disabled = false;
        publishBtn.textContent = "Publish Updates";
      }
    });
  }

  loadDashboard();
})();
