(function () {
  var CERTIFICATE_PROOF_MARKER = "[CERTIFICATE_PROOF_WEBSITE]";
  var courseFilterEl = document.getElementById("supportCourseFilter");
  var featureAssignmentsEnabledEl = document.getElementById("featureAssignmentsEnabled");
  var featureCommunityEnabledEl = document.getElementById("featureCommunityEnabled");
  var featureTutorQuestionsEnabledEl = document.getElementById("featureTutorQuestionsEnabled");
  var featureAlumniModeEl = document.getElementById("featureAlumniMode");
  var featureCertificateProofRequiredEl = document.getElementById("featureCertificateProofRequired");
  var featureCertificateProofTypeEl = document.getElementById("featureCertificateProofType");
  var saveFeatureBtnEl = document.getElementById("saveFeatureBtn");
  var featureMessageEl = document.getElementById("featureMessage");

  var searchInputEl = document.getElementById("assignmentSearchInput");
  var statusFilterEl = document.getElementById("assignmentStatusFilter");
  var refreshBtnEl = document.getElementById("assignmentRefreshBtn");
  var messageEl = document.getElementById("supportMessage");
  var countEl = document.getElementById("assignmentCount");
  var rowsEl = document.getElementById("assignmentRows");

  var modalEl = document.getElementById("assignmentModal");
  var modalBackdropEl = document.getElementById("assignmentModalBackdrop");
  var modalCloseEl = document.getElementById("assignmentModalClose");
  var modalSaveEl = document.getElementById("assignmentModalSave");
  var modalTitleEl = document.getElementById("assignmentModalTitle");
  var modalBodyEl = document.getElementById("assignmentModalBody");
  var modalAttachmentsEl = document.getElementById("assignmentModalAttachments");
  var modalStatusEl = document.getElementById("assignmentModalStatus");
  var modalFeedbackEl = document.getElementById("assignmentModalFeedback");

  var state = {
    courses: [],
    selectedCourse: "",
    items: [],
    activeItem: null,
  };

  function clean(value, max) {
    var out = String(value || "").trim();
    if (Number.isFinite(max) && max > 0) return out.slice(0, max);
    return out;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtDate(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "-";
    return d.toLocaleString();
  }

  function setMessage(text, bad) {
    if (!messageEl) return;
    messageEl.textContent = clean(text, 400);
    messageEl.className = "text-xs sm:text-sm " + (bad ? "text-red-600" : "text-gray-500");
  }

  function setFeatureMessage(text, bad) {
    if (!featureMessageEl) return;
    featureMessageEl.textContent = clean(text, 300);
    featureMessageEl.className = "text-xs sm:text-sm " + (bad ? "text-red-600" : "text-gray-500");
  }

  function syncCertificateProofControls() {
    if (!featureCertificateProofTypeEl) return;
    var required = !!(featureCertificateProofRequiredEl && featureCertificateProofRequiredEl.checked);
    featureCertificateProofTypeEl.disabled = !required;
    if (!required) featureCertificateProofTypeEl.value = "website_link";
  }

  async function api(url, init) {
    var response = await fetch(url, Object.assign({
      credentials: "include",
      headers: { Accept: "application/json" },
    }, init || {}));
    var data = await response.json().catch(function () {
      return null;
    });
    if (response.status === 401) {
      window.location.href = "/internal/?next=" + encodeURIComponent(window.location.pathname);
      throw new Error("Not signed in");
    }
    if (!response.ok || !data || data.ok !== true) {
      throw new Error((data && data.error) || "Request failed");
    }
    return data;
  }

  function renderCourseOptions() {
    if (!courseFilterEl) return;
    var options = (state.courses || []).map(function (item) {
      var slug = clean(item && item.slug, 120).toLowerCase();
      var label = clean(item && item.label, 220) || slug;
      return '<option value="' + escapeHtml(slug) + '">' + escapeHtml(label) + '</option>';
    });
    courseFilterEl.innerHTML = options.join("");
    if (state.selectedCourse) courseFilterEl.value = state.selectedCourse;
    if (!clean(courseFilterEl.value, 120) && courseFilterEl.options.length) {
      courseFilterEl.value = clean(courseFilterEl.options[0].value, 120).toLowerCase();
    }
    state.selectedCourse = clean(courseFilterEl.value, 120).toLowerCase();
  }

  async function loadCourses() {
    var data = await api("/.netlify/functions/admin-course-slugs-list");
    state.courses = Array.isArray(data.items) ? data.items : [];
    if (!state.courses.length) throw new Error("No courses configured.");
    if (!state.selectedCourse) state.selectedCourse = clean(state.courses[0].slug, 120).toLowerCase();
    renderCourseOptions();
  }

  async function loadCourseFeatures() {
    var slug = clean(state.selectedCourse, 120).toLowerCase();
    if (!slug) return;
    var data = await api("/.netlify/functions/admin-learning-course-features?course_slug=" + encodeURIComponent(slug));
    var features = data && data.features ? data.features : {};
    if (featureAssignmentsEnabledEl) featureAssignmentsEnabledEl.checked = !!features.assignments_enabled;
    if (featureCommunityEnabledEl) featureCommunityEnabledEl.checked = !!features.course_community_enabled;
    if (featureTutorQuestionsEnabledEl) featureTutorQuestionsEnabledEl.value = features.tutor_questions_enabled ? "1" : "0";
    if (featureAlumniModeEl) featureAlumniModeEl.value = clean(features.alumni_participation_mode, 24) || "none";
    if (featureCertificateProofRequiredEl) featureCertificateProofRequiredEl.checked = !!features.certificate_proof_required;
    if (featureCertificateProofTypeEl) featureCertificateProofTypeEl.value = clean(features.certificate_proof_type, 24) || "website_link";
    syncCertificateProofControls();
  }

  async function saveCourseFeatures() {
    var slug = clean(state.selectedCourse, 120).toLowerCase();
    if (!slug) return;
    setFeatureMessage("Saving feature settings...", false);
    var payload = await api("/.netlify/functions/admin-learning-course-features", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        course_slug: slug,
        assignments_enabled: !!(featureAssignmentsEnabledEl && featureAssignmentsEnabledEl.checked),
        course_community_enabled: !!(featureCommunityEnabledEl && featureCommunityEnabledEl.checked),
        tutor_questions_enabled: featureTutorQuestionsEnabledEl && featureTutorQuestionsEnabledEl.value === "1",
        alumni_participation_mode: clean(featureAlumniModeEl && featureAlumniModeEl.value, 24) || "none",
        certificate_proof_required: !!(featureCertificateProofRequiredEl && featureCertificateProofRequiredEl.checked),
        certificate_proof_type: clean(featureCertificateProofTypeEl && featureCertificateProofTypeEl.value, 24) || "website_link",
      }),
    });
    setFeatureMessage("Saved feature settings for " + slug + ".", false);
    return payload;
  }

  function renderRows() {
    if (!rowsEl) return;
    var items = Array.isArray(state.items) ? state.items : [];
    if (countEl) countEl.textContent = String(items.length);
    if (!items.length) {
      rowsEl.innerHTML = '<tr><td colspan="6" class="px-3 py-5 text-sm text-gray-500">No assignments found.</td></tr>';
      return;
    }

    rowsEl.innerHTML = items.map(function (item) {
      var kind = clean(item && item.submission_kind, 24).toLowerCase();
      var text = clean(item && item.submission_text, 20000);
      var submissionLabel = kind;
      if (kind === "link" && text === CERTIFICATE_PROOF_MARKER) submissionLabel = "certificate_proof_link";
      return [
        "<tr>",
        '<td class="px-3 py-2.5 text-sm text-gray-600">' + escapeHtml(fmtDate(item.created_at)) + "</td>",
        '<td class="px-3 py-2.5"><p class="text-sm font-semibold text-gray-900">' + escapeHtml(item.student_name || "Student") + '</p><p class="text-xs text-gray-500">' + escapeHtml(item.student_email || "") + "</p></td>",
        '<td class="px-3 py-2.5 text-sm text-gray-700">' + escapeHtml(item.course_slug || "") + "</td>",
        '<td class="px-3 py-2.5 text-sm text-gray-700">' + escapeHtml(submissionLabel || "") + "</td>",
        '<td class="px-3 py-2.5"><span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">' + escapeHtml(item.status || "submitted") + "</span></td>",
        '<td class="px-3 py-2.5 text-right"><button type="button" data-assignment-id="' + String(item.id || "") + '" class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Review</button></td>',
        "</tr>",
      ].join("");
    }).join("");
  }

  async function loadAssignments() {
    setMessage("Loading assignment queue...", false);
    var slug = clean(state.selectedCourse, 120).toLowerCase();
    var status = clean(statusFilterEl && statusFilterEl.value, 32).toLowerCase() || "all";
    var search = clean(searchInputEl && searchInputEl.value, 220);
    var url = "/.netlify/functions/admin-learning-assignments-list?course_slug=" +
      encodeURIComponent(slug || "all") +
      "&status=" + encodeURIComponent(status) +
      "&search=" + encodeURIComponent(search);

    var data = await api(url);
    state.items = Array.isArray(data.items) ? data.items : [];
    renderRows();
    setMessage("Loaded " + String(state.items.length) + " assignment(s).", false);
  }

  function openModal(item) {
    state.activeItem = item || null;
    if (!state.activeItem || !modalEl) return;
    var value = state.activeItem;
    if (modalTitleEl) {
      var kind = clean(value && value.submission_kind, 24).toLowerCase();
      var text = clean(value && value.submission_text, 20000);
      var kindLabel = kind;
      if (kind === "link" && text === CERTIFICATE_PROOF_MARKER) kindLabel = "certificate_proof_link";
      modalTitleEl.textContent = (value.student_name || value.student_email || "Student") + " • " + (kindLabel || "assignment");
    }
    var bodyParts = [];
    if (value.submission_text && value.submission_text !== CERTIFICATE_PROOF_MARKER) bodyParts.push("Text:\n" + value.submission_text);
    if (value.submission_link) bodyParts.push("Link:\n" + value.submission_link);
    if (modalBodyEl) modalBodyEl.textContent = bodyParts.join("\n\n") || "No text body provided.";
    if (modalStatusEl) modalStatusEl.value = clean(value.status, 32) || "submitted";
    if (modalFeedbackEl) modalFeedbackEl.value = clean(value.admin_feedback, 8000);

    if (modalAttachmentsEl) {
      var attachments = Array.isArray(value.attachments) ? value.attachments : [];
      if (!attachments.length) {
        modalAttachmentsEl.innerHTML = '<p class="text-sm text-gray-500">No screenshot attachments.</p>';
      } else {
        modalAttachmentsEl.innerHTML = attachments.map(function (att) {
          var url = clean(att && att.url, 1500);
          return [
            '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="block rounded-xl border border-gray-200 p-2 hover:bg-gray-50">',
            '<img src="' + escapeHtml(url) + '" alt="Screenshot" class="h-36 w-full object-cover rounded-lg bg-gray-100" />',
            '<p class="mt-1 text-xs text-gray-600 truncate">' + escapeHtml(url) + "</p>",
            "</a>",
          ].join("");
        }).join("");
      }
    }

    modalEl.classList.remove("hidden");
  }

  function closeModal() {
    state.activeItem = null;
    if (!modalEl) return;
    modalEl.classList.add("hidden");
  }

  async function saveModalReview() {
    if (!state.activeItem) return;
    var id = Number(state.activeItem.id || 0);
    if (!(id > 0)) return;
    if (modalSaveEl) {
      modalSaveEl.disabled = true;
      modalSaveEl.textContent = "Saving...";
    }
    try {
      var data = await api("/.netlify/functions/admin-learning-assignment-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          assignment_id: id,
          status: clean(modalStatusEl && modalStatusEl.value, 32),
          admin_feedback: clean(modalFeedbackEl && modalFeedbackEl.value, 8000),
        }),
      });
      var updated = data && data.item ? data.item : null;
      if (updated) {
        state.items = (state.items || []).map(function (item) {
          return Number(item && item.id || 0) === id ? updated : item;
        });
      }
      renderRows();
      closeModal();
      setMessage("Assignment review updated.", false);
    } finally {
      if (modalSaveEl) {
        modalSaveEl.disabled = false;
        modalSaveEl.textContent = "Save Review";
      }
    }
  }

  if (rowsEl) {
    rowsEl.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== "function") return;
      var btn = target.closest("[data-assignment-id]");
      if (!btn || !rowsEl.contains(btn)) return;
      var id = Number(btn.getAttribute("data-assignment-id") || 0);
      if (!(id > 0)) return;
      var item = (state.items || []).find(function (row) {
        return Number(row && row.id || 0) === id;
      });
      openModal(item || null);
    });
  }

  if (modalBackdropEl) modalBackdropEl.addEventListener("click", closeModal);
  if (modalCloseEl) modalCloseEl.addEventListener("click", closeModal);
  if (modalSaveEl) {
    modalSaveEl.addEventListener("click", function () {
      saveModalReview().catch(function (error) {
        setMessage(error.message || "Could not save assignment review", true);
      });
    });
  }

  if (refreshBtnEl) {
    refreshBtnEl.addEventListener("click", function () {
      loadAssignments().catch(function (error) {
        setMessage(error.message || "Could not load assignments", true);
      });
    });
  }

  if (statusFilterEl) {
    statusFilterEl.addEventListener("change", function () {
      loadAssignments().catch(function (error) {
        setMessage(error.message || "Could not load assignments", true);
      });
    });
  }

  if (searchInputEl) {
    searchInputEl.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      loadAssignments().catch(function (error) {
        setMessage(error.message || "Could not load assignments", true);
      });
    });
  }

  if (courseFilterEl) {
    courseFilterEl.addEventListener("change", function () {
      state.selectedCourse = clean(courseFilterEl.value, 120).toLowerCase();
      Promise.all([loadCourseFeatures(), loadAssignments()]).catch(function (error) {
        setMessage(error.message || "Could not load course assignment data", true);
      });
    });
  }

  if (saveFeatureBtnEl) {
    saveFeatureBtnEl.addEventListener("click", function () {
      saveCourseFeatures().catch(function (error) {
        setFeatureMessage(error.message || "Could not save feature settings", true);
      });
    });
  }

  if (featureCertificateProofRequiredEl) {
    featureCertificateProofRequiredEl.addEventListener("change", syncCertificateProofControls);
  }

  async function init() {
    setMessage("Loading...", false);
    syncCertificateProofControls();
    await loadCourses();
    await loadCourseFeatures();
    await loadAssignments();
  }

  init().catch(function (error) {
    setMessage(error.message || "Could not initialize learning support page.", true);
  });
})();
