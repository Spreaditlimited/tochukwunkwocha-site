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
  const buildNoticeEl = document.getElementById("dashboardBuildNotice");
  const buildNoticeTextEl = document.getElementById("dashboardBuildNoticeText");
  const eventsEl = document.getElementById("dashboardEvents");
  const domainStatusEl = document.getElementById("dashboardDomainStatus");
  const domainProviderEl = document.getElementById("dashboardDomainProvider");
  const domainOrderEl = document.getElementById("dashboardDomainOrder");
  const domainModeBadgeEl = document.getElementById("dashboardDomainModeBadge");
  const integrationsForm = document.getElementById("dashboardIntegrationsForm");
  const integrationsSaveBtn = document.getElementById("dashboardIntegrationsSaveBtn");
  const integrationsErrorEl = document.getElementById("dashboardIntegrationsError");
  const integrationsStateEl = document.getElementById("dashboardIntegrationsState");
  const domainInput = document.getElementById("dashboardDomainInput");
  const suggestDomainBtn = document.getElementById("dashboardSuggestDomainBtn");
  const checkDomainBtn = document.getElementById("dashboardCheckDomainBtn");
  const registerDomainBtn = document.getElementById("dashboardRegisterDomainBtn");
  const domainMessageEl = document.getElementById("dashboardDomainMessage");
  const form = document.getElementById("dashboardContentForm");
  const formErrorEl = document.getElementById("dashboardFormError");
  const saveBtn = document.getElementById("dashboardSaveBtn");
  const publishBtn = document.getElementById("dashboardPublishBtn");
  let buildKickoffRequested = false;

  function setFormError(message) {
    if (!formErrorEl) return;
    formErrorEl.textContent = String(message || "");
  }

  function setDomainMessage(message, type) {
    if (!domainMessageEl) return;
    domainMessageEl.textContent = String(message || "");
    domainMessageEl.style.color = type === "error" ? "#b91c1c" : "#22345f";
  }

  function setIntegrationsError(message) {
    if (!integrationsErrorEl) return;
    integrationsErrorEl.textContent = String(message || "");
  }

  function renderIntegrationsState(project) {
    if (!integrationsStateEl) return;
    const p = project && typeof project === "object" ? project : {};
    const netlifyReady = !!(p.hasNetlifyApiToken && p.netlifySiteId);
    const brevoReady = !!(p.hasBrevoApiKey && p.brevoListId);
    integrationsStateEl.textContent = `Netlify: ${
      netlifyReady ? "Ready" : "Missing credentials"
    } | Brevo: ${brevoReady ? "Ready" : "Missing credentials"}`;
    integrationsStateEl.style.color = netlifyReady && brevoReady ? "#065f46" : "#6b7280";
  }

  function renderBuildNotice(project) {
    if (!buildNoticeEl || !buildNoticeTextEl) return;
    const status = String((project && project.status) || "").toLowerCase();
    const id = encodeURIComponent((project && project.jobUuid) || jobUuid);
    const token = encodeURIComponent(accessToken);
    const previewPath = `/projects/${id}?access=${token}`;
    if (!status) {
      buildNoticeEl.style.display = "none";
      return;
    }

    if (status === "details_pending" || status === "details_complete" || status === "copy_generated") {
      buildNoticeTextEl.innerHTML =
        "We are building your landing page now. Keep this dashboard open and refreshes will show each stage.";
      buildNoticeEl.style.display = "block";
      return;
    }

    if (status === "page_built" || status === "qa_passed" || status === "delivered") {
      buildNoticeTextEl.innerHTML = [
        "Your landing page build is ready. ",
        `<a href="${previewPath}" target="_blank" rel="noopener noreferrer" class="font-semibold underline decoration-dotted">Open temporary preview URL</a>`,
      ].join("");
      buildNoticeEl.style.display = "block";
      return;
    }

    buildNoticeEl.style.display = "none";
  }

  function shouldStartBuild(project) {
    const p = project && typeof project === "object" ? project : {};
    const paymentPaid = String(p.paymentStatus || "").toLowerCase() === "paid";
    const status = String(p.status || "").toLowerCase();
    return paymentPaid && (status === "details_pending" || status === "details_complete");
  }

  async function startBuild() {
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, 60000);
    let res;
    try {
      res = await fetch("/.netlify/functions/leadpage-client-start-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobUuid,
          accessToken,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("Build request timed out. Please refresh and try again.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not start build");
    }
    return json;
  }

  function renderDomainModeBadge(mode) {
    if (!domainModeBadgeEl) return;
    const value = String(mode || "").toLowerCase();
    if (value === "live") {
      domainModeBadgeEl.textContent = "Registrar Mode: Live (real purchase)";
      domainModeBadgeEl.style.color = "#9a3412";
      return;
    }
    if (value === "sandbox") {
      domainModeBadgeEl.textContent = "Registrar Mode: Sandbox (test mode)";
      domainModeBadgeEl.style.color = "#1d4ed8";
      return;
    }
    if (value === "mock") {
      domainModeBadgeEl.textContent = "Registrar Mode: Mock (simulation only)";
      domainModeBadgeEl.style.color = "#6b7280";
      return;
    }
    domainModeBadgeEl.textContent = "Registrar Mode: --";
    domainModeBadgeEl.style.color = "#6b7280";
  }

  function requireAccess() {
    if (jobUuid && accessToken) return true;
    if (projectMetaEl) projectMetaEl.textContent = "Invalid dashboard link. Please use the access link from your payment confirmation.";
    setFormError("Missing dashboard access parameters.");
    if (saveBtn) saveBtn.disabled = true;
    if (publishBtn) publishBtn.disabled = true;
    return false;
  }

  function fillContentForm(content, project) {
    if (!form) return;
    const base = fallbackContent(project);
    const current = content && typeof content === "object" ? content : {};
    form.headline.value = String(current.headline || base.headline || "");
    form.subheadline.value = String(current.subheadline || base.subheadline || "");
    form.offer.value = String(current.offer || base.offer || "");
    form.cta.value = String(current.cta || base.cta || "");
    form.testimonials.value = String(current.testimonials || base.testimonials || "");
    form.contactNote.value = String(current.contactNote || base.contactNote || "");
    if (form.facebookPixelId) form.facebookPixelId.value = String((project && project.facebookPixelId) || "");
    if (form.googleTagId) form.googleTagId.value = String((project && project.googleTagId) || "");
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

  function sanitizeDomainInput(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0];
  }

  async function suggestDomain(preferredName) {
    const res = await fetch("/.netlify/functions/leadpage-client-domain-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobUuid,
        accessToken,
        preferredName,
      }),
    });
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not suggest domain");
    }
    return json;
  }

  async function checkDomain(domainName) {
    const res = await fetch("/.netlify/functions/leadpage-client-domain-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobUuid,
        accessToken,
        domainName,
      }),
    });
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not check domain");
    }
    return json;
  }

  async function registerDomain(domainName) {
    const res = await fetch("/.netlify/functions/leadpage-client-domain-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobUuid,
        accessToken,
        domainName,
        years: 1,
      }),
    });
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not register domain");
    }
    return json;
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
        `Publishing quota for this project is running low (${data.globalEstimatedCreditsRemaining} estimated credits remaining this month).`
      );
    }
    if (data.globalCreditsExhausted) {
      notices.push("Publishing is temporarily paused because monthly hosting quota is exhausted for this project.");
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
        const published = String(project.publishedUrl || "").trim();
        if (published) {
          publishedUrlEl.innerHTML = `<a href="${published}" target="_blank" rel="noopener noreferrer" class="underline decoration-dotted">${published}</a>`;
        } else {
          publishedUrlEl.textContent = "--";
        }
      }
      if (domainStatusEl) domainStatusEl.textContent = String(project.domainStatus || "--");
      if (domainProviderEl) domainProviderEl.textContent = String(project.domainProvider || "--");
      if (domainOrderEl) domainOrderEl.textContent = String(project.domainOrderId || "--");
      renderDomainModeBadge(project.domainRegistrarMode || "");
      if (domainInput && project.domainName) {
        domainInput.value = String(project.domainName || "").trim().toLowerCase();
      }
      const intakeHasDomain = String(project.domainStatus || "").toLowerCase() === "has_domain";
      const alreadyRegistered = String(project.domainStatus || "").toLowerCase() === "registered";
      const inProgress = String(project.domainStatus || "").toLowerCase() === "registration_in_progress";
      if (suggestDomainBtn) suggestDomainBtn.disabled = intakeHasDomain || inProgress;
      if (checkDomainBtn) checkDomainBtn.disabled = intakeHasDomain || inProgress;
      if (registerDomainBtn) registerDomainBtn.disabled = intakeHasDomain || alreadyRegistered || inProgress;
      if (domainInput) domainInput.disabled = intakeHasDomain;
      if (intakeHasDomain) {
        setDomainMessage("You already provided a domain at intake, so domain purchase is disabled for this project.", "ok");
      } else if (alreadyRegistered) {
        setDomainMessage("Domain is already registered for this project.", "ok");
      } else if (inProgress) {
        setDomainMessage("Domain registration is currently in progress. Please wait.", "ok");
      }
      if (integrationsForm) {
        if (integrationsForm.netlifySiteId) integrationsForm.netlifySiteId.value = String(project.netlifySiteId || "");
        if (integrationsForm.brevoListId) integrationsForm.brevoListId.value = String(project.brevoListId || "");
      }
      renderIntegrationsState(project);
      renderBuildNotice(project);
      renderUsage(json.usage, project);
      fillContentForm(json.content || fallbackContent(project), project);
      renderEvents(json.events || []);

      if (shouldStartBuild(project) && !buildKickoffRequested) {
        buildKickoffRequested = true;
        setFormError("We are building your landing page now...");
        try {
          await startBuild();
        } catch (error) {
          buildKickoffRequested = false;
          setFormError(error.message || "Could not start build");
        }
        await loadDashboard();
      }
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

      const facebookPixelId = String((form.facebookPixelId && form.facebookPixelId.value) || "").trim();
      const googleTagId = String((form.googleTagId && form.googleTagId.value) || "").trim();

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
            facebookPixelId,
            googleTagId,
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

  if (integrationsForm) {
    integrationsForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!requireAccess()) return;
      setIntegrationsError("");

      const payload = {
        jobUuid,
        accessToken,
        netlifySiteId: String((integrationsForm.netlifySiteId && integrationsForm.netlifySiteId.value) || "").trim(),
        netlifyApiToken: String((integrationsForm.netlifyApiToken && integrationsForm.netlifyApiToken.value) || "").trim(),
        brevoListId: String((integrationsForm.brevoListId && integrationsForm.brevoListId.value) || "").trim(),
        brevoApiKey: String((integrationsForm.brevoApiKey && integrationsForm.brevoApiKey.value) || "").trim(),
      };
      if (!payload.netlifySiteId && !payload.netlifyApiToken && !payload.brevoListId && !payload.brevoApiKey) {
        setIntegrationsError("Enter at least one credential field before saving.");
        return;
      }

      integrationsSaveBtn.disabled = true;
      integrationsSaveBtn.textContent = "Saving...";
      try {
        const res = await fetch("/.netlify/functions/leadpage-client-save-integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(function () {
          return null;
        });
        if (!res.ok || !json || !json.ok) {
          throw new Error((json && json.error) || "Could not save credentials");
        }
        setIntegrationsError("Credentials saved successfully.");
        if (integrationsForm.netlifyApiToken) integrationsForm.netlifyApiToken.value = "";
        if (integrationsForm.brevoApiKey) integrationsForm.brevoApiKey.value = "";
        await loadDashboard();
      } catch (error) {
        setIntegrationsError(error.message || "Could not save credentials");
      } finally {
        integrationsSaveBtn.disabled = false;
        integrationsSaveBtn.textContent = "Save Credentials";
      }
    });
  }

  if (suggestDomainBtn) {
    suggestDomainBtn.addEventListener("click", async function () {
      if (!requireAccess()) return;
      setDomainMessage("", "");
      const preferredName = sanitizeDomainInput(domainInput ? domainInput.value : "");
      suggestDomainBtn.disabled = true;
      suggestDomainBtn.textContent = "Suggesting...";
      try {
        const result = await suggestDomain(preferredName);
        const current = preferredName;
        const available = Array.isArray(result.suggestions)
          ? result.suggestions
              .filter(function (x) {
                return x && x.available && x.domainName;
              })
              .map(function (x) {
                return String(x.domainName || "").trim().toLowerCase();
              })
          : [];
        const pick =
          available.find(function (name) {
            return name && name !== current;
          }) || String(result.firstAvailable || "").trim().toLowerCase();
        if (domainInput && pick) domainInput.value = pick;
        if (pick) {
          setDomainMessage(`Suggestion ready: ${pick}`, "ok");
        } else {
          setDomainMessage("No available domain found in current suggestions.", "error");
        }
        await loadDashboard();
      } catch (error) {
        setDomainMessage(error.message || "Could not suggest domain", "error");
      } finally {
        suggestDomainBtn.disabled = false;
        suggestDomainBtn.textContent = "Suggest";
      }
    });
  }

  if (checkDomainBtn) {
    checkDomainBtn.addEventListener("click", async function () {
      if (!requireAccess()) return;
      setDomainMessage("", "");
      const domainName = sanitizeDomainInput(domainInput ? domainInput.value : "");
      if (!domainName) {
        setDomainMessage("Enter a domain name first.", "error");
        return;
      }
      if (domainInput) domainInput.value = domainName;
      checkDomainBtn.disabled = true;
      checkDomainBtn.textContent = "Checking...";
      try {
        const result = await checkDomain(domainName);
        setDomainMessage(
          result.available ? `${domainName} is available.` : `${domainName} is not available.`,
          result.available ? "ok" : "error"
        );
        await loadDashboard();
      } catch (error) {
        setDomainMessage(error.message || "Could not check domain", "error");
      } finally {
        checkDomainBtn.disabled = false;
        checkDomainBtn.textContent = "Check";
      }
    });
  }

  if (registerDomainBtn) {
    registerDomainBtn.addEventListener("click", async function () {
      if (!requireAccess()) return;
      setDomainMessage("", "");
      const domainName = sanitizeDomainInput(domainInput ? domainInput.value : "");
      if (!domainName) {
        setDomainMessage("Enter a domain name first.", "error");
        return;
      }
      if (domainInput) domainInput.value = domainName;

      const confirmed = window.confirm(
        `Register domain "${domainName}" now? This can trigger a real registrar purchase if configured.`
      );
      if (!confirmed) return;

      registerDomainBtn.disabled = true;
      registerDomainBtn.textContent = "Registering...";
      try {
        const result = await registerDomain(domainName);
        const orderId = String(result.orderId || "").trim();
        setDomainMessage(
          orderId ? `Domain registered successfully. Order ID: ${orderId}` : "Domain registered successfully.",
          "ok"
        );
        await loadDashboard();
      } catch (error) {
        setDomainMessage(error.message || "Could not register domain", "error");
      } finally {
        registerDomainBtn.disabled = false;
        registerDomainBtn.textContent = "Register";
      }
    });
  }

  loadDashboard();
})();
