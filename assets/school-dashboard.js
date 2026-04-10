(function () {
  var SIGNOUT_MARKER_KEY = "tn_auth_just_signed_out";
  var SCHOOL_WELCOME_KEY = "school_dashboard_welcome_notice_v1";
  var SCHOOL_WELCOME_DURATION_MS = 5 * 60 * 1000;
  var WELCOME_MESSAGE =
    "Welcome to Prompt to Profit for Schools. Your school is now enrolled, and you can start onboarding students right away. The program is fully pre-recorded end-to-end, and your access is active for 12 months.";
  var welcomeEl = document.getElementById("schoolWelcomeNotice");
  var metaEl = document.getElementById("schoolDashboardMeta");
  var metricSeatsEl = document.getElementById("metricSeats");
  var metricSeatsSubEl = document.getElementById("metricSeatsSub");
  var metricAvgCompletionEl = document.getElementById("metricAvgCompletion");
  var metricActive7El = document.getElementById("metricActive7");
  var metricExpiryEl = document.getElementById("metricExpiry");
  var rowsEl = document.getElementById("schoolStudentsRows");
  var uploadStatusEl = document.getElementById("studentsUploadStatus");
  var uploadBtn = document.getElementById("studentsUploadBtn");
  var csvInput = document.getElementById("studentsCsvInput");
  var csvFile = document.getElementById("studentsCsvFile");
  var singleNameEl = document.getElementById("singleStudentName");
  var singleEmailEl = document.getElementById("singleStudentEmail");
  var singleAddBtn = document.getElementById("singleStudentAddBtn");
  var logoutBtn = document.getElementById("schoolLogoutBtn");

  function clean(value) {
    return String(value || "").trim();
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

  function readWelcomeNotice() {
    try {
      var raw = window.localStorage.getItem(SCHOOL_WELCOME_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || Number(parsed.expiresAt || 0) < Date.now()) return null;
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function clearWelcomeNotice() {
    try {
      window.localStorage.removeItem(SCHOOL_WELCOME_KEY);
    } catch (_error) {}
  }

  function consumeWelcomeFromQuery() {
    try {
      var url = new URL(window.location.href);
      var marker = clean(url.searchParams.get("welcome")).toLowerCase();
      if (marker !== "school_enrolled") return;
      window.localStorage.setItem(
        SCHOOL_WELCOME_KEY,
        JSON.stringify({
          message: WELCOME_MESSAGE,
          expiresAt: Date.now() + SCHOOL_WELCOME_DURATION_MS,
        })
      );
      url.searchParams.delete("welcome");
      window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : "") + url.hash);
    } catch (_error) {}
  }

  function renderWelcomeNotice() {
    if (!welcomeEl) return;
    var notice = readWelcomeNotice();
    if (!notice) {
      clearWelcomeNotice();
      welcomeEl.classList.add("hidden");
      welcomeEl.textContent = "";
      return;
    }
    welcomeEl.textContent = clean(notice.message) || WELCOME_MESSAGE;
    welcomeEl.classList.remove("hidden");
    window.setTimeout(function () {
      clearWelcomeNotice();
      welcomeEl.classList.add("hidden");
      welcomeEl.textContent = "";
    }, Math.max(0, Number(notice.expiresAt || 0) - Date.now()));
  }

  function setUploadStatus(text, bad) {
    if (!uploadStatusEl) return;
    uploadStatusEl.textContent = clean(text);
    uploadStatusEl.className = "text-sm " + (bad ? "text-red-600" : "text-gray-600");
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
      window.location.href = "/schools/login/";
      throw new Error("Not signed in");
    }
    if (!response.ok || !data || data.ok !== true) {
      throw new Error((data && data.error) || "Request failed");
    }
    return data;
  }

  function renderSummary(data) {
    var admin = data && data.admin ? data.admin : {};
    var metrics = data && data.metrics ? data.metrics : {};
    if (metaEl) {
      metaEl.textContent = clean(admin.schoolName) + " • Course: " + clean(admin.courseSlug) + " • Admin: " + clean(admin.fullName);
    }
    if (metricSeatsEl) metricSeatsEl.textContent = String(metrics.seats_used || 0) + " / " + String(metrics.seats_purchased || 0);
    if (metricSeatsSubEl) metricSeatsSubEl.textContent = "Available: " + String(metrics.seats_available || 0);
    if (metricAvgCompletionEl) metricAvgCompletionEl.textContent = String(metrics.average_completion_percent || 0) + "%";
    if (metricActive7El) metricActive7El.textContent = String(metrics.active_last_7_days || 0);
    if (metricExpiryEl) metricExpiryEl.textContent = fmtDate(metrics.access_expires_at);
  }

  function renderStudents(students) {
    if (!rowsEl) return;
    if (!students.length) {
      rowsEl.innerHTML = '<tr><td colspan="7" class="px-4 py-6 text-sm text-slate-500">No students yet.</td></tr>';
      return;
    }
    rowsEl.innerHTML = students.map(function (student) {
      var isActive = String(student.status || "").toLowerCase() === "active";
      var completed = Number(student.completion_percent || 0) >= 100;
      var hasWebsite = clean(student.website_url).length > 0;
      var canIssue = completed && isActive && hasWebsite;
      var certBtnLabel = "Issue cert";
      return [
        "<tr>",
        '<td class="px-4 py-3">',
        '<p class="font-semibold text-slate-900">' + escapeHtml(student.full_name || "Student") + "</p>",
        '<p class="text-xs text-slate-500">' + escapeHtml(student.email || "") + "</p>",
        "</td>",
        '<td class="px-4 py-3 text-slate-700">' + String(student.completion_percent || 0) + "%</td>",
        '<td class="px-4 py-3 text-slate-600">' + escapeHtml(fmtDate(student.last_activity_at)) + "</td>",
        '<td class="px-4 py-3 text-slate-700">' + (hasWebsite
          ? ('<a class="text-brand-700 underline hover:text-brand-900" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(student.website_url) + '">View site</a>')
          : '<span class="text-slate-400">Not submitted</span>') + "</td>",
        '<td class="px-4 py-3 text-slate-600">' + escapeHtml(fmtDate(student.website_submitted_at)) + "</td>",
        '<td class="px-4 py-3"><span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ' +
          (String(student.status || "").toLowerCase() === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700") +
          '">' + escapeHtml(student.status || "active") + "</span></td>",
        '<td class="px-4 py-3">',
        '<div class="flex min-w-[9rem] flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">',
        '<button type="button" data-student-toggle="' + String(student.id) + '" data-next-active="' + (String(student.status || "").toLowerCase() === "active" ? "0" : "1") + '" class="inline-flex w-full sm:w-auto items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap">' +
          (String(student.status || "").toLowerCase() === "active" ? "Disable" : "Enable") +
          "</button>",
        '<button type="button" data-student-cert="' + String(student.id) + '" class="inline-flex w-full sm:w-auto items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap ' + (canIssue ? "" : "opacity-40 cursor-not-allowed") + '"' + (canIssue ? "" : " disabled") + ">" + certBtnLabel + "</button>",
        "</div>",
        "</td>",
        "</tr>",
      ].join("");
    }).join("");

    Array.prototype.slice.call(rowsEl.querySelectorAll("[data-student-toggle]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var studentId = Number(btn.getAttribute("data-student-toggle") || 0);
        var nextActive = String(btn.getAttribute("data-next-active") || "") === "1";
        toggleStatus(studentId, nextActive).catch(function (error) {
          setUploadStatus(error.message || "Could not update status", true);
        });
      });
    });

    Array.prototype.slice.call(rowsEl.querySelectorAll("[data-student-cert]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var studentId = Number(btn.getAttribute("data-student-cert") || 0);
        issueCertificate(studentId).catch(function (error) {
          setUploadStatus(error.message || "Could not issue certificate", true);
        });
      });
    });
  }

  async function loadSummary() {
    var data = await api("/.netlify/functions/school-dashboard-summary");
    renderSummary(data);
  }

  async function loadStudents() {
    var data = await api("/.netlify/functions/school-students-list");
    renderStudents(Array.isArray(data.students) ? data.students : []);
  }

  async function toggleStatus(studentId, active) {
    await api("/.netlify/functions/school-student-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        studentId: studentId,
        active: !!active,
      }),
    });
    await Promise.all([loadSummary(), loadStudents()]);
  }

  async function issueCertificate(studentId) {
    var data = await api("/.netlify/functions/school-certificate-issue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ studentId: studentId }),
    });
    var label = "Certificate issued: " + clean(data.certificate && data.certificate.certificateNo);
    setUploadStatus(label, false);
    var certUrl = clean(data && data.certificate && data.certificate.certificateUrl);
    if (certUrl) {
      try {
        window.open(certUrl, "_blank", "noopener,noreferrer");
      } catch (_error) {}
    }
  }

  if (csvFile) {
    csvFile.addEventListener("change", function () {
      var file = csvFile.files && csvFile.files[0] ? csvFile.files[0] : null;
      if (!file) return;
      file.text().then(function (text) {
        if (csvInput) csvInput.value = text;
      }).catch(function () {
        setUploadStatus("Could not read CSV file.", true);
      });
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", function () {
      var csv = clean(csvInput && csvInput.value);
      if (!csv) {
        setUploadStatus("Paste CSV content or choose a CSV file.", true);
        return;
      }
      uploadBtn.disabled = true;
      uploadBtn.textContent = "Uploading...";
      api("/.netlify/functions/school-students-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ csv: csv }),
      })
        .then(function (data) {
          var result = data && data.result ? data.result : {};
          setUploadStatus(
            "Created: " + String(result.created || 0) +
              ", Updated: " + String(result.updated || 0) +
              ", Invites sent: " + String(result.invites_sent || 0) +
              (Number(result.invites_failed || 0) > 0 ? ", Invite failures: " + String(result.invites_failed || 0) : "") +
              (Array.isArray(result.errors) && result.errors.length ? ", Errors: " + String(result.errors.length) : ""),
            false
          );
          return Promise.all([loadSummary(), loadStudents()]);
        })
        .catch(function (error) {
          setUploadStatus(error.message || "Could not upload students.", true);
        })
        .finally(function () {
          uploadBtn.disabled = false;
          uploadBtn.textContent = "Upload Students";
        });
    });
  }

  if (singleAddBtn) {
    singleAddBtn.addEventListener("click", function () {
      var fullName = clean(singleNameEl && singleNameEl.value);
      var email = clean(singleEmailEl && singleEmailEl.value).toLowerCase();
      if (!fullName || !email) {
        setUploadStatus("Full name and email are required.", true);
        return;
      }

      singleAddBtn.disabled = true;
      singleAddBtn.textContent = "Adding...";
      api("/.netlify/functions/school-student-add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          email: email,
        }),
      })
        .then(function (data) {
          var result = data && data.result ? data.result : {};
          setUploadStatus(
            "Added. Created: " + String(result.created || 0) +
              ", Updated: " + String(result.updated || 0) +
              ", Reactivated: " + String(result.reactivated || 0) +
              ", Invites sent: " + String(result.invites_sent || 0) +
              (Number(result.invites_failed || 0) > 0 ? ", Invite failures: " + String(result.invites_failed || 0) : ""),
            false
          );
          if (singleNameEl) singleNameEl.value = "";
          if (singleEmailEl) singleEmailEl.value = "";
          return Promise.all([loadSummary(), loadStudents()]);
        })
        .catch(function (error) {
          setUploadStatus(error.message || "Could not add student.", true);
        })
        .finally(function () {
          singleAddBtn.disabled = false;
          singleAddBtn.textContent = "Add Student";
        });
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      fetch("/.netlify/functions/school-admin-logout", {
        method: "POST",
        credentials: "include",
      })
        .catch(function () {
          return null;
        })
        .finally(function () {
          try {
            sessionStorage.setItem(SIGNOUT_MARKER_KEY, "1");
          } catch (_error) {}
          window.location.href = "/schools/login/";
        });
    });
  }

  consumeWelcomeFromQuery();
  renderWelcomeNotice();

  Promise.all([loadSummary(), loadStudents()]).catch(function (error) {
    if (metaEl) metaEl.textContent = error.message || "Could not load school dashboard.";
  });
})();
