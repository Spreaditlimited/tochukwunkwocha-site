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
  var advancedSeatsPurchasedEl = document.getElementById("advancedSeatsPurchased");
  var advancedSeatsUsedEl = document.getElementById("advancedSeatsUsed");
  var advancedSeatsAvailableEl = document.getElementById("advancedSeatsAvailable");
  var advancedStatusTextEl = document.getElementById("advancedStatusText");
  var advancedCandidatesListEl = document.getElementById("advancedCandidatesList");
  var advancedActionStatusEl = document.getElementById("advancedActionStatus");
  var advancedSeatCountEl = document.getElementById("advancedSeatCount");
  var advancedBuyBtn = document.getElementById("advancedBuyBtn");
  var advancedUpgradeAllBtn = document.getElementById("advancedUpgradeAllBtn");
  var advancedUpgradeSelectedBtn = document.getElementById("advancedUpgradeSelectedBtn");
  var advancedPurchaseModalEl = document.getElementById("advancedPurchaseModal");
  var advancedPurchaseModalOverlayEl = document.getElementById("advancedPurchaseModalOverlay");
  var advancedPurchaseModalCloseBtn = document.getElementById("advancedPurchaseModalCloseBtn");
  var advancedModalCancelBtn = document.getElementById("advancedModalCancelBtn");
  var advancedModalContinueBtn = document.getElementById("advancedModalContinueBtn");
  var advancedModalSeatsEl = document.getElementById("advancedModalSeats");
  var advancedModalBasePriceEl = document.getElementById("advancedModalBasePrice");
  var advancedModalDiscountEl = document.getElementById("advancedModalDiscount");
  var advancedModalDiscountedPriceEl = document.getElementById("advancedModalDiscountedPrice");
  var advancedModalTotalEl = document.getElementById("advancedModalTotal");
  var latestAdvancedQuote = null;
  var advancedPaymentStatusModalEl = document.getElementById("advancedPaymentStatusModal");
  var advancedPaymentStatusModalOverlayEl = document.getElementById("advancedPaymentStatusModalOverlay");
  var advancedPaymentStatusModalCloseBtn = document.getElementById("advancedPaymentStatusModalCloseBtn");
  var advancedPaymentStatusModalOkBtn = document.getElementById("advancedPaymentStatusModalOkBtn");
  var advancedPaymentStatusModalTitleEl = document.getElementById("advancedPaymentStatusModalTitle");
  var advancedPaymentStatusModalBodyEl = document.getElementById("advancedPaymentStatusModalBody");
  var advancedLearnMoreBtn = document.getElementById("advancedLearnMoreBtn");
  var advancedLearnModalEl = document.getElementById("advancedLearnModal");
  var advancedLearnModalOverlayEl = document.getElementById("advancedLearnModalOverlay");
  var advancedLearnModalCloseBtn = document.getElementById("advancedLearnModalCloseBtn");
  var advancedLearnModalOkBtn = document.getElementById("advancedLearnModalOkBtn");
  var advancedLearnModalBodyEl = document.getElementById("advancedLearnModalBody");
  var advancedLearnContentLoaded = false;

  function clean(value) {
    return String(value || "").trim();
  }

  function isSyntheticStudentEmail(value) {
    var email = clean(value).toLowerCase();
    return email.indexOf("@student-code.local") !== -1;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtNairaFromMinor(value) {
    var num = Number(value || 0) / 100;
    return "₦" + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  var toastWrap = null;
  function ensureToastWrap() {
    if (toastWrap && document.body.contains(toastWrap)) return toastWrap;
    toastWrap = document.createElement("div");
    toastWrap.className = "fixed top-4 right-4 z-[90] flex w-[min(92vw,24rem)] flex-col gap-2";
    document.body.appendChild(toastWrap);
    return toastWrap;
  }

  function showToast(message, bad) {
    try {
      var wrap = ensureToastWrap();
      var classes = "rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur transition-all duration-300";
      classes += bad
        ? " border-red-200 bg-red-50/95 text-red-800"
        : " border-emerald-200 bg-emerald-50/95 text-emerald-800";

      var toast = document.createElement("div");
      toast.className = classes + " opacity-0 translate-y-[-6px]";
      toast.textContent = clean(message);
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
      }, 2200);
    } catch (_error) {}
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
      rowsEl.innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-sm text-slate-500">No students yet.</td></tr>';
      return;
    }
    rowsEl.innerHTML = students.map(function (student) {
      var isActive = String(student.status || "").toLowerCase() === "active";
      var completed = Number(student.completion_percent || 0) >= 100;
      var hasWebsite = clean(student.website_url).length > 0;
      var canIssue = completed && isActive && hasWebsite;
      var hasCertificate = clean(student.certificate_no).length > 0;
      var certBtnLabel = "Issue cert";
      return [
        "<tr>",
        '<td class="px-4 py-3">',
        '<p class="font-semibold text-slate-900">' + escapeHtml(student.full_name || "Student") + "</p>",
        '<p class="text-xs text-slate-500">' + escapeHtml(isSyntheticStudentEmail(student.email) ? "" : (student.email || "")) + "</p>",
        "</td>",
        '<td class="px-4 py-3">',
        '<div class="flex items-center gap-2">',
        '<code class="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">' + escapeHtml(student.student_code || "-") + "</code>",
        '<button type="button" data-student-code-copy="' + escapeHtml(student.student_code || "") + '" class="inline-flex items-center justify-center rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">Copy</button>',
        "</div>",
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
        '<button type="button" data-student-code-reset="' + String(student.id) + '" class="inline-flex w-full sm:w-auto items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap">Reset code</button>',
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

    Array.prototype.slice.call(rowsEl.querySelectorAll("[data-student-code-reset]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var studentId = Number(btn.getAttribute("data-student-code-reset") || 0);
        if (!(studentId > 0)) return;
        resetStudentCode(studentId).catch(function (error) {
          setUploadStatus(error.message || "Could not reset student code", true);
        });
      });
    });


    Array.prototype.slice.call(rowsEl.querySelectorAll("[data-student-code-copy]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var code = clean(btn.getAttribute("data-student-code-copy"));
        if (!code) return;
        Promise.resolve(
          navigator && navigator.clipboard && navigator.clipboard.writeText
            ? navigator.clipboard.writeText(code)
            : null
        ).then(function () {
          showToast("Copied student code", false);
        }).catch(function () {
          showToast("Could not copy code. Copy manually.", true);
        });
      });
    });
  }

  async function loadSummary() {
    var data = await api("/.netlify/functions/school-dashboard-summary");
    renderSummary(data);
  }

  function setAdvancedStatus(text, bad) {
    if (!advancedActionStatusEl) return;
    advancedActionStatusEl.textContent = clean(text);
    advancedActionStatusEl.className = "mt-2 text-sm min-h-[1.25rem] " + (bad ? "text-red-600" : "text-gray-600");
  }

  function renderAdvancedCandidates(students) {
    if (!advancedCandidatesListEl) return;
    if (!students.length) {
      advancedCandidatesListEl.innerHTML = '<p class="text-gray-500">No students found.</p>';
      return;
    }
    advancedCandidatesListEl.innerHTML = students.map(function (student) {
      var disabled = !student.eligible;
      var note = student.already_upgraded ? "Already upgraded" : (student.ineligible_reason === "inactive_student" ? "Inactive" : "");
      return [
        '<label class="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-50">',
        '<span class="flex items-center gap-2">',
        '<input type="checkbox" data-advanced-student="' + String(student.id) + '"' + (disabled ? " disabled" : "") + " />",
        '<span>',
        '<span class="font-medium text-gray-900">' + escapeHtml(student.full_name || "Student") + "</span>",
        '<span class="ml-2 text-xs text-gray-500">' + escapeHtml(student.student_code || "") + "</span>",
        "</span>",
        "</span>",
        '<span class="text-xs ' + (disabled ? "text-gray-500" : "text-emerald-700") + '">' + escapeHtml(disabled ? note : "Eligible") + "</span>",
        "</label>",
      ].join("");
    }).join("");
  }

  function selectedAdvancedStudentIds() {
    if (!advancedCandidatesListEl) return [];
    return Array.prototype.slice.call(advancedCandidatesListEl.querySelectorAll("input[data-advanced-student]:checked"))
      .map(function (el) { return Number(el.getAttribute("data-advanced-student") || 0); })
      .filter(function (id) { return id > 0; });
  }

  async function loadAdvancedSummary() {
    var data = await api("/.netlify/functions/school-advanced-summary");
    var advanced = data && data.advanced ? data.advanced : {};
    if (advancedSeatsPurchasedEl) advancedSeatsPurchasedEl.textContent = String(advanced.seats_purchased || 0);
    if (advancedSeatsUsedEl) advancedSeatsUsedEl.textContent = String(advanced.seats_used || 0);
    if (advancedSeatsAvailableEl) advancedSeatsAvailableEl.textContent = String(advanced.seats_available || 0);
    if (advancedStatusTextEl) {
      advancedStatusTextEl.textContent = Number(advanced.seats_available || 0) > 0
        ? "Advanced upgrades unlocked"
        : "Buy Advanced Seats to unlock upgrades";
    }
  }

  async function loadAdvancedCandidates() {
    var data = await api("/.netlify/functions/school-advanced-upgrade-candidates");
    renderAdvancedCandidates(Array.isArray(data.students) ? data.students : []);
  }

  async function buyAdvancedSeats() {
    var seatCount = Number(advancedSeatCountEl && advancedSeatCountEl.value || 0);
    var data = await api("/.netlify/functions/school-advanced-purchase-create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ seatCount: seatCount }),
    });
    var checkoutUrl = clean(data && data.checkoutUrl);
    if (!checkoutUrl) throw new Error("Could not start checkout.");
    window.location.href = checkoutUrl;
  }

  function toggleAdvancedPurchaseModal(show) {
    if (!advancedPurchaseModalEl) return;
    advancedPurchaseModalEl.classList.toggle("hidden", !show);
    advancedPurchaseModalEl.setAttribute("aria-hidden", show ? "false" : "true");
    try {
      document.body.classList.toggle("modal-open", !!show);
    } catch (_error) {}
  }

  function toggleAdvancedPaymentStatusModal(show) {
    if (!advancedPaymentStatusModalEl) return;
    advancedPaymentStatusModalEl.classList.toggle("hidden", !show);
    advancedPaymentStatusModalEl.setAttribute("aria-hidden", show ? "false" : "true");
    try {
      document.body.classList.toggle("modal-open", !!show);
    } catch (_error) {}
  }

  function toggleAdvancedLearnModal(show) {
    if (!advancedLearnModalEl) return;
    advancedLearnModalEl.classList.toggle("hidden", !show);
    advancedLearnModalEl.setAttribute("aria-hidden", show ? "false" : "true");
    try {
      document.body.classList.toggle("modal-open", !!show);
    } catch (_error) {}
  }

  function textFrom(root, selector) {
    var el = root ? root.querySelector(selector) : null;
    return clean(el && el.textContent);
  }

  function toListHtml(items) {
    if (!items || !items.length) return "";
    return '<ul class="space-y-2 list-disc pl-5 text-gray-700">' +
      items.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") +
      "</ul>";
  }

  async function loadAdvancedLearnContentFromPublicPage() {
    if (!advancedLearnModalBodyEl) return;
    if (advancedLearnContentLoaded) return;
    advancedLearnModalBodyEl.innerHTML = '<p class="text-gray-500">Loading program details…</p>';
    try {
      var response = await fetch("/courses/prompt-to-production/", { credentials: "same-origin" });
      if (!response.ok) throw new Error("Could not load course page.");
      var html = await response.text();
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, "text/html");

      var title = textFrom(doc, "main h1");
      var intro = textFrom(doc, "main h1 + p");
      var projectHeading = textFrom(doc, "section .tw-h2");
      var projectIntro = textFrom(doc, "section .tw-h2 + p");
      var whoHeading = Array.prototype.slice.call(doc.querySelectorAll("h2")).map(function (h) { return clean(h.textContent); }).find(function (t) { return t.toLowerCase() === "who is this for?"; }) || "Who is this for?";
      var whoSection = Array.prototype.slice.call(doc.querySelectorAll("section")).find(function (section) {
        var heading = section ? section.querySelector("h2") : null;
        return clean(heading && heading.textContent).toLowerCase() === "who is this for?";
      });
      var whoCards = Array.prototype.slice.call((whoSection && whoSection.querySelectorAll("article h3")) || [])
        .map(function (h) { return clean(h.textContent); })
        .filter(Boolean)
        .slice(0, 6);
      var whoDescriptions = Array.prototype.slice.call((whoSection && whoSection.querySelectorAll("article p")) || [])
        .map(function (p) { return clean(p.textContent); })
        .filter(Boolean)
        .slice(0, 6);
      var weekTitles = Array.prototype.slice.call(doc.querySelectorAll("#curriculum article h3")).map(function (h) { return clean(h.textContent); }).filter(Boolean).slice(0, 4);

      var blocks = [
        '<article class="rounded-2xl border border-brand-100 bg-brand-50 p-4">',
        '<h4 class="text-lg font-heading font-extrabold text-brand-900">' + escapeHtml(title || "Build a real Web & Mobile App with AI") + "</h4>",
        '<p class="mt-2 text-sm text-brand-900/90 leading-relaxed">' + escapeHtml(intro || "") + "</p>",
        "</article>",
        '<article class="rounded-2xl border border-gray-200 bg-white p-4">',
        '<h5 class="text-base font-heading font-bold text-gray-900">' + escapeHtml(projectHeading || "Learn by building a real SaaS product.") + "</h5>",
        '<p class="mt-2 text-sm text-gray-700 leading-relaxed">' + escapeHtml(projectIntro || "") + "</p>",
        "</article>",
        '<article class="rounded-2xl border border-gray-200 bg-white p-4">',
        '<h5 class="text-base font-heading font-bold text-gray-900">4-Week Blueprint</h5>',
        toListHtml(weekTitles),
        "</article>",
        '<article class="rounded-2xl border border-gray-200 bg-white p-4">',
        '<h5 class="text-base font-heading font-bold text-gray-900">' + escapeHtml(whoHeading) + "</h5>",
        '<p class="mt-2 text-sm text-gray-700">Best fit learners for this course:</p>',
        toListHtml((function () {
          if (whoCards.length && whoDescriptions.length) {
            return whoCards.slice(0, 4).map(function (title, idx) {
              var desc = whoDescriptions[idx] || "";
              return desc ? (title + ": " + desc) : title;
            });
          }
          return whoCards.slice(0, 4);
        })()),
        '<div class="mt-4"><a href="/courses/prompt-to-production/" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-100">Open Full Public Course Page</a></div>',
        "</article>",
      ];
      advancedLearnModalBodyEl.innerHTML = blocks.join("");
      advancedLearnContentLoaded = true;
    } catch (_error) {
      advancedLearnModalBodyEl.innerHTML = '<p class="text-red-600">Could not load course details right now. Please open the public course page directly.</p><p class="mt-3"><a href="/courses/prompt-to-production/" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-100">Open Public Course Page</a></p>';
    }
  }

  function consumeAdvancedPaymentStatusFromQuery() {
    try {
      var url = new URL(window.location.href);
      var state = clean(url.searchParams.get("advanced_payment")).toLowerCase();
      if (!state) return;

      if (state === "failed" || state === "cancelled" || state === "canceled") {
        if (advancedPaymentStatusModalTitleEl) advancedPaymentStatusModalTitleEl.textContent = "Payment Cancelled";
        if (advancedPaymentStatusModalBodyEl) {
          advancedPaymentStatusModalBodyEl.textContent = "No payment was recorded, and no advanced seats were added.";
        }
        toggleAdvancedPaymentStatusModal(true);
      } else if (state === "success") {
        showToast("Advanced seat payment confirmed.", false);
      }

      url.searchParams.delete("advanced_payment");
      window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : "") + url.hash);
    } catch (_error) {}
  }

  async function openAdvancedPurchaseModal() {
    var seatCount = Number(advancedSeatCountEl && advancedSeatCountEl.value || 0);
    var quoteData = await api("/.netlify/functions/school-advanced-pricing-config?seat_count=" + encodeURIComponent(String(seatCount > 0 ? seatCount : 0)));
    latestAdvancedQuote = quoteData && quoteData.quote ? quoteData.quote : null;
    var cfg = quoteData && quoteData.config ? quoteData.config : {};
    var quote = latestAdvancedQuote || {};
    if (advancedModalSeatsEl) advancedModalSeatsEl.textContent = String(quote.seats || seatCount || cfg.minSeats || 0);
    if (advancedModalBasePriceEl) advancedModalBasePriceEl.textContent = fmtNairaFromMinor(cfg.basePricePerStudentMinor || quote.pricePerSeatMinor || 0);
    if (advancedModalDiscountEl) advancedModalDiscountEl.textContent = "-" + fmtNairaFromMinor(cfg.discountPerStudentMinor || 0);
    if (advancedModalDiscountedPriceEl) advancedModalDiscountedPriceEl.textContent = fmtNairaFromMinor(quote.pricePerSeatMinor || 0);
    if (advancedModalTotalEl) advancedModalTotalEl.textContent = fmtNairaFromMinor(quote.totalMinor || 0);
    toggleAdvancedPurchaseModal(true);
  }

  async function runAdvancedUpgrade(mode, selectedIds) {
    var payload = {
      mode: mode,
      selectedStudentIds: Array.isArray(selectedIds) ? selectedIds : [],
      idempotencyKey: "ui-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10),
    };
    var data = await api("/.netlify/functions/school-advanced-upgrade", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    var result = data && data.result ? data.result : {};
    var totals = result.totals || {};
    setAdvancedStatus(
      "Upgraded: " + String(totals.upgraded || 0) +
      ", Already upgraded: " + String(totals.skipped_already_upgraded || 0) +
      ", Ineligible: " + String(totals.skipped_ineligible || 0) +
      ", Failed: " + String(totals.failed || 0),
      false
    );
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

  async function resetStudentCode(studentId) {
    var data = await api("/.netlify/functions/school-student-code-reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ studentId: studentId }),
    });
    var nextCode = clean(data && data.student && data.student.student_code);
    if (nextCode) {
      showToast("Student code reset: " + nextCode, false);
    } else {
      showToast("Student code reset.", false);
    }
    await loadStudents();
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
      if (!fullName) {
        setUploadStatus("Full name is required.", true);
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
          email: email || "",
        }),
      })
        .then(function (data) {
          showToast("Student added", false);
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

  if (advancedBuyBtn) {
    advancedBuyBtn.addEventListener("click", function () {
      openAdvancedPurchaseModal().catch(function (error) {
        setAdvancedStatus(error.message || "Could not start advanced seat checkout.", true);
      });
    });
  }

  if (advancedPurchaseModalOverlayEl) {
    advancedPurchaseModalOverlayEl.addEventListener("click", function () {
      toggleAdvancedPurchaseModal(false);
    });
  }
  if (advancedPurchaseModalCloseBtn) {
    advancedPurchaseModalCloseBtn.addEventListener("click", function () {
      toggleAdvancedPurchaseModal(false);
    });
  }
  if (advancedModalCancelBtn) {
    advancedModalCancelBtn.addEventListener("click", function () {
      toggleAdvancedPurchaseModal(false);
    });
  }
  if (advancedModalContinueBtn) {
    advancedModalContinueBtn.addEventListener("click", function () {
      advancedModalContinueBtn.disabled = true;
      advancedModalContinueBtn.textContent = "Starting checkout...";
      buyAdvancedSeats().catch(function (error) {
        setAdvancedStatus(error.message || "Could not start advanced seat checkout.", true);
      }).finally(function () {
        advancedModalContinueBtn.disabled = false;
        advancedModalContinueBtn.textContent = "Continue to Payment";
      });
    });
  }

  if (advancedPaymentStatusModalOverlayEl) {
    advancedPaymentStatusModalOverlayEl.addEventListener("click", function () {
      toggleAdvancedPaymentStatusModal(false);
    });
  }
  if (advancedPaymentStatusModalCloseBtn) {
    advancedPaymentStatusModalCloseBtn.addEventListener("click", function () {
      toggleAdvancedPaymentStatusModal(false);
    });
  }
  if (advancedPaymentStatusModalOkBtn) {
    advancedPaymentStatusModalOkBtn.addEventListener("click", function () {
      toggleAdvancedPaymentStatusModal(false);
    });
  }
  if (advancedLearnMoreBtn) {
    advancedLearnMoreBtn.addEventListener("click", function () {
      toggleAdvancedLearnModal(true);
      loadAdvancedLearnContentFromPublicPage().catch(function () {
        return null;
      });
    });
  }
  if (advancedLearnModalOverlayEl) {
    advancedLearnModalOverlayEl.addEventListener("click", function () {
      toggleAdvancedLearnModal(false);
    });
  }
  if (advancedLearnModalCloseBtn) {
    advancedLearnModalCloseBtn.addEventListener("click", function () {
      toggleAdvancedLearnModal(false);
    });
  }
  if (advancedLearnModalOkBtn) {
    advancedLearnModalOkBtn.addEventListener("click", function () {
      toggleAdvancedLearnModal(false);
    });
  }

  document.addEventListener("keydown", function (event) {
    if (!advancedPurchaseModalEl) return;
    if (advancedPurchaseModalEl.getAttribute("aria-hidden") !== "false") return;
    if (event.key === "Escape") toggleAdvancedPurchaseModal(false);
  });
  document.addEventListener("keydown", function (event) {
    if (!advancedPaymentStatusModalEl) return;
    if (advancedPaymentStatusModalEl.getAttribute("aria-hidden") !== "false") return;
    if (event.key === "Escape") toggleAdvancedPaymentStatusModal(false);
  });
  document.addEventListener("keydown", function (event) {
    if (!advancedLearnModalEl) return;
    if (advancedLearnModalEl.getAttribute("aria-hidden") !== "false") return;
    if (event.key === "Escape") toggleAdvancedLearnModal(false);
  });

  if (advancedUpgradeAllBtn) {
    advancedUpgradeAllBtn.addEventListener("click", function () {
      advancedUpgradeAllBtn.disabled = true;
      advancedUpgradeAllBtn.textContent = "Upgrading...";
      runAdvancedUpgrade("all", []).then(function () {
        return Promise.all([loadAdvancedSummary(), loadAdvancedCandidates(), loadSummary(), loadStudents()]);
      }).catch(function (error) {
        setAdvancedStatus(error.message || "Could not run upgrade.", true);
      }).finally(function () {
        advancedUpgradeAllBtn.disabled = false;
        advancedUpgradeAllBtn.textContent = "Upgrade All Eligible";
      });
    });
  }

  if (advancedUpgradeSelectedBtn) {
    advancedUpgradeSelectedBtn.addEventListener("click", function () {
      var ids = selectedAdvancedStudentIds();
      if (!ids.length) {
        setAdvancedStatus("Select at least one eligible student.", true);
        return;
      }
      advancedUpgradeSelectedBtn.disabled = true;
      advancedUpgradeSelectedBtn.textContent = "Upgrading...";
      runAdvancedUpgrade("selected", ids).then(function () {
        return Promise.all([loadAdvancedSummary(), loadAdvancedCandidates(), loadSummary(), loadStudents()]);
      }).catch(function (error) {
        setAdvancedStatus(error.message || "Could not run selected upgrade.", true);
      }).finally(function () {
        advancedUpgradeSelectedBtn.disabled = false;
        advancedUpgradeSelectedBtn.textContent = "Upgrade Selected";
      });
    });
  }

  consumeWelcomeFromQuery();
  consumeAdvancedPaymentStatusFromQuery();
  renderWelcomeNotice();

  Promise.all([loadSummary(), loadStudents(), loadAdvancedSummary(), loadAdvancedCandidates()]).catch(function (error) {
    if (metaEl) metaEl.textContent = error.message || "Could not load school dashboard.";
  });
})();
