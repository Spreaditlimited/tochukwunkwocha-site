(function () {
  var appCard = document.getElementById("adminAppCard");
  var logoutBtn = document.getElementById("adminLogoutBtn");

  var messageEl = document.getElementById("videoLibraryMessage");
  var syncBtn = document.getElementById("syncCloudflareBtn");
  var syncMaxPagesInput = document.getElementById("syncMaxPagesInput");

  var moduleSelect = document.getElementById("moduleSelect");
  var moduleRows = document.getElementById("moduleRows");
  var moduleCourseSlugInput = document.getElementById("moduleCourseSlugInput");
  var moduleTitleInput = document.getElementById("moduleTitleInput");
  var moduleDescriptionInput = document.getElementById("moduleDescriptionInput");
  var moduleSortOrderInput = document.getElementById("moduleSortOrderInput");
  var moduleIsActiveInput = document.getElementById("moduleIsActiveInput");
  var saveModuleBtn = document.getElementById("saveModuleBtn");

  var lessonsRows = document.getElementById("lessonsRows");
  var addLessonRowBtn = document.getElementById("addLessonRowBtn");
  var saveLessonsBtn = document.getElementById("saveLessonsBtn");

  var csvImportInput = document.getElementById("csvImportInput");
  var previewImportBtn = document.getElementById("previewImportBtn");
  var applyImportBtn = document.getElementById("applyImportBtn");
  var importPreviewOutput = document.getElementById("importPreviewOutput");

  var state = {
    modules: [],
    assets: [],
    lessons: [],
    selectedModuleId: 0,
  };
  var dragLessonIndex = -1;
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
      throw new Error(err);
    }
    return payload;
  }

  function assetLabel(asset) {
    var name = String(asset.filename || "").trim() || ("Video " + asset.video_uid);
    return name + " (" + asset.video_uid + ")";
  }

  function moduleLabel(mod) {
    return "[" + mod.course_slug + "] " + mod.module_title;
  }

  function renderModuleSelect() {
    if (!moduleSelect) return;
    var options = ['<option value="">Create new module</option>'];
    state.modules.forEach(function (mod) {
      options.push('<option value="' + escapeHtml(mod.id) + '">' + escapeHtml(moduleLabel(mod)) + "</option>");
    });
    moduleSelect.innerHTML = options.join("");
    if (state.selectedModuleId > 0) moduleSelect.value = String(state.selectedModuleId);
  }

  function renderModuleRows() {
    if (!moduleRows) return;
    if (!state.modules.length) {
      moduleRows.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-sm text-gray-500">No modules yet.</td></tr>';
      return;
    }
    moduleRows.innerHTML = state.modules.map(function (mod) {
      var isActive = Number(mod.is_active || 0) !== 0;
      var activeBadge = isActive
        ? '<span class="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">published</span>'
        : '<span class="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">unpublished</span>';
      var toggleLabel = isActive ? "Unpublish" : "Publish";
      return [
        "<tr>",
        '<td class="px-3 py-2 text-sm font-medium text-gray-700">' + escapeHtml(mod.course_slug || "-") + "</td>",
        '<td class="px-3 py-2 text-sm font-semibold text-gray-900">' + escapeHtml(mod.module_title || "-") + "</td>",
        '<td class="px-3 py-2 text-sm text-gray-700">' + escapeHtml(mod.lesson_count || 0) + "</td>",
        '<td class="px-3 py-2">' + activeBadge + "</td>",
        '<td class="px-3 py-2"><div class="flex flex-wrap gap-2">' +
          '<button type="button" data-select-module="' + escapeHtml(mod.id) + '" class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Open</button>' +
          '<button type="button" data-toggle-module="' + escapeHtml(mod.id) + '" class="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">' + toggleLabel + "</button>" +
          "</div></td>",
        "</tr>",
      ].join("");
    }).join("");
  }

  function renderLessonRows() {
    if (!lessonsRows) return;
    var rows = state.lessons || [];
    if (!rows.length) {
      lessonsRows.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-sm text-gray-500">No lessons yet. Add rows and save.</td></tr>';
      return;
    }

    lessonsRows.innerHTML = rows.map(function (row, idx) {
      var selectedAssetId = Number(row.video_asset_id || 0);
      var assetOptions = ['<option value="">Select asset</option>'];
      state.assets.forEach(function (asset) {
        var selected = selectedAssetId === Number(asset.id) ? ' selected' : "";
        assetOptions.push('<option value="' + escapeHtml(asset.id) + '"' + selected + ">" + escapeHtml(assetLabel(asset)) + "</option>");
      });

      return [
        '<tr draggable="true" data-row-index="' + idx + '" data-lesson-id="' + escapeHtml(row.id || "") + '" class="cursor-move">',
        '<td class="px-3 py-2"><span class="inline-flex rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-500">::</span></td>',
        '<td class="px-3 py-2"><input data-field="lesson_title" type="text" class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value="' + escapeHtml(row.lesson_title || "") + '" /></td>',
        '<td class="px-3 py-2"><input data-field="lesson_order" type="number" class="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm" value="' + escapeHtml(row.lesson_order || idx + 1) + '" /></td>',
        '<td class="px-3 py-2"><select data-field="video_asset_id" class="min-w-[18rem] rounded-lg border border-gray-300 px-3 py-2 text-sm">' + assetOptions.join("") + "</select></td>",
        '<td class="px-3 py-2"><label class="inline-flex items-center gap-2 text-xs font-medium text-gray-600"><input data-field="is_active" type="checkbox" ' + (Number(row.is_active) === 0 ? "" : "checked") + ' class="h-4 w-4 rounded border-gray-300 text-brand-600" />Active</label></td>',
        '<td class="px-3 py-2"><button type="button" data-remove-row class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Remove</button></td>',
        "</tr>",
      ].join("");
    }).join("");
  }

  function hydrateModuleForm(mod) {
    if (!mod) {
      if (moduleCourseSlugInput) moduleCourseSlugInput.value = "";
      if (moduleTitleInput) moduleTitleInput.value = "";
      if (moduleDescriptionInput) moduleDescriptionInput.value = "";
      if (moduleSortOrderInput) moduleSortOrderInput.value = "0";
      if (moduleIsActiveInput) moduleIsActiveInput.checked = true;
      return;
    }
    if (moduleCourseSlugInput) moduleCourseSlugInput.value = String(mod.course_slug || "");
    if (moduleTitleInput) moduleTitleInput.value = String(mod.module_title || "");
    if (moduleDescriptionInput) moduleDescriptionInput.value = String(mod.module_description || "");
    if (moduleSortOrderInput) moduleSortOrderInput.value = String(mod.sort_order || 0);
    if (moduleIsActiveInput) moduleIsActiveInput.checked = Number(mod.is_active || 0) !== 0;
  }

  async function loadLibrary(moduleId) {
    var moduleParam = Number(moduleId || state.selectedModuleId || 0);
    var url = "/.netlify/functions/admin-learning-library-list";
    if (moduleParam > 0) url += "?module_id=" + encodeURIComponent(moduleParam);

    var payload = await api(url, { method: "GET", headers: { Accept: "application/json" } });
    if (!payload) return;
    state.modules = Array.isArray(payload.modules) ? payload.modules : [];
    state.assets = Array.isArray(payload.assets) ? payload.assets : [];
    state.lessons = Array.isArray(payload.lessons) ? payload.lessons : [];
    state.selectedModuleId = moduleParam > 0 ? moduleParam : 0;

    renderModuleSelect();
    renderModuleRows();
    renderLessonRows();
    if (state.selectedModuleId > 0) {
      var selected = state.modules.find(function (mod) { return Number(mod.id) === state.selectedModuleId; });
      hydrateModuleForm(selected || null);
    } else {
      hydrateModuleForm(null);
    }
  }

  function collectLessonRows() {
    var rows = Array.prototype.slice.call(lessonsRows.querySelectorAll("tr[data-row-index]"));
    return rows.map(function (tr) {
      var lessonId = Number(tr.getAttribute("data-lesson-id") || 0);
      var titleInput = tr.querySelector('input[data-field="lesson_title"]');
      var orderInput = tr.querySelector('input[data-field="lesson_order"]');
      var assetInput = tr.querySelector('select[data-field="video_asset_id"]');
      var activeInput = tr.querySelector('input[data-field="is_active"]');
      return {
        id: lessonId > 0 ? lessonId : null,
        lesson_title: String(titleInput && titleInput.value || "").trim(),
        lesson_order: Number(orderInput && orderInput.value || 1),
        video_asset_id: Number(assetInput && assetInput.value || 0) || null,
        is_active: Boolean(activeInput && activeInput.checked),
      };
    });
  }

  function addLessonRow(initial) {
    var nextOrder = state.lessons.length + 1;
    state.lessons.push(Object.assign({
      id: null,
      lesson_title: "",
      lesson_order: nextOrder,
      video_asset_id: null,
      is_active: 1,
    }, initial || {}));
    renderLessonRows();
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
      if (!toggleBtn) return;
      var toggleId = Number(toggleBtn.getAttribute("data-toggle-module") || 0);
      if (!(toggleId > 0)) return;

      var mod = state.modules.find(function (m) { return Number(m.id) === toggleId; });
      if (!mod) return;
      var nextActive = Number(mod.is_active || 0) === 0;

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
        }),
      })
        .then(function () {
          setMessage(nextActive ? "Module published." : "Module unpublished.", "ok");
          showToast(nextActive ? "Module published successfully." : "Module unpublished successfully.", "ok");
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
    lessonsRows.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.matches("[data-remove-row]")) return;
      var tr = target.closest("tr[data-row-index]");
      if (!tr) return;
      var idx = Number(tr.getAttribute("data-row-index") || -1);
      if (!Number.isFinite(idx) || idx < 0) return;
      state.lessons.splice(idx, 1);
      renderLessonRows();
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
        await loadLibrary(state.selectedModuleId);
      } catch (error) {
        setMessage(error.message || "Could not save module.", "error");
      } finally {
        saveModuleBtn.disabled = false;
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
        setMessage("Lessons saved successfully.", "ok");
        showToast("Lesson order and mapping saved.", "ok");
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
        await loadLibrary(state.selectedModuleId);
      } catch (error) {
        setMessage(error.message || "Cloudflare sync failed.", "error");
      } finally {
        syncBtn.disabled = false;
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
        await loadLibrary(state.selectedModuleId);
      } else {
        setMessage("Preview generated. Check details below.", "ok");
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

  showApp();
  setMessage("Loading video library...", "");
  loadLibrary(0)
    .then(function () {
      setMessage("Video library ready.", "ok");
    })
    .catch(function (error) {
      setMessage(error.message || "Could not load video library.", "error");
    });
})();
