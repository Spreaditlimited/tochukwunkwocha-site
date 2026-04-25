(function () {
  var appCard = document.getElementById("adminAppCard");
  var logoutBtn = document.getElementById("adminLogoutBtn");

  var messageEl = document.getElementById("videoLibraryMessage");
  var syncBtn = document.getElementById("syncCloudflareBtn");
  var syncMaxPagesInput = document.getElementById("syncMaxPagesInput");
  var enableSignedPlaybackBtn = document.getElementById("enableSignedPlaybackBtn");
  var actionConfirmModal = document.getElementById("actionConfirmModal");
  var actionConfirmBackdrop = document.getElementById("actionConfirmBackdrop");
  var actionConfirmCloseBtn = document.getElementById("actionConfirmCloseBtn");
  var actionConfirmCancelBtn = document.getElementById("actionConfirmCancelBtn");
  var actionConfirmConfirmBtn = document.getElementById("actionConfirmConfirmBtn");
  var actionConfirmTitle = document.getElementById("actionConfirmTitle");
  var actionConfirmMessage = document.getElementById("actionConfirmMessage");

  var courseSelect = document.getElementById("courseSelect");
  var courseSlugInput = document.getElementById("courseSlugInput");
  var courseTitleInput = document.getElementById("courseTitleInput");
  var courseDescriptionInput = document.getElementById("courseDescriptionInput");
  var courseIsPublishedInput = document.getElementById("courseIsPublishedInput");
  var courseReleaseAtInput = document.getElementById("courseReleaseAtInput");
  var createCourseBtn = document.getElementById("createCourseBtn");
  var saveCourseBtn = document.getElementById("saveCourseBtn");

  var moduleSelect = document.getElementById("moduleSelect");
  var cloneModuleSourceSelect = document.getElementById("cloneModuleSourceSelect");
  var cloneModuleToCourseBtn = document.getElementById("cloneModuleToCourseBtn");
  var moduleRows = document.getElementById("moduleRows");
  var moduleCourseSlugInput = document.getElementById("moduleCourseSlugInput");
  var moduleTitleInput = document.getElementById("moduleTitleInput");
  var moduleDescriptionInput = document.getElementById("moduleDescriptionInput");
  var moduleSortOrderInput = document.getElementById("moduleSortOrderInput");
  var moduleIsActiveInput = document.getElementById("moduleIsActiveInput");
  var moduleDripEnabledInput = document.getElementById("moduleDripEnabledInput");
  var moduleDripScheduleRows = document.getElementById("moduleDripScheduleRows");
  var addModuleDripScheduleRowBtn = document.getElementById("addModuleDripScheduleRowBtn");
  var saveModuleBtn = document.getElementById("saveModuleBtn");

  var lessonsRows = document.getElementById("lessonsRows");
  var addLessonRowBtn = document.getElementById("addLessonRowBtn");
  var saveLessonsBtn = document.getElementById("saveLessonsBtn");
  var lessonAccessibilitySummary = document.getElementById("lessonAccessibilitySummary");

  var csvImportInput = document.getElementById("csvImportInput");
  var previewImportBtn = document.getElementById("previewImportBtn");
  var applyImportBtn = document.getElementById("applyImportBtn");
  var importPreviewOutput = document.getElementById("importPreviewOutput");

  var state = {
    courses: [],
    modules: [],
    assets: [],
    courseBatches: [],
    accessibilityMetricsAvailable: false,
    moduleDripSchedulesByModule: new Map(),
    a11yGenerationByModule: new Map(),
    lessons: [],
    lessonAssetSearchByKey: new Map(),
    lessonRowKeySeq: 0,
    selectedModuleId: 0,
    selectedCourseId: 0,
  };
  var dragLessonIndex = -1;

  function clampHorizontalScroll() {
    try {
      document.documentElement.scrollLeft = 0;
      if (document.body) document.body.scrollLeft = 0;
      var main = document.querySelector("main");
      if (main && typeof main.scrollLeft === "number") main.scrollLeft = 0;
    } catch (_error) {}
  }
  var toastWrap = null;

  function showApp() {
    if (!appCard) return;
    appCard.hidden = false;
    appCard.style.display = "";
  }

  function redirectToInternalSignIn() {
    var next = window.location.pathname + (window.location.search || "");
    window.location.href = "/internal/?next=" + encodeURIComponent(next);
  }

  function setMessage(text, type) {
    if (!messageEl) return;
    messageEl.textContent = String(text || "");
    messageEl.classList.remove("hidden", "border-red-200", "bg-red-50", "text-red-700", "border-emerald-200", "bg-emerald-50", "text-emerald-700", "border-gray-200", "bg-gray-50", "text-gray-700");
    if (!text) {
      messageEl.classList.add("hidden");
      return;
    }
    if (type === "error") {
      messageEl.classList.add("border-red-200", "bg-red-50", "text-red-700");
      return;
    }
    if (type === "ok") {
      messageEl.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-700");
      return;
    }
    messageEl.classList.add("border-gray-200", "bg-gray-50", "text-gray-700");
  }

  function ensureToastWrap() {
    if (toastWrap && document.body.contains(toastWrap)) return toastWrap;
    toastWrap = document.createElement("div");
    toastWrap.className = "fixed top-4 right-4 z-[90] flex w-[min(92vw,24rem)] flex-col gap-2";
    document.body.appendChild(toastWrap);
    return toastWrap;
  }

  function showToast(text, type) {
    var wrap = ensureToastWrap();
    var tone = String(type || "ok").toLowerCase();
    var classes = "rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur transition-all duration-300";
    if (tone === "error") {
      classes += " border-red-200 bg-red-50/95 text-red-800";
    } else {
      classes += " border-emerald-200 bg-emerald-50/95 text-emerald-800";
    }

    var toast = document.createElement("div");
    toast.className = classes + " opacity-0 translate-y-[-6px]";
    toast.textContent = String(text || "");
    wrap.appendChild(toast);

    requestAnimationFrame(function () {
      toast.classList.remove("opacity-0", "translate-y-[-6px]");
      toast.classList.add("opacity-100", "translate-y-0");
    });

    window.setTimeout(function () {
      toast.classList.add("opacity-0", "translate-y-[-6px]");
      window.setTimeout(function () {
        if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
      }, 240);
    }, 2800);
  }

  function closeActionConfirm(result) {
    if (!actionConfirmModal) return;
    actionConfirmModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (typeof actionConfirmModal._resolve === "function") {
      var resolve = actionConfirmModal._resolve;
      actionConfirmModal._resolve = null;
      resolve(!!result);
    }
  }

  function requestActionConfirm(input) {
    if (!actionConfirmModal) return Promise.resolve(true);
    var title = input && input.title ? String(input.title) : "Confirm action";
    var message = input && input.message ? String(input.message) : "Please confirm this action.";
    if (actionConfirmTitle) actionConfirmTitle.textContent = title;
    if (actionConfirmMessage) actionConfirmMessage.textContent = message;
    actionConfirmModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    return new Promise(function (resolve) {
      actionConfirmModal._resolve = resolve;
      if (actionConfirmConfirmBtn) actionConfirmConfirmBtn.focus();
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function api(url, options) {
    var res = await fetch(url, Object.assign({ credentials: "include" }, options || {}));
    if (res.status === 401) {
      redirectToInternalSignIn();
      return null;
    }
    var payload = await res.json().catch(function () { return null; });
    if (!res.ok || !payload || payload.ok !== true) {
      var err = (payload && payload.error) || "Request failed";
      if (payload && payload.debug && typeof payload.debug === "object") {
        err += " Debug: " + JSON.stringify(payload.debug);
      }
      throw new Error(err);
    }
    return payload;
  }

  function assetLabel(asset) {
    var name = String(asset.filename || "").trim() || ("Video " + asset.video_uid);
    return name + " (" + asset.video_uid + ")";
  }

  function normalizeSearchText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function ensureLessonRowKey(row) {
    if (!row || typeof row !== "object") return "";
    var existing = String(row._row_key || "").trim();
    if (existing) return existing;
    state.lessonRowKeySeq += 1;
    var nextKey = "lr_" + String(state.lessonRowKeySeq);
    row._row_key = nextKey;
    return nextKey;
  }

  function ensureLessonRowKeys(rows) {
    if (!Array.isArray(rows)) return;
    rows.forEach(function (row) {
      ensureLessonRowKey(row);
    });
  }

  function pruneLessonAssetSearchMap(rows) {
    var keep = new Set();
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var key = ensureLessonRowKey(row);
      if (key) keep.add(key);
    });
    Array.from(state.lessonAssetSearchByKey.keys()).forEach(function (key) {
      if (!keep.has(key)) state.lessonAssetSearchByKey.delete(key);
    });
  }

  function assetSearchHaystack(asset) {
    var filename = String(asset && asset.filename || "").trim();
    var uid = String(asset && asset.video_uid || "").trim();
    return normalizeSearchText(filename + " " + uid);
  }

  function buildAssetOptions(selectedAssetId, query) {
    var q = normalizeSearchText(query);
    var prompt = q ? ('Filter: "' + q + '"') : "Select asset";
    var options = ['<option value="">' + escapeHtml(prompt) + "</option>"];
    (state.assets || []).forEach(function (asset) {
      var id = Number(asset && asset.id || 0);
      if (!(id > 0)) return;
      var label = assetLabel(asset);
      var haystack = assetSearchHaystack(asset);
      var isSelected = Number(selectedAssetId || 0) === id;
      if (q && haystack.indexOf(q) === -1 && !isSelected) return;
      var selected = isSelected ? ' selected' : "";
      options.push('<option value="' + escapeHtml(id) + '"' + selected + ">" + escapeHtml(label) + "</option>");
    });
    if (options.length === 1) {
      options.push('<option value="" disabled>No matching assets</option>');
    }
    return options;
  }

  function moduleLabel(mod) {
    return "[" + mod.course_slug + "] " + mod.module_title;
  }

  function courseLabel(course) {
    var title = String(course && course.course_title || "").trim();
    var slug = String(course && course.course_slug || "").trim();
    if (title && slug) return title + " (" + slug + ")";
    return title || slug || "Course";
  }

  function selectedCourseSlug() {
    if (!(state.selectedCourseId > 0)) return "";
    var selected = state.courses.find(function (course) {
      return Number(course.id) === Number(state.selectedCourseId);
    });
    return String(selected && selected.course_slug || "").trim().toLowerCase();
  }

  function slugifyCourse(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
  }

  function isModuleVisibleForSelectedCourse(mod) {
    var scopedSlug = selectedCourseSlug();
    if (!scopedSlug) return true;
    return String(mod && mod.course_slug || "").trim().toLowerCase() === scopedSlug;
  }

  function visibleModules() {
    return (state.modules || []).filter(isModuleVisibleForSelectedCourse);
  }

  function toDatetimeLocalValue(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    var m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return "";
    return m[1] + "T" + m[2] + ":" + m[3];
  }

  function normalizeModuleKey(mod) {
    var course = String((mod && mod.course_slug) || "").trim().toLowerCase();
    var title = String((mod && mod.module_title) || "").trim().toLowerCase().replace(/\s+/g, " ");
    return course + "::" + title;
  }

  function renderCourseSelect() {
    if (!courseSelect) return;
    var options = ['<option value="">Select course</option>'];
    state.courses.forEach(function (course) {
      options.push('<option value="' + escapeHtml(course.id) + '">' + escapeHtml(courseLabel(course)) + "</option>");
    });
    courseSelect.innerHTML = options.join("");
    if (state.selectedCourseId > 0) {
      courseSelect.value = String(state.selectedCourseId);
    }
  }

  function renderModuleCourseOptions() {
    if (!moduleCourseSlugInput) return;
    var options = ['<option value="">Select course</option>'];
    state.courses.forEach(function (course) {
      options.push('<option value="' + escapeHtml(course.course_slug) + '">' + escapeHtml(courseLabel(course)) + "</option>");
    });
    moduleCourseSlugInput.innerHTML = options.join("");
  }

  function selectedModuleCourseSlug() {
    if (moduleCourseSlugInput) {
      return String(moduleCourseSlugInput.value || "").trim().toLowerCase();
    }
    return "";
  }

  function listBatchesForCourse(courseSlug) {
    var slug = String(courseSlug || "").trim().toLowerCase();
    return (state.courseBatches || []).filter(function (row) {
      return String(row.course_slug || "").trim().toLowerCase() === slug;
    });
  }

  function renderModuleDripScheduleRows(courseSlug, schedules) {
    if (!moduleDripScheduleRows) return;
    var rows = Array.isArray(schedules) ? schedules : [];
    if (!rows.length) {
      moduleDripScheduleRows.innerHTML = '<p class="text-xs text-gray-500">No batch access rules added yet.</p>';
      return;
    }
    var batches = listBatchesForCourse(courseSlug);
    moduleDripScheduleRows.innerHTML = rows.map(function (row, index) {
      var accessMode = String(row && row.access_mode || "").trim().toLowerCase() === "immediate" ? "immediate" : "drip";
      var immediateChecked = accessMode === "immediate" ? " checked" : "";
      var dripDisabled = accessMode === "immediate" ? " disabled" : "";
      var dripClasses = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
      if (accessMode === "immediate") dripClasses += " bg-gray-100 text-gray-500";
      var batchOptions = ['<option value="">Select batch</option>'];
      batches.forEach(function (b) {
        var key = String(b.batch_key || "").trim().toLowerCase();
        if (!key) return;
        var label = String(b.batch_label || key);
        var selected = key === String(row.batch_key || "").trim().toLowerCase() ? " selected" : "";
        batchOptions.push('<option value="' + escapeHtml(key) + '"' + selected + ">" + escapeHtml(label) + "</option>");
      });
      return [
        '<div class="grid gap-2 sm:grid-cols-12" data-drip-schedule-index="' + String(index) + '">',
        '<div class="sm:col-span-5"><select data-drip-field="batch_key" class="premium-picker bg-white">' + batchOptions.join("") + '</select></div>',
        '<label class="sm:col-span-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">',
        '<input data-drip-field="is_immediate" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-brand-600"' + immediateChecked + " />",
        "Immediate access",
        "</label>",
        '<div class="sm:col-span-3"><input data-drip-field="drip_at" type="datetime-local" value="' + escapeHtml(toDatetimeLocalValue(row.drip_at || "")) + '" class="' + dripClasses + '"' + dripDisabled + " /></div>",
        '<div class="sm:col-span-1"><button type="button" data-remove-drip-row="' + String(index) + '" class="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">X</button></div>',
        "</div>",
      ].join("");
    }).join("");
  }

  function collectModuleDripSchedulesFromForm() {
    if (!moduleDripScheduleRows) return [];
    var nodes = Array.prototype.slice.call(moduleDripScheduleRows.querySelectorAll("[data-drip-schedule-index]"));
    var list = [];
    nodes.forEach(function (node) {
      var batchInput = node.querySelector('[data-drip-field="batch_key"]');
      var dateInput = node.querySelector('[data-drip-field="drip_at"]');
      var immediateInput = node.querySelector('[data-drip-field="is_immediate"]');
      var batchKey = String(batchInput && batchInput.value || "").trim().toLowerCase();
      var dripAt = String(dateInput && dateInput.value || "").trim();
      var isImmediate = !!(immediateInput && immediateInput.checked);
      if (!batchKey) return;
      if (isImmediate) {
        list.push({ batch_key: batchKey, access_mode: "immediate", drip_at: "" });
        return;
      }
      if (!dripAt) return;
      list.push({ batch_key: batchKey, access_mode: "drip", drip_at: dripAt });
    });
    return list;
  }

  function hydrateCourseForm(course) {
    if (!course) {
      if (courseSlugInput) courseSlugInput.value = "";
      if (courseTitleInput) courseTitleInput.value = "";
      if (courseDescriptionInput) courseDescriptionInput.value = "";
      if (courseIsPublishedInput) courseIsPublishedInput.checked = false;
      if (courseReleaseAtInput) courseReleaseAtInput.value = "";
      return;
    }
    if (courseSlugInput) courseSlugInput.value = String(course.course_slug || "");
    if (courseTitleInput) courseTitleInput.value = String(course.course_title || "");
    if (courseDescriptionInput) courseDescriptionInput.value = String(course.course_description || "");
    if (courseIsPublishedInput) courseIsPublishedInput.checked = Number(course.is_published || 0) === 1;
    if (courseReleaseAtInput) courseReleaseAtInput.value = toDatetimeLocalValue(course.release_at || "");
  }

  function renderModuleSelect() {
    if (!moduleSelect) return;
    var options = ['<option value="">Create new module</option>'];
    visibleModules().forEach(function (mod) {
      options.push('<option value="' + escapeHtml(mod.id) + '">' + escapeHtml(moduleLabel(mod)) + "</option>");
    });
    moduleSelect.innerHTML = options.join("");
    if (state.selectedModuleId > 0) moduleSelect.value = String(state.selectedModuleId);
  }

  function renderCloneModuleSourceOptions() {
    if (!cloneModuleSourceSelect) return;
    var previous = String(cloneModuleSourceSelect.value || "");
    var options = ['<option value="">Select source module</option>'];
    (state.modules || []).forEach(function (mod) {
      var id = Number(mod && mod.id || 0);
      if (!(id > 0)) return;
      options.push('<option value="' + escapeHtml(id) + '">' + escapeHtml(moduleLabel(mod)) + "</option>");
    });
    cloneModuleSourceSelect.innerHTML = options.join("");
    if (previous) cloneModuleSourceSelect.value = previous;
  }

  function renderModuleRows() {
    if (!moduleRows) return;
    var modules = visibleModules();
    var hasCourseFilter = !!selectedCourseSlug();
    if (!modules.length) {
      moduleRows.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-sm text-gray-500">' + (selectedCourseSlug() ? "No modules for selected course." : "No modules yet.") + "</td></tr>";
      return;
    }
    moduleRows.innerHTML = modules.map(function (mod) {
      var isActive = Number(mod.is_active || 0) !== 0;
      var isDrip = Number(mod.drip_enabled || 0) === 1;
      var activeLessonCount = Number(mod.active_lesson_count || 0);
      var missingCaptionsCount = Number(mod.missing_captions_count || 0);
      var missingTranscriptCount = Number(mod.missing_transcript_count || 0);
      var metricsAvailable = !!state.accessibilityMetricsAvailable;
      var isA11yReady = metricsAvailable && activeLessonCount > 0 && missingCaptionsCount === 0 && missingTranscriptCount === 0;
      var a11yGeneration = state.a11yGenerationByModule.get(Number(mod.id || 0)) || null;
      var isA11yGenerating = !!(a11yGeneration && a11yGeneration.running);
      var courseOptions = state.courses.map(function (course) {
        var slug = String(course.course_slug || "");
        var title = String(course.course_title || "").trim();
        var selected = slug.toLowerCase() === String(mod.course_slug || "").toLowerCase() ? " selected" : "";
        return '<option value="' + escapeHtml(slug) + '"' + selected + ">" + escapeHtml(title || slug) + "</option>";
      }).join("");
      var activeBadge = isActive
        ? '<span class="inline-flex whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs leading-none font-semibold text-emerald-700 ring-1 ring-emerald-200">published</span>'
        : '<span class="inline-flex whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs leading-none font-semibold text-gray-700 ring-1 ring-gray-200">unpublished</span>';
      var dripBadge = isDrip
        ? '<span class="inline-flex whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs leading-none font-semibold text-amber-700 ring-1 ring-amber-200">drip</span>'
        : "";
      var a11yBadge = !metricsAvailable
        ? '<span class="inline-flex whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs leading-none font-semibold text-gray-700 ring-1 ring-gray-200">a11y unknown</span>'
        : (isA11yReady
          ? '<span class="inline-flex whitespace-nowrap rounded-full bg-blue-50 px-2.5 py-1 text-xs leading-none font-semibold text-blue-700 ring-1 ring-blue-200">a11y ready</span>'
          : (activeLessonCount > 0
            ? '<span class="inline-flex whitespace-nowrap rounded-full bg-orange-50 px-2.5 py-1 text-xs leading-none font-semibold text-orange-700 ring-1 ring-orange-200">a11y pending</span>'
            : '<span class="inline-flex whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs leading-none font-semibold text-gray-700 ring-1 ring-gray-200">no active lessons</span>'));
      var statusHint = !metricsAvailable
        ? "Accessibility columns are not available yet in this environment."
        : (isA11yReady
        ? "All active lessons have captions and transcript."
        : (activeLessonCount > 0
          ? (String(missingCaptionsCount) + " missing captions, " + String(missingTranscriptCount) + " missing transcript.")
          : "No active lessons to assess."));
      if (isA11yGenerating) {
        var progressTotal = Number(a11yGeneration.total || 0);
        var progressDone = Number(a11yGeneration.processed || 0);
        statusHint = "Generating accessibility drafts: processed " + String(progressDone) + (progressTotal > 0 ? " of " + String(progressTotal) : "") + ".";
      }
      var toggleLabel = isActive ? "Unpublish" : "Publish";
      var generateBtnLabel = "Generate A11y";
      if (isA11yGenerating) {
        var btnDone = Number(a11yGeneration.processed || 0);
        var btnTotal = Number(a11yGeneration.total || 0);
        generateBtnLabel = btnTotal > 0
          ? ("Generating " + String(Math.min(btnDone, btnTotal)) + "/" + String(btnTotal))
          : ("Generating " + String(btnDone));
      }
      var generateBtnClass = "inline-flex h-9 w-full sm:w-auto sm:flex-none items-center justify-center whitespace-nowrap rounded-lg border px-3 py-2 text-xs leading-none font-semibold";
      if (isA11yGenerating) {
        generateBtnClass += " border-blue-200 bg-blue-100 text-blue-700 opacity-80 cursor-not-allowed";
      } else {
        generateBtnClass += " border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100";
      }
      return [
        "<tr>",
        '<td class="px-3 py-2 text-sm font-semibold text-gray-900">' + escapeHtml(mod.module_title || "-") + "</td>",
        '<td class="px-3 py-2 text-sm text-gray-700">' + escapeHtml(mod.lesson_count || 0) + "</td>",
        '<td class="px-3 py-2"><div class="flex items-center gap-2">' + activeBadge + dripBadge + a11yBadge + '</div><p class="mt-1 text-[11px] text-gray-500">' + escapeHtml(statusHint) + "</p></td>",
        '<td class="px-3 py-2"><div class="flex flex-wrap items-center gap-2">' +
          '<select data-course-target-for="' + escapeHtml(mod.id) + '" class="premium-picker !mt-0 !w-full sm:!w-[14.5rem] !max-w-full sm:!max-w-[14.5rem] !min-w-0 sm:!min-w-[14.5rem] bg-white !py-1.5 !pl-2.5 !pr-8 !text-xs !font-semibold">' + courseOptions + "</select>" +
          '<button type="button" data-autofill-a11y-module="' + escapeHtml(mod.id) + '" class="' + generateBtnClass + '"' + (isA11yGenerating ? " disabled" : "") + ">" + escapeHtml(generateBtnLabel) + "</button>" +
          '<button type="button" data-remap-module="' + escapeHtml(mod.id) + '" class="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">Move</button>' +
          '<button type="button" data-select-module="' + escapeHtml(mod.id) + '" class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Open</button>' +
          '<button type="button" data-toggle-module="' + escapeHtml(mod.id) + '" class="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">' + toggleLabel + "</button>" +
          (hasCourseFilter ? '<button type="button" data-delete-module="' + escapeHtml(mod.id) + '" class="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">Detach</button>' : "") +
          "</div></td>",
        "</tr>",
      ].join("");
    }).join("");
  }

  function renderLessonRows() {
    if (!lessonsRows) return;
    var rows = state.lessons || [];
    pruneLessonAssetSearchMap(rows);
    if (!rows.length) {
      lessonsRows.innerHTML = '<tr><td colspan="13" class="px-4 py-6 text-center text-sm text-gray-500">No lessons yet. Add rows and save.</td></tr>';
      if (lessonAccessibilitySummary) {
        lessonAccessibilitySummary.textContent = "";
      }
      return;
    }

    lessonsRows.innerHTML = rows.map(function (row, idx) {
      var rowKey = ensureLessonRowKey(row);
      var assetSearchQuery = state.lessonAssetSearchByKey.get(rowKey) || "";
      var selectedAssetId = Number(row.video_asset_id || 0);
      var assetOptions = buildAssetOptions(selectedAssetId, assetSearchQuery);

      return [
        '<tr draggable="true" data-row-index="' + idx + '" data-row-key="' + escapeHtml(rowKey) + '" data-lesson-id="' + escapeHtml(row.id || "") + '" class="cursor-move">',
        '<td class="px-3 py-2"><span class="inline-flex rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-500">::</span></td>',
        '<td class="px-3 py-2 md:min-w-[22rem]"><input data-field="lesson_title" type="text" class="w-full md:min-w-[20rem] rounded-lg border border-gray-300 px-3 py-2 text-sm" value="' + escapeHtml(row.lesson_title || "") + '" /></td>',
        '<td class="px-3 py-2"><input data-field="lesson_order" type="number" class="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm" value="' + escapeHtml(row.lesson_order || idx + 1) + '" /></td>',
        '<td class="px-3 py-2 min-w-[18rem]">' +
          '<select data-field="video_asset_id" class="premium-picker !mt-0 min-w-[18rem] bg-white" title="Type to filter by filename or UID. Press Escape to clear filter.">' + assetOptions.join("") + "</select>" +
        "</td>",
        '<td class="px-3 py-2 md:min-w-[18rem]"><textarea data-field="lesson_notes" rows="2" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Optional notes visible to students">' + escapeHtml(row.lesson_notes || "") + "</textarea></td>",
        '<td class="px-3 py-2 md:min-w-[18rem]"><input data-field="captions_vtt_url" type="url" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="https://.../captions.vtt" value="' + escapeHtml(row.captions_vtt_url || "") + '" /></td>',
        '<td class="px-3 py-2 md:min-w-[14rem]"><input data-field="captions_languages_json" type="text" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="[\"en\",\"fr\"]" value="' + escapeHtml(row.captions_languages_json || "") + '" /></td>',
        '<td class="px-3 py-2 md:min-w-[22rem]"><textarea data-field="transcript_text" rows="2" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Lesson transcript text">' + escapeHtml(row.transcript_text || "") + "</textarea></td>",
        '<td class="px-3 py-2 md:min-w-[20rem]"><textarea data-field="audio_description_text" rows="2" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Audio description or visual cues">' + escapeHtml(row.audio_description_text || "") + "</textarea></td>",
        '<td class="px-3 py-2 md:min-w-[18rem]"><input data-field="sign_language_video_url" type="url" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="https://.../sign-language" value="' + escapeHtml(row.sign_language_video_url || "") + '" /></td>',
        '<td class="px-3 py-2"><select data-field="accessibility_status" class="premium-picker min-w-[10rem] bg-white">' +
          '<option value="draft"' + (String(row.accessibility_status || "").toLowerCase() === "draft" ? " selected" : "") + ">Draft</option>" +
          '<option value="in_progress"' + (String(row.accessibility_status || "").toLowerCase() === "in_progress" ? " selected" : "") + ">In Progress</option>" +
          '<option value="ready"' + (String(row.accessibility_status || "").toLowerCase() === "ready" ? " selected" : "") + ">Ready</option>" +
          '<option value="blocked"' + (String(row.accessibility_status || "").toLowerCase() === "blocked" ? " selected" : "") + ">Blocked</option>" +
        "</select></td>",
        '<td class="px-3 py-2"><label class="inline-flex items-center gap-2 text-xs font-medium text-gray-600"><input data-field="is_active" type="checkbox" ' + (Number(row.is_active) === 0 ? "" : "checked") + ' class="h-4 w-4 rounded border-gray-300 text-brand-600" />Active</label></td>',
        '<td class="px-3 py-2"><button type="button" data-remove-row class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Remove</button></td>',
        "</tr>",
      ].join("");
    }).join("");

    if (lessonAccessibilitySummary) {
      var missingTranscript = rows.filter(function (row) {
        return !String(row && row.transcript_text || "").trim();
      }).length;
      var missingCaptions = rows.filter(function (row) {
        return !String(row && row.captions_vtt_url || "").trim();
      }).length;
      if (!missingTranscript && !missingCaptions) {
        lessonAccessibilitySummary.classList.remove("text-amber-700");
        lessonAccessibilitySummary.classList.add("text-emerald-700");
        lessonAccessibilitySummary.textContent = "Accessibility check: all current lesson rows include captions URL and transcript.";
      } else {
        lessonAccessibilitySummary.classList.remove("text-emerald-700");
        lessonAccessibilitySummary.classList.add("text-amber-700");
        lessonAccessibilitySummary.textContent = "Accessibility warning (non-blocking): " + missingCaptions + " lesson(s) missing captions URL, " + missingTranscript + " lesson(s) missing transcript.";
      }
    }
  }

  function hydrateModuleForm(mod) {
    if (!mod) {
      if (moduleCourseSlugInput) {
        var fallbackSlug = "";
        if (state.selectedCourseId > 0) {
          var selectedCourse = state.courses.find(function (course) { return Number(course.id) === Number(state.selectedCourseId); });
          fallbackSlug = selectedCourse ? String(selectedCourse.course_slug || "") : "";
        }
        moduleCourseSlugInput.value = fallbackSlug;
      }
      if (moduleTitleInput) moduleTitleInput.value = "";
      if (moduleDescriptionInput) moduleDescriptionInput.value = "";
      if (moduleSortOrderInput) moduleSortOrderInput.value = "0";
      if (moduleIsActiveInput) moduleIsActiveInput.checked = true;
      if (moduleDripEnabledInput) moduleDripEnabledInput.checked = false;
      renderModuleDripScheduleRows(selectedModuleCourseSlug(), []);
      return;
    }
    if (moduleCourseSlugInput) moduleCourseSlugInput.value = String(mod.course_slug || "");
    if (moduleTitleInput) moduleTitleInput.value = String(mod.module_title || "");
    if (moduleDescriptionInput) moduleDescriptionInput.value = String(mod.module_description || "");
    if (moduleSortOrderInput) moduleSortOrderInput.value = String(mod.sort_order || 0);
    if (moduleIsActiveInput) moduleIsActiveInput.checked = Number(mod.is_active || 0) !== 0;
    if (moduleDripEnabledInput) moduleDripEnabledInput.checked = Number(mod.drip_enabled || 0) === 1;
    var schedules = state.moduleDripSchedulesByModule.get(Number(mod.id || 0)) || [];
    renderModuleDripScheduleRows(String(mod.course_slug || ""), schedules);
  }

  async function loadLibrary(moduleId) {
    var moduleParam = Number(moduleId || state.selectedModuleId || 0);
    var url = "/.netlify/functions/admin-learning-library-list";
    if (moduleParam > 0) url += "?module_id=" + encodeURIComponent(moduleParam);

    var payload = await api(url, { method: "GET", headers: { Accept: "application/json" } });
    if (!payload) return;
    state.courses = Array.isArray(payload.courses) ? payload.courses : [];
    state.modules = Array.isArray(payload.modules) ? payload.modules : [];
    state.assets = Array.isArray(payload.assets) ? payload.assets : [];
    state.courseBatches = Array.isArray(payload.course_batches) ? payload.course_batches : [];
    state.accessibilityMetricsAvailable = payload && payload.accessibility_metrics_available === true;
    state.moduleDripSchedulesByModule = new Map();
    (Array.isArray(payload.module_drip_schedules) ? payload.module_drip_schedules : []).forEach(function (row) {
      var moduleId = Number(row && row.module_id || 0);
      if (!(moduleId > 0)) return;
      if (!state.moduleDripSchedulesByModule.has(moduleId)) state.moduleDripSchedulesByModule.set(moduleId, []);
      state.moduleDripSchedulesByModule.get(moduleId).push({
        batch_key: String(row.batch_key || "").trim().toLowerCase(),
        access_mode: String(row.access_mode || "").trim().toLowerCase() === "immediate" ? "immediate" : "drip",
        drip_at: String(row.access_mode || "").trim().toLowerCase() === "immediate" ? "" : (row.drip_at || ""),
      });
    });
    state.lessons = Array.isArray(payload.lessons) ? payload.lessons : [];
    ensureLessonRowKeys(state.lessons);
    pruneLessonAssetSearchMap(state.lessons);
    state.selectedModuleId = moduleParam > 0 ? moduleParam : 0;

    renderCourseSelect();
    renderModuleCourseOptions();
    renderCloneModuleSourceOptions();
    if (state.selectedCourseId > 0) {
      var selectedCourse = state.courses.find(function (course) { return Number(course.id) === Number(state.selectedCourseId); });
      if (selectedCourse) {
        hydrateCourseForm(selectedCourse);
      } else {
        state.selectedCourseId = 0;
        hydrateCourseForm(null);
      }
    } else {
      hydrateCourseForm(null);
    }
    var selectedModule = state.selectedModuleId > 0
      ? state.modules.find(function (mod) { return Number(mod.id) === state.selectedModuleId; })
      : null;
    if (selectedModule && !isModuleVisibleForSelectedCourse(selectedModule)) {
      state.selectedModuleId = 0;
      state.lessons = [];
      selectedModule = null;
    }

    renderModuleSelect();
    renderModuleRows();
    renderLessonRows();
    if (state.selectedModuleId > 0) {
      var selected = selectedModule || state.modules.find(function (mod) { return Number(mod.id) === state.selectedModuleId; });
      if (selected) {
        var matchingCourse = state.courses.find(function (course) {
          return String(course.course_slug || "").trim().toLowerCase() === String(selected.course_slug || "").trim().toLowerCase();
        });
        if (matchingCourse) {
          state.selectedCourseId = Number(matchingCourse.id || 0);
          if (courseSelect) courseSelect.value = String(state.selectedCourseId);
          hydrateCourseForm(matchingCourse);
        }
      }
      hydrateModuleForm(selected || null);
    } else {
      hydrateModuleForm(null);
    }
    clampHorizontalScroll();
  }

  function collectLessonRows() {
    var rows = Array.prototype.slice.call(lessonsRows.querySelectorAll("tr[data-row-index]"));
    return rows.map(function (tr) {
      var lessonId = Number(tr.getAttribute("data-lesson-id") || 0);
      var titleInput = tr.querySelector('input[data-field="lesson_title"]');
      var orderInput = tr.querySelector('input[data-field="lesson_order"]');
      var assetInput = tr.querySelector('select[data-field="video_asset_id"]');
      var notesInput = tr.querySelector('textarea[data-field="lesson_notes"]');
      var captionsVttInput = tr.querySelector('input[data-field="captions_vtt_url"]');
      var captionsLanguagesInput = tr.querySelector('input[data-field="captions_languages_json"]');
      var transcriptInput = tr.querySelector('textarea[data-field="transcript_text"]');
      var audioDescriptionInput = tr.querySelector('textarea[data-field="audio_description_text"]');
      var signLanguageInput = tr.querySelector('input[data-field="sign_language_video_url"]');
      var accessibilityStatusInput = tr.querySelector('select[data-field="accessibility_status"]');
      var activeInput = tr.querySelector('input[data-field="is_active"]');
      return {
        id: lessonId > 0 ? lessonId : null,
        lesson_title: String(titleInput && titleInput.value || "").trim(),
        lesson_order: Number(orderInput && orderInput.value || 1),
        video_asset_id: Number(assetInput && assetInput.value || 0) || null,
        lesson_notes: String(notesInput && notesInput.value || "").trim(),
        captions_vtt_url: String(captionsVttInput && captionsVttInput.value || "").trim(),
        captions_languages_json: String(captionsLanguagesInput && captionsLanguagesInput.value || "").trim(),
        transcript_text: String(transcriptInput && transcriptInput.value || "").trim(),
        audio_description_text: String(audioDescriptionInput && audioDescriptionInput.value || "").trim(),
        sign_language_video_url: String(signLanguageInput && signLanguageInput.value || "").trim(),
        accessibility_status: String(accessibilityStatusInput && accessibilityStatusInput.value || "draft").trim().toLowerCase(),
        is_active: Boolean(activeInput && activeInput.checked),
      };
    });
  }

  function addLessonRow(initial) {
    var nextOrder = state.lessons.length + 1;
    var row = Object.assign({
      id: null,
      lesson_title: "",
      lesson_order: nextOrder,
      video_asset_id: null,
      lesson_notes: "",
      captions_vtt_url: "",
      captions_languages_json: "",
      transcript_text: "",
      audio_description_text: "",
      sign_language_video_url: "",
      accessibility_status: "draft",
      is_active: 1,
    }, initial || {});
    ensureLessonRowKey(row);
    state.lessons.push(row);
    renderLessonRows();
  }

  if (courseSelect) {
    courseSelect.addEventListener("change", function () {
      var nextId = Number(courseSelect.value || 0);
      state.selectedCourseId = nextId > 0 ? nextId : 0;
      if (state.selectedModuleId > 0) {
        var selectedModule = state.modules.find(function (m) { return Number(m.id) === Number(state.selectedModuleId); });
        if (selectedModule && !isModuleVisibleForSelectedCourse(selectedModule)) {
          state.selectedModuleId = 0;
          state.lessons = [];
        }
      }
      if (!(state.selectedCourseId > 0)) {
        hydrateCourseForm(null);
        hydrateModuleForm(state.selectedModuleId > 0
          ? state.modules.find(function (m) { return Number(m.id) === Number(state.selectedModuleId); })
          : null);
        renderModuleSelect();
        renderModuleRows();
        renderLessonRows();
        return;
      }
      var selected = state.courses.find(function (course) { return Number(course.id) === state.selectedCourseId; });
      hydrateCourseForm(selected || null);
      if (moduleCourseSlugInput && selected) {
        moduleCourseSlugInput.value = String(selected.course_slug || "");
      }
      renderModuleSelect();
      renderModuleRows();
      hydrateModuleForm(state.selectedModuleId > 0
        ? state.modules.find(function (m) { return Number(m.id) === Number(state.selectedModuleId); })
        : null);
      renderLessonRows();
    });
  }

  if (createCourseBtn) {
    createCourseBtn.addEventListener("click", function () {
      var slugInput = courseSlugInput ? String(courseSlugInput.value || "").trim().toLowerCase() : "";
      var titleInput = courseTitleInput ? String(courseTitleInput.value || "").trim() : "";
      if (slugInput || titleInput) {
        state.selectedCourseId = 0;
        if (courseSelect) courseSelect.value = "";
        if (saveCourseBtn && !saveCourseBtn.disabled) saveCourseBtn.click();
        return;
      }
      state.selectedCourseId = 0;
      if (courseSelect) courseSelect.value = "";
      hydrateCourseForm(null);
      if (moduleCourseSlugInput) moduleCourseSlugInput.value = "";
      if (courseSlugInput) courseSlugInput.focus();
      setMessage("Enter a new course slug and title, then click Create New Course (or Save Course).", "");
    });
  }

  if (moduleSelect) {
    moduleSelect.addEventListener("change", function () {
      var nextId = Number(moduleSelect.value || 0);
      state.selectedModuleId = nextId > 0 ? nextId : 0;
      loadLibrary(state.selectedModuleId).catch(function (error) {
        setMessage(error.message || "Could not load module lessons.", "error");
      });
    });
  }

  if (cloneModuleToCourseBtn) {
    cloneModuleToCourseBtn.addEventListener("click", async function () {
      var sourceModuleId = Number(cloneModuleSourceSelect && cloneModuleSourceSelect.value || 0);
      if (!(sourceModuleId > 0)) {
        setMessage("Select a source module to copy.", "error");
        return;
      }
      var targetCourseSlug = selectedModuleCourseSlug();
      if (!targetCourseSlug) {
        setMessage("Select a target course in Module Builder first.", "error");
        return;
      }

      cloneModuleToCourseBtn.disabled = true;
      setMessage("Copying module to selected course...", "");
      try {
        var res = await api("/.netlify/functions/admin-learning-module-clone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_module_id: sourceModuleId,
            target_course_slug: targetCourseSlug,
          }),
        });
        if (!res || !res.module) throw new Error("Could not copy module.");
        state.selectedModuleId = Number(res.module.id || 0);
        if (res && res.linked_existing_module === true) {
          setMessage("Module linked to selected course (shared module, no duplicate created).", "ok");
          showToast("Module linked to selected course.", "ok");
        } else {
          setMessage("Module copied successfully.", "ok");
          showToast("Module copied to selected course.", "ok");
        }
        await loadLibrary(state.selectedModuleId);
      } catch (error) {
        setMessage(error.message || "Could not copy module to selected course.", "error");
      } finally {
        cloneModuleToCourseBtn.disabled = false;
      }
    });
  }

  if (moduleRows) {
    moduleRows.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;

      var selectBtn = target.closest("[data-select-module]");
      if (selectBtn) {
        var selectId = Number(selectBtn.getAttribute("data-select-module") || 0);
        if (selectId > 0) {
          state.selectedModuleId = selectId;
          loadLibrary(selectId).catch(function (error) {
            setMessage(error.message || "Could not open module.", "error");
          });
        }
        return;
      }

      var toggleBtn = target.closest("[data-toggle-module]");
      var remapBtn = target.closest("[data-remap-module]");
      var deleteBtn = target.closest("[data-delete-module]");
      var autofillA11yBtn = target.closest("[data-autofill-a11y-module]");
      if (autofillA11yBtn) {
        var autofillModuleId = Number(autofillA11yBtn.getAttribute("data-autofill-a11y-module") || 0);
        if (!(autofillModuleId > 0)) return;
        var existingA11yRun = state.a11yGenerationByModule.get(autofillModuleId);
        if (existingA11yRun && existingA11yRun.running) return;
        var autofillModule = state.modules.find(function (m) { return Number(m.id) === autofillModuleId; });
        var autofillModuleTitle = String(autofillModule && autofillModule.module_title || "this module");
        requestActionConfirm({
          title: "Generate Accessibility Drafts",
          message: "Generate captions/transcript drafts for \"" + autofillModuleTitle + "\"?",
        })
          .then(function (confirmed) {
            if (!confirmed) return null;
            state.a11yGenerationByModule.set(autofillModuleId, { running: true, processed: 0, total: 0 });
            renderModuleRows();
            setMessage("Generating accessibility drafts for selected module...", "");
            var totals = { scanned: 0, updated: 0, skipped: 0, blocked: 0 };
            var reasonTotals = {};
            var offset = 0;
            var rounds = 0;
            var maxRounds = 60;

            function runNextBatch() {
              rounds += 1;
              return api("/.netlify/functions/admin-learning-accessibility-autofill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  module_id: autofillModuleId,
                  dry_run: false,
                  limit: 3,
                  offset: offset,
                  include_audio_description: false,
                }),
              }).then(function (res) {
                var summary = (res && res.summary) ? res.summary : {};
                totals.scanned += Number(summary.scanned || 0);
                totals.updated += Number(summary.updated || 0);
                totals.skipped += Number(summary.skipped || 0);
                totals.blocked += Number(summary.blocked || 0);
                var reasonCounts = summary && summary.reason_counts && typeof summary.reason_counts === "object"
                  ? summary.reason_counts
                  : {};
                Object.keys(reasonCounts).forEach(function (key) {
                  var safeKey = String(key || "").trim();
                  if (!safeKey) return;
                  reasonTotals[safeKey] = Number(reasonTotals[safeKey] || 0) + Number(reasonCounts[safeKey] || 0);
                });

                var totalMatching = Number(res && res.total_matching || 0);
                var nextOffset = Number(res && res.next_offset || 0);
                var hasMore = res && res.has_more === true;
                var processedNow = Number(summary.scanned || 0);
                var processedTotal = offset + processedNow;
                state.a11yGenerationByModule.set(autofillModuleId, {
                  running: true,
                  processed: processedTotal,
                  total: totalMatching,
                });
                renderModuleRows();
                if (hasMore && nextOffset > offset && rounds < maxRounds) {
                  offset = nextOffset;
                  var progressed = totalMatching > 0 ? Math.min(offset, totalMatching) : offset;
                  setMessage(
                    "Generating accessibility drafts for \"" +
                      autofillModuleTitle +
                      "\"... processed " +
                      String(progressed) +
                      (totalMatching > 0 ? " of " + String(totalMatching) : "") +
                      ".",
                    ""
                  );
                  return runNextBatch();
                }
                return { done: true, rounds: rounds, total_matching: totalMatching };
              });
            }

            return runNextBatch()
              .then(function (res) {
                state.a11yGenerationByModule.delete(autofillModuleId);
                return loadLibrary(state.selectedModuleId).then(function () {
                  var refreshedModule = (state.modules || []).find(function (m) { return Number(m.id) === autofillModuleId; });
                  var activeLessonCount = Number(refreshedModule && refreshedModule.active_lesson_count || 0);
                  var missingCaptionsCount = Number(refreshedModule && refreshedModule.missing_captions_count || 0);
                  var missingTranscriptCount = Number(refreshedModule && refreshedModule.missing_transcript_count || 0);
                  var metricsAvailable = !!state.accessibilityMetricsAvailable;
                  if (metricsAvailable && activeLessonCount > 0 && missingCaptionsCount === 0 && missingTranscriptCount === 0) {
                    setMessage(
                      "Accessibility generation completed for \"" + autofillModuleTitle + "\". Module is now a11y ready.",
                      "ok"
                    );
                    showToast("Module is now a11y ready.", "ok");
                    return;
                  }
                  setMessage(
                    "Accessibility generation completed for \"" + autofillModuleTitle + "\". Still pending: " +
                      String(missingCaptionsCount) +
                      " lesson(s) missing captions and " +
                      String(missingTranscriptCount) +
                      " missing transcript. Reasons: " +
                      "caption generation started=" + String(reasonTotals.caption_generation_started || 0) +
                      ", no caption source=" + String(reasonTotals.no_caption_source || 0) +
                      ", transcript pending=" + String(reasonTotals.transcript_pending || 0) + ".",
                    ""
                  );
                  showToast(
                    "Generation finished. Remaining gaps keep this module pending A11y.",
                    "error"
                  );
                });
              })
              .catch(function (error) {
                state.a11yGenerationByModule.delete(autofillModuleId);
                renderModuleRows();
                setMessage(error.message || "Could not generate accessibility drafts for module.", "error");
                showToast(error.message || "Could not generate accessibility drafts.", "error");
              })
              .finally(function () {
                renderModuleRows();
              });
          })
          .catch(function (error) {
            setMessage(error.message || "Could not process accessibility generation.", "error");
          });
        return;
      }
      if (remapBtn) {
        var remapId = Number(remapBtn.getAttribute("data-remap-module") || 0);
        if (!(remapId > 0)) return;
        var remapModule = state.modules.find(function (m) { return Number(m.id) === remapId; });
        if (!remapModule) return;
        var targetSelect = moduleRows.querySelector('select[data-course-target-for="' + remapId + '"]');
        var nextCourseSlug = String(targetSelect && targetSelect.value || "").trim().toLowerCase();
        if (!nextCourseSlug) {
          setMessage("Choose a target course first.", "error");
          return;
        }
        if (nextCourseSlug === String(remapModule.course_slug || "").trim().toLowerCase()) {
          setMessage("Module is already mapped to that course.", "");
          return;
        }

        remapBtn.disabled = true;
        setMessage("Moving module to selected course...", "");
        api("/.netlify/functions/admin-learning-module-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: remapModule.id,
            course_slug: nextCourseSlug,
            module_slug: remapModule.module_slug,
            module_title: remapModule.module_title,
            module_description: remapModule.module_description || "",
            sort_order: remapModule.sort_order || 0,
            is_active: Number(remapModule.is_active || 0) !== 0,
            drip_enabled: Number(remapModule.drip_enabled || 0) === 1,
            drip_at: remapModule.drip_at || null,
            drip_batch_key: remapModule.drip_batch_key || "",
            drip_schedules: (state.moduleDripSchedulesByModule.get(Number(remapModule.id || 0)) || []).slice(),
            apply_to_title_group: false,
          }),
        })
          .then(function () {
            setMessage("Module course mapping updated.", "ok");
            showToast("Module moved to selected course.", "ok");
            return loadLibrary(state.selectedModuleId);
          })
          .catch(function (error) {
            setMessage(error.message || "Could not move module to selected course.", "error");
          })
          .finally(function () {
            remapBtn.disabled = false;
          });
        return;
      }

      if (deleteBtn) {
        var deleteId = Number(deleteBtn.getAttribute("data-delete-module") || 0);
        if (!(deleteId > 0)) return;
        var deleteModule = state.modules.find(function (m) { return Number(m.id) === deleteId; });
        if (!deleteModule) return;

        requestActionConfirm({
          title: "Detach Module",
          message: "This will detach \"" + String(deleteModule.module_title || "this module") + "\" from the selected course. The module stays in the system for reuse. Continue?",
        })
          .then(function (confirmed) {
            if (!confirmed) return null;
            deleteBtn.disabled = true;
            setMessage("Detaching module...", "");
            return api("/.netlify/functions/admin-learning-module-remove-from-course", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                module_id: deleteId,
                course_slug: selectedCourseSlug(),
              }),
            })
              .then(function () {
                if (Number(state.selectedModuleId || 0) === deleteId) {
                  state.selectedModuleId = 0;
                }
                setMessage("Module detached from selected course.", "ok");
                showToast("Module detached from course.", "ok");
                return loadLibrary(state.selectedModuleId);
              })
              .catch(function (error) {
                setMessage(error.message || "Could not detach module.", "error");
              })
              .finally(function () {
                deleteBtn.disabled = false;
              });
          })
          .catch(function (error) {
            setMessage(error.message || "Could not process module detach.", "error");
          });
        return;
      }

      if (!toggleBtn) return;
      var toggleId = Number(toggleBtn.getAttribute("data-toggle-module") || 0);
      if (!(toggleId > 0)) return;

      var mod = state.modules.find(function (m) { return Number(m.id) === toggleId; });
      if (!mod) return;
      var nextActive = Number(mod.is_active || 0) === 0;
      var activeLessonCount = Number(mod.active_lesson_count || 0);
      var missingCaptionsCount = Number(mod.missing_captions_count || 0);
      var missingTranscriptCount = Number(mod.missing_transcript_count || 0);
      var publishWarning = nextActive && (
        activeLessonCount <= 0 ||
        missingCaptionsCount > 0 ||
        missingTranscriptCount > 0
      );

      toggleBtn.disabled = true;
      setMessage(nextActive ? "Publishing module..." : "Unpublishing module...", "");

      api("/.netlify/functions/admin-learning-module-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: mod.id,
          course_slug: mod.course_slug,
          module_slug: mod.module_slug,
          module_title: mod.module_title,
          module_description: mod.module_description || "",
          sort_order: mod.sort_order || 0,
          is_active: nextActive,
          drip_enabled: Number(mod.drip_enabled || 0) === 1,
          drip_at: mod.drip_at || null,
          drip_batch_key: mod.drip_batch_key || "",
          drip_schedules: (state.moduleDripSchedulesByModule.get(Number(mod.id || 0)) || []).slice(),
          apply_to_title_group: true,
        }),
      })
        .then(function () {
          if (publishWarning) {
            setMessage(
              "Module published with accessibility warning (non-blocking): " +
                (activeLessonCount <= 0
                  ? "no active lessons to assess."
                  : (String(missingCaptionsCount) + " active lesson(s) missing captions and " + String(missingTranscriptCount) + " active lesson(s) missing transcript.")),
              ""
            );
            showToast("Module published with accessibility warning.", "ok");
          } else {
            setMessage(nextActive ? "Module published." : "Module unpublished.", "ok");
            showToast(nextActive ? "Module published successfully." : "Module unpublished successfully.", "ok");
          }
          return loadLibrary(state.selectedModuleId);
        })
        .catch(function (error) {
          setMessage(error.message || "Could not change module status.", "error");
        })
        .finally(function () {
          toggleBtn.disabled = false;
        });
    });
  }

  if (addLessonRowBtn) {
    addLessonRowBtn.addEventListener("click", function () {
      addLessonRow();
    });
  }

  if (lessonsRows) {
    lessonsRows.addEventListener("keydown", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var assetSelect = target.closest('select[data-field="video_asset_id"]');
      if (!assetSelect) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      var tr = assetSelect.closest("tr[data-row-index]");
      if (!tr) return;
      var rowKey = String(tr.getAttribute("data-row-key") || "").trim();
      if (!rowKey) return;

      var currentQuery = String(state.lessonAssetSearchByKey.get(rowKey) || "");
      var nextQuery = currentQuery;
      if (event.key === "Escape") {
        nextQuery = "";
      } else if (event.key === "Backspace" || event.key === "Delete") {
        nextQuery = currentQuery.slice(0, -1);
      } else if (event.key.length === 1) {
        nextQuery = currentQuery + event.key;
      } else {
        return;
      }

      event.preventDefault();
      state.lessonAssetSearchByKey.set(rowKey, nextQuery);
      var selectedAssetId = Number(assetSelect.value || 0);
      assetSelect.innerHTML = buildAssetOptions(selectedAssetId, nextQuery).join("");
    });

    lessonsRows.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;

      if (!target.matches("[data-remove-row]")) return;
      var tr = target.closest("tr[data-row-index]");
      if (!tr) return;
      var idx = Number(tr.getAttribute("data-row-index") || -1);
      if (!Number.isFinite(idx) || idx < 0) return;
      var removed = state.lessons[idx];
      var removedKey = String(removed && removed._row_key || "").trim();
      if (removedKey) state.lessonAssetSearchByKey.delete(removedKey);
      state.lessons.splice(idx, 1);
      renderLessonRows();
    });

    lessonsRows.addEventListener("change", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var assetSelect = target.closest('select[data-field="video_asset_id"]');
      if (!assetSelect) return;
      var tr = assetSelect.closest("tr[data-row-index]");
      if (!tr) return;
      var idx = Number(tr.getAttribute("data-row-index") || -1);
      if (Number.isFinite(idx) && idx >= 0 && idx < state.lessons.length) {
        state.lessons[idx].video_asset_id = Number(assetSelect.value || 0) || null;
      }
      var rowKey = String(tr.getAttribute("data-row-key") || "").trim();
      var query = rowKey ? String(state.lessonAssetSearchByKey.get(rowKey) || "") : "";
      assetSelect.innerHTML = buildAssetOptions(Number(assetSelect.value || 0), query).join("");
    });

    lessonsRows.addEventListener("dragstart", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      var tr = target.closest("tr[data-row-index]");
      if (!tr) return;
      dragLessonIndex = Number(tr.getAttribute("data-row-index") || -1);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(dragLessonIndex));
      }
      tr.classList.add("opacity-60");
    });

    lessonsRows.addEventListener("dragend", function (event) {
      var target = event.target;
      if (target instanceof HTMLElement) {
        var tr = target.closest("tr[data-row-index]");
        if (tr) tr.classList.remove("opacity-60");
      }
      dragLessonIndex = -1;
    });

    lessonsRows.addEventListener("dragover", function (event) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    });

    lessonsRows.addEventListener("drop", function (event) {
      event.preventDefault();
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      var tr = target.closest("tr[data-row-index]");
      if (!tr) return;
      var dropIndex = Number(tr.getAttribute("data-row-index") || -1);
      var fromIndex = dragLessonIndex;
      if (!Number.isFinite(fromIndex) || !Number.isFinite(dropIndex) || fromIndex < 0 || dropIndex < 0) return;
      if (fromIndex === dropIndex) return;

      var moved = state.lessons.splice(fromIndex, 1)[0];
      state.lessons.splice(dropIndex, 0, moved);
      state.lessons = state.lessons.map(function (row, idx) {
        row.lesson_order = idx + 1;
        return row;
      });
      renderLessonRows();
    });
  }

  if (saveModuleBtn) {
    saveModuleBtn.addEventListener("click", async function () {
      var payload = {
        id: state.selectedModuleId || null,
        course_slug: moduleCourseSlugInput ? moduleCourseSlugInput.value : "",
        module_title: moduleTitleInput ? moduleTitleInput.value : "",
        module_description: moduleDescriptionInput ? moduleDescriptionInput.value : "",
        sort_order: moduleSortOrderInput ? Number(moduleSortOrderInput.value || 0) : 0,
        is_active: moduleIsActiveInput ? Boolean(moduleIsActiveInput.checked) : true,
        drip_enabled: moduleDripEnabledInput ? Boolean(moduleDripEnabledInput.checked) : false,
        drip_schedules: collectModuleDripSchedulesFromForm(),
      };
      saveModuleBtn.disabled = true;
      setMessage("Saving module...", "");
      try {
        var res = await api("/.netlify/functions/admin-learning-module-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res || !res.module) throw new Error("Module save failed.");
        state.selectedModuleId = Number(res.module.id || 0);
        setMessage("Module saved successfully.", "ok");
        showToast("Module saved successfully.", "ok");
        await loadLibrary(state.selectedModuleId);
      } catch (error) {
        setMessage(error.message || "Could not save module.", "error");
      } finally {
        saveModuleBtn.disabled = false;
      }
    });
  }

  if (moduleCourseSlugInput) {
    moduleCourseSlugInput.addEventListener("change", function () {
      renderModuleDripScheduleRows(selectedModuleCourseSlug(), collectModuleDripSchedulesFromForm());
    });
  }

  if (addModuleDripScheduleRowBtn) {
    addModuleDripScheduleRowBtn.addEventListener("click", function () {
      var current = collectModuleDripSchedulesFromForm();
      current.push({ batch_key: "", access_mode: "immediate", drip_at: "" });
      renderModuleDripScheduleRows(selectedModuleCourseSlug(), current);
    });
  }

  if (moduleDripScheduleRows) {
    moduleDripScheduleRows.addEventListener("change", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var immediateInput = target.closest('[data-drip-field="is_immediate"]');
      if (!immediateInput) return;
      var row = immediateInput.closest("[data-drip-schedule-index]");
      if (!row) return;
      var dateInput = row.querySelector('[data-drip-field="drip_at"]');
      if (!dateInput) return;
      var isImmediate = !!immediateInput.checked;
      dateInput.disabled = isImmediate;
      if (isImmediate) {
        dateInput.classList.add("bg-gray-100", "text-gray-500");
      } else {
        dateInput.classList.remove("bg-gray-100", "text-gray-500");
      }
    });

    moduleDripScheduleRows.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var removeBtn = target.closest("[data-remove-drip-row]");
      if (!removeBtn) return;
      var index = Number(removeBtn.getAttribute("data-remove-drip-row") || -1);
      if (!(index >= 0)) return;
      var current = collectModuleDripSchedulesFromForm();
      current.splice(index, 1);
      renderModuleDripScheduleRows(selectedModuleCourseSlug(), current);
    });
  }

  if (saveCourseBtn) {
    saveCourseBtn.addEventListener("click", async function () {
      var isCreateMode = !(state.selectedCourseId > 0);
      var slugInput = courseSlugInput ? String(courseSlugInput.value || "").trim().toLowerCase() : "";
      var titleInput = courseTitleInput ? String(courseTitleInput.value || "").trim() : "";
      if (!slugInput && titleInput && courseSlugInput) {
        slugInput = slugifyCourse(titleInput);
        courseSlugInput.value = slugInput;
      }
      if (!slugInput) {
        setMessage("Course slug is required.", "error");
        return;
      }
      if (!titleInput) {
        setMessage("Course title is required.", "error");
        return;
      }
      var payload = {
        id: state.selectedCourseId > 0 ? state.selectedCourseId : null,
        course_slug: slugInput,
        course_title: titleInput,
        course_description: courseDescriptionInput ? String(courseDescriptionInput.value || "").trim() : "",
        is_published: courseIsPublishedInput ? Boolean(courseIsPublishedInput.checked) : false,
        release_at: courseReleaseAtInput ? String(courseReleaseAtInput.value || "").trim() : "",
      };
      saveCourseBtn.disabled = true;
      setMessage("Saving course...", "");
      try {
        var res = await api("/.netlify/functions/admin-learning-course-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res || !res.course) throw new Error("Course save failed.");
        state.selectedCourseId = Number(res.course.id || 0);
        if (isCreateMode) {
          setMessage("Course created successfully.", "ok");
          showToast("Course created successfully.", "ok");
        } else {
          setMessage("Course saved successfully.", "ok");
          showToast("Course details saved.", "ok");
        }
        await loadLibrary(state.selectedModuleId);
        var selected = state.courses.find(function (course) { return Number(course.id) === state.selectedCourseId; });
        hydrateCourseForm(selected || null);
        if (courseSelect && state.selectedCourseId > 0) courseSelect.value = String(state.selectedCourseId);
      } catch (error) {
        setMessage(error.message || "Could not save course.", "error");
      } finally {
        saveCourseBtn.disabled = false;
      }
    });
  }

  if (saveLessonsBtn) {
    saveLessonsBtn.addEventListener("click", async function () {
      if (!(state.selectedModuleId > 0)) {
        setMessage("Select or create a module first.", "error");
        return;
      }
      var lessons = collectLessonRows();
      saveLessonsBtn.disabled = true;
      setMessage("Saving lesson mapping...", "");
      try {
        await api("/.netlify/functions/admin-learning-lessons-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            module_id: state.selectedModuleId,
            replace_all: true,
            lessons: lessons,
          }),
        });
        var missingCaptions = lessons.filter(function (row) {
          return Boolean(row && row.is_active) && !String(row && row.captions_vtt_url || "").trim();
        }).length;
        var missingTranscript = lessons.filter(function (row) {
          return Boolean(row && row.is_active) && !String(row && row.transcript_text || "").trim();
        }).length;
        if (missingCaptions || missingTranscript) {
          setMessage(
            "Lessons saved. Accessibility warning (non-blocking): " +
              String(missingCaptions) +
              " active lesson(s) missing captions and " +
              String(missingTranscript) +
              " active lesson(s) missing transcript.",
            ""
          );
          showToast("Lessons saved with accessibility warning.", "ok");
        } else {
          setMessage("Lessons saved successfully.", "ok");
          showToast("Lesson order and mapping saved.", "ok");
        }
        await loadLibrary(state.selectedModuleId);
      } catch (error) {
        setMessage(error.message || "Could not save lessons.", "error");
        showToast(error.message || "Could not save lessons.", "error");
      } finally {
        saveLessonsBtn.disabled = false;
      }
    });
  }

  if (syncBtn) {
    syncBtn.addEventListener("click", async function () {
      var proceed = await requestActionConfirm({
        title: "Sync Cloudflare Assets",
        message: "This will fetch videos from Cloudflare Stream and update your internal video library mappings.",
      });
      if (!proceed) return;
      syncBtn.disabled = true;
      setMessage("Sync in progress...", "");
      try {
        var maxPages = Number(syncMaxPagesInput && syncMaxPagesInput.value || 20);
        var res = await api("/.netlify/functions/admin-learning-cloudflare-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxPages: maxPages }),
        });
        setMessage("Sync complete. Fetched " + res.fetched + " and upserted " + res.upserted + " assets.", "ok");
        showToast("Cloudflare sync completed.", "ok");
        await loadLibrary(state.selectedModuleId);
      } catch (error) {
        setMessage(error.message || "Cloudflare sync failed.", "error");
      } finally {
        syncBtn.disabled = false;
      }
    });
  }

  if (enableSignedPlaybackBtn) {
    enableSignedPlaybackBtn.addEventListener("click", async function () {
      var proceed = await requestActionConfirm({
        title: "Enable Signed Playback",
        message: "This will enforce Cloudflare signed playback on all lesson videos and create a signing key automatically if one is missing.",
      });
      if (!proceed) return;
      enableSignedPlaybackBtn.disabled = true;
      setMessage("Rotating signing key and enabling signed playback protection across all videos...", "");
      try {
        var res = await api("/.netlify/functions/admin-learning-stream-protection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apply_all: true, force_rotate_signing_key: true }),
        });
        var signingSource = (res && res.signing && res.signing.source) ? String(res.signing.source) : "unknown";
        var reasons = [];
        var reasonCounts = (res && res.failure_reason_counts && typeof res.failure_reason_counts === "object") ? res.failure_reason_counts : null;
        if (reasonCounts) {
          if (Number(reasonCounts.permission || 0) > 0) reasons.push("permission: " + Number(reasonCounts.permission || 0));
          if (Number(reasonCounts.not_found || 0) > 0) reasons.push("not_found: " + Number(reasonCounts.not_found || 0));
          if (Number(reasonCounts.invalid_request || 0) > 0) reasons.push("invalid_request: " + Number(reasonCounts.invalid_request || 0));
          if (Number(reasonCounts.other || 0) > 0) reasons.push("other: " + Number(reasonCounts.other || 0));
          if (Number(reasonCounts.unknown || 0) > 0) reasons.push("unknown: " + Number(reasonCounts.unknown || 0));
        }
        var sampleFailures = Array.isArray(res && res.failures) ? res.failures.slice(0, 2) : [];
        var sampleFailureText = sampleFailures
          .map(function (row) {
            return String(row.video_uid || "video") + " (" + String(row.reason || "other") + "): " + String(row.error || "failed");
          })
          .join(" | ");
        var msg = [
          "Signed playback protection complete.",
          "Videos scanned: " + Number(res.total_videos || 0),
          "Protected: " + Number(res.protected_videos || 0),
          "Failed: " + Number(res.failed_videos || 0),
          "Signing key: " + signingSource,
        ].join(" ");
        if (reasons.length) msg += " Reasons: " + reasons.join(", ") + ".";
        if (sampleFailureText) msg += " Samples: " + sampleFailureText;
        setMessage(msg, Number(res.failed_videos || 0) > 0 ? "error" : "ok");
        showToast(
          Number(res.failed_videos || 0) > 0
            ? "Signed playback applied with some failures. Check message panel."
            : "Signed playback enabled for lesson videos.",
          Number(res.failed_videos || 0) > 0 ? "error" : "ok"
        );
      } catch (error) {
        setMessage(error.message || "Could not enable signed playback protection.", "error");
      } finally {
        enableSignedPlaybackBtn.disabled = false;
      }
    });
  }

  async function runImport(applyMode) {
    var csvText = String(csvImportInput && csvImportInput.value || "");
    if (!csvText.trim()) {
      setMessage("Paste CSV text first.", "error");
      return;
    }
    var targetBtn = applyMode ? applyImportBtn : previewImportBtn;
    if (targetBtn) targetBtn.disabled = true;
    setMessage(applyMode ? "Applying CSV import..." : "Previewing CSV import...", "");
    try {
      var res = await api("/.netlify/functions/admin-learning-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv_text: csvText, apply: applyMode }),
      });

      if (importPreviewOutput) {
        importPreviewOutput.classList.remove("hidden");
        importPreviewOutput.textContent = JSON.stringify(res, null, 2);
      }

      if (applyMode) {
        setMessage("CSV import applied successfully.", "ok");
        showToast("CSV import applied.", "ok");
        await loadLibrary(state.selectedModuleId);
      } else {
        setMessage("Preview generated. Check details below.", "ok");
        showToast("CSV preview generated.", "ok");
      }
    } catch (error) {
      setMessage(error.message || "Import request failed.", "error");
    } finally {
      if (targetBtn) targetBtn.disabled = false;
    }
  }

  if (previewImportBtn) {
    previewImportBtn.addEventListener("click", function () {
      runImport(false);
    });
  }
  if (applyImportBtn) {
    applyImportBtn.addEventListener("click", function () {
      runImport(true);
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      logoutBtn.disabled = true;
      await fetch("/.netlify/functions/admin-logout", { method: "POST", credentials: "include" }).catch(function () {
        return null;
      });
      window.location.href = "/internal/";
    });
  }

  if (actionConfirmBackdrop) {
    actionConfirmBackdrop.addEventListener("click", function () {
      closeActionConfirm(false);
    });
  }
  if (actionConfirmCloseBtn) {
    actionConfirmCloseBtn.addEventListener("click", function () {
      closeActionConfirm(false);
    });
  }
  if (actionConfirmCancelBtn) {
    actionConfirmCancelBtn.addEventListener("click", function () {
      closeActionConfirm(false);
    });
  }
  if (actionConfirmConfirmBtn) {
    actionConfirmConfirmBtn.addEventListener("click", function () {
      closeActionConfirm(true);
    });
  }
  window.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (!actionConfirmModal || actionConfirmModal.getAttribute("aria-hidden") !== "false") return;
    closeActionConfirm(false);
  });

  showApp();
  clampHorizontalScroll();
  window.addEventListener("resize", clampHorizontalScroll);
  setMessage("Loading video library...", "");
  loadLibrary(0)
    .then(function () {
      setMessage("Video library ready.", "ok");
      clampHorizontalScroll();
    })
    .catch(function (error) {
      setMessage(error.message || "Could not load video library.", "error");
    });
})();
