(function () {
  var courseFilterEl = document.getElementById("progressCourseFilter");
  var enrollmentTypeFilterEl = document.getElementById("progressEnrollmentTypeFilter");
  var batchFilterEl = document.getElementById("progressBatchFilter");
  var searchInputEl = document.getElementById("progressSearchInput");
  var refreshBtnEl = document.getElementById("progressRefreshBtn");
  var messageEl = document.getElementById("progressMessage");
  var rowsEl = document.getElementById("progressRows");
  var detailCardEl = document.getElementById("progressDetailCard");
  var detailNameEl = document.getElementById("detailName");
  var detailEmailEl = document.getElementById("detailEmail");
  var detailProgressBarEl = document.getElementById("detailProgressBar");
  var detailProgressTextEl = document.getElementById("detailProgressText");
  var detailModulesEl = document.getElementById("detailModules");
  var detailCloseBtn = document.getElementById("detailCloseBtn");
  var detailBackdropBtn = document.getElementById("detailBackdrop");
  var adminLogoutBtn = document.getElementById("adminLogoutBtn");
  var latestDetailRequestId = 0;
  var debugEnabled = false;
  try {
    debugEnabled = window.location.search.indexOf("lp_debug=1") !== -1;
  } catch (_error) {
    debugEnabled = false;
  }

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
    messageEl.textContent = clean(text);
    messageEl.className = "mt-3 text-sm " + (bad ? "text-red-600" : "text-gray-600");
  }

  function hideDetailCard() {
    if (!detailCardEl) return;
    detailCardEl.hidden = true;
    detailCardEl.setAttribute("hidden", "hidden");
    detailCardEl.classList.add("hidden");
  }

  function showDetailCard() {
    if (!detailCardEl) return;
    detailCardEl.hidden = false;
    detailCardEl.removeAttribute("hidden");
    detailCardEl.classList.remove("hidden");
  }

  function setSelectOptions(selectEl, options, selectedValue) {
    if (!selectEl) return;
    var list = Array.isArray(options) ? options : [];
    selectEl.innerHTML = list
      .map(function (item) {
        var key = clean(item && item.key, 120) || "";
        var label = clean(item && item.label, 160) || key || "Option";
        var selected = key === clean(selectedValue, 120) ? ' selected="selected"' : "";
        return '<option value="' + escapeHtml(key) + '"' + selected + ">" + escapeHtml(label) + "</option>";
      })
      .join("");
  }

  async function api(url, options) {
    var opts = options || {};
    var response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (debugEnabled && opts.logStatus === true) {
      console.log("[learning-progress][debug] detail response", { url: url, status: response.status });
    }
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

  function renderRows(students, totalLessons) {
    if (!rowsEl) return;
    if (!students.length) {
      rowsEl.innerHTML = '<tr><td colspan="7" class="px-4 py-6 text-sm text-gray-500">No students found for this filter.</td></tr>';
      return;
    }

    rowsEl.innerHTML = students
      .map(function (student) {
        return [
          "<tr>",
          '<td class="px-4 py-3">',
          '<p class="font-semibold text-gray-900">' + escapeHtml(student.full_name || "Student") + "</p>",
          '<p class="text-xs text-gray-500">' + escapeHtml(student.email || "") + "</p>",
          '<div class="mt-1.5 flex flex-wrap gap-1.5">',
          '<span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">' + escapeHtml(student.enrollment_type === "school" ? "School" : "Individual") + "</span>",
          '<span class="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">' + escapeHtml(student.batch_label || "Unspecified Batch") + "</span>",
          (student.enrollment_type === "school" && student.school_name
            ? '<span class="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">' + escapeHtml(student.school_name) + "</span>"
            : ""),
          "</div>",
          "</td>",
          '<td class="px-4 py-3 text-gray-700">' + String(student.completed_lessons || 0) + " / " + String(totalLessons || 0) + "</td>",
          '<td class="px-4 py-3">',
          '<div class="w-36 max-w-full h-2 rounded-full bg-gray-100 overflow-hidden">',
          '<span class="block h-full bg-brand-600" style="width:' + String(student.completion_percent || 0) + '%"></span>',
          "</div>",
          '<p class="text-xs text-gray-500 mt-1">' + String(student.completion_percent || 0) + "%</p>",
          "</td>",
          '<td class="px-4 py-3 text-gray-600">',
          '<p class="text-sm text-gray-700">' + escapeHtml(student.last_watched_lesson_title || "-") + "</p>",
          '<p class="text-xs text-gray-500 mt-1">' + escapeHtml(fmtDate(student.last_watched_at || student.last_activity_at)) + "</p>",
          "</td>",
          '<td class="px-4 py-3 text-gray-600">' + escapeHtml(fmtDate(student.last_activity_at)) + "</td>",
          '<td class="px-4 py-3 text-gray-600">',
          '<div class="flex flex-wrap gap-1.5">' +
            (Array.isArray(student.module_breakdown) && student.module_breakdown.length
              ? student.module_breakdown
                  .map(function (moduleRow, idx) {
                    return (
                      '<span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700">M' +
                      String(idx + 1) +
                      ": " +
                      String(moduleRow.completion_percent || 0) +
                      "%</span>"
                    );
                  })
                  .join("")
              : '<span class="text-xs text-gray-400">-</span>') +
            "</div>",
          "</td>",
          '<td class="px-4 py-3 text-right">',
          '<button type="button" data-view-detail="1" data-account-id="' + String(student.account_id || "") + '" data-email="' + escapeHtml(student.email || "") + '" class="inline-flex w-full sm:w-auto items-center justify-center rounded-lg border border-gray-300 bg-white px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-gray-700 hover:bg-gray-50 whitespace-nowrap">View details</button>',
          "</td>",
          "</tr>",
        ].join("");
      })
      .join("");
  }

  function renderDetail(data) {
    if (!detailCardEl) return;
    showDetailCard();

    if (detailNameEl) detailNameEl.textContent = clean(data.student && data.student.full_name) || "Student";
    if (detailEmailEl) detailEmailEl.textContent = clean(data.student && data.student.email);

    var progress = data.progress || {};
    var percent = Number(progress.completion_percent || 0);
    if (detailProgressBarEl) detailProgressBarEl.style.width = String(percent) + "%";
    if (detailProgressTextEl) {
      detailProgressTextEl.textContent =
        String(progress.completed_lessons || 0) +
        " of " +
        String(progress.total_lessons || 0) +
        " lessons complete (" +
        String(percent) +
        "%)" +
        (progress.last_watched_lesson_title
          ? " • Last watched: " + clean(progress.last_watched_lesson_title) + " (" + fmtDate(progress.last_watched_at || progress.last_activity_at) + ")"
          : "");
    }

    var modules = Array.isArray(data.modules) ? data.modules : [];
    if (!modules.length) {
      detailModulesEl.innerHTML = '<p class="text-sm text-gray-500">No module data available.</p>';
      return;
    }

    detailModulesEl.innerHTML = modules
      .map(function (moduleRow, moduleIndex) {
        var lessons = Array.isArray(moduleRow.lessons) ? moduleRow.lessons : [];
        return [
          '<div class="rounded-xl border border-gray-200 p-4">',
          '<div class="flex items-start justify-between gap-3">',
          '<div>',
          '<p class="text-xs font-bold uppercase tracking-wide text-brand-600">Module ' + String(moduleIndex + 1) + "</p>",
          '<h4 class="text-base font-heading font-bold text-gray-900">' + escapeHtml(moduleRow.module_title || "Module") + "</h4>",
          "</div>",
          '<span class="inline-flex items-center rounded-full bg-brand-50 text-brand-700 px-3 py-1 text-xs font-bold">' +
            String(moduleRow.progress && moduleRow.progress.completion_percent || 0) +
            '%</span>',
          "</div>",
          '<div class="mt-3 space-y-2">' +
            lessons
              .map(function (lesson) {
                return [
                  '<div class="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">',
                  '<p class="text-sm font-medium text-gray-800">' + escapeHtml(lesson.lesson_title || "Lesson") + "</p>",
                  '<span class="text-xs font-semibold ' + (lesson.is_completed ? "text-emerald-700" : "text-gray-500") + '">' +
                    (lesson.is_completed ? "Completed" : "Not started") +
                    "</span>",
                  "</div>",
                ].join("");
              })
              .join("") +
            "</div>",
          "</div>",
        ].join("");
      })
      .join("");
  }

  async function loadList() {
    setMessage("Loading progress records...", false);
    var slug = clean(courseFilterEl && courseFilterEl.value || "prompt-to-profit").toLowerCase();
    var enrollmentType = clean(enrollmentTypeFilterEl && enrollmentTypeFilterEl.value || "all").toLowerCase();
    var batchKey = clean(batchFilterEl && batchFilterEl.value || "all").toLowerCase();
    var search = clean(searchInputEl && searchInputEl.value || "");
    var url =
      "/.netlify/functions/admin-learning-progress-list?course_slug=" +
      encodeURIComponent(slug) +
      "&enrollment_type=" +
      encodeURIComponent(enrollmentType) +
      "&batch_key=" +
      encodeURIComponent(batchKey) +
      "&search=" +
      encodeURIComponent(search);

    var data = await api(url);
    if (data && data.filters && Array.isArray(data.filters.available_batches)) {
      setSelectOptions(batchFilterEl, data.filters.available_batches, data.filters.batch_key || batchKey);
    }
    renderRows(Array.isArray(data.students) ? data.students : [], Number(data.total_lessons || 0));
    setMessage("Loaded " + String((data.students || []).length) + " student record(s).", false);
  }

  async function loadDetail(accountId, email) {
    var slug = clean(courseFilterEl && courseFilterEl.value || "prompt-to-profit").toLowerCase();
    var url =
      "/.netlify/functions/admin-learning-progress-detail?course_slug=" + encodeURIComponent(slug);
    if (Number.isFinite(Number(accountId)) && Number(accountId) > 0) {
      url += "&account_id=" + encodeURIComponent(String(Number(accountId)));
    }
    if (clean(email, 220)) {
      url += "&email=" + encodeURIComponent(clean(email, 220).toLowerCase());
    }
    if (debugEnabled) {
      console.log("[learning-progress][debug] detail request", { url: url });
    }

    var requestId = latestDetailRequestId + 1;
    latestDetailRequestId = requestId;

    if (detailModulesEl) {
      detailModulesEl.innerHTML = '<p class="text-sm text-gray-500">Loading details...</p>';
    }
    showDetailCard();

    var data = await api(url, { logStatus: true });
    if (requestId !== latestDetailRequestId) return;
    renderDetail(data);
  }

  if (rowsEl) {
    rowsEl.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== "function") return;
      var btn = target.closest("[data-view-detail]");
      if (!btn || !rowsEl.contains(btn)) return;

      var accountId = Number(btn.getAttribute("data-account-id") || 0);
      var email = clean(btn.getAttribute("data-email"), 220).toLowerCase();
      if ((!Number.isFinite(accountId) || accountId <= 0) && !email) {
        setMessage("Missing student identifier for details.", true);
        return;
      }
      if (debugEnabled) {
        console.log("[learning-progress][debug] detail click", {
          account_id: Number.isFinite(accountId) && accountId > 0 ? accountId : null,
          email: email || null,
        });
      }

      loadDetail(accountId, email).catch(function (error) {
        console.error("[learning-progress] detail load failed", {
          account_id: Number.isFinite(accountId) && accountId > 0 ? accountId : null,
          email: email || null,
          message: error && error.message ? error.message : "Unknown error",
        });
        setMessage(error.message || "Could not load student detail", true);
      });
    });
  }

  if (refreshBtnEl) {
    refreshBtnEl.addEventListener("click", function () {
      loadList().catch(function (error) {
        setMessage(error.message || "Could not load progress list.", true);
      });
    });
  }

  if (courseFilterEl) {
    courseFilterEl.addEventListener("change", function () {
      hideDetailCard();
      loadList().catch(function (error) {
        setMessage(error.message || "Could not load progress list.", true);
      });
    });
  }

  if (enrollmentTypeFilterEl) {
    enrollmentTypeFilterEl.addEventListener("change", function () {
      hideDetailCard();
      if (enrollmentTypeFilterEl.value === "school" && batchFilterEl) {
        batchFilterEl.value = "school";
      } else if (batchFilterEl && batchFilterEl.value === "school") {
        batchFilterEl.value = "all";
      }
      loadList().catch(function (error) {
        setMessage(error.message || "Could not load progress list.", true);
      });
    });
  }

  if (batchFilterEl) {
    batchFilterEl.addEventListener("change", function () {
      hideDetailCard();
      loadList().catch(function (error) {
        setMessage(error.message || "Could not load progress list.", true);
      });
    });
  }

  if (searchInputEl) {
    searchInputEl.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      loadList().catch(function (error) {
        setMessage(error.message || "Could not load progress list.", true);
      });
    });
  }

  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener("click", function () {
      fetch("/.netlify/functions/admin-logout", { method: "POST", credentials: "include" })
        .catch(function () {
          return null;
        })
        .finally(function () {
          window.location.href = "/internal/";
        });
    });
  }

  if (detailCloseBtn) {
    detailCloseBtn.addEventListener("click", function () {
      hideDetailCard();
    });
  }

  if (detailBackdropBtn) {
    detailBackdropBtn.addEventListener("click", function () {
      hideDetailCard();
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (!detailCardEl || detailCardEl.hidden) return;
    hideDetailCard();
  });

  hideDetailCard();

  loadList().catch(function (error) {
    setMessage(error.message || "Could not load progress list.", true);
  });
})();
