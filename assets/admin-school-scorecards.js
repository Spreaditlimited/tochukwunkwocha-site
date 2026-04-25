(function () {
  var rowsEl = document.getElementById("schoolScorecardsRows");
  var messageEl = document.getElementById("schoolScorecardsMessage");
  var refreshBtn = document.getElementById("schoolScorecardsRefreshBtn");
  var filterStatusEl = document.getElementById("schoolScorecardsFilterStatus");
  var searchEl = document.getElementById("schoolScorecardsSearch");

  var bookModal = document.getElementById("schoolScorecardsBookModal");
  var bookModalTitle = document.getElementById("schoolScorecardsBookModalTitle");
  var bookModalError = document.getElementById("schoolScorecardsBookModalError");
  var bookModalSlot = document.getElementById("schoolScorecardsBookSlot");
  var bookModalConfirm = document.getElementById("schoolScorecardsBookConfirmBtn");

  var currentRows = [];
  var currentLeadForBook = null;

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
    try {
      return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Lagos",
      }).format(d);
    } catch (_error) {
      return "-";
    }
  }

  function fmtDateInZone(iso, zone) {
    var rawIso = clean(iso);
    var rawZone = clean(zone);
    if (!rawIso || !rawZone) return "-";
    var d = new Date(rawIso);
    if (!Number.isFinite(d.getTime())) return "-";
    try {
      return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: rawZone,
      }).format(d);
    } catch (_error) {
      return "-";
    }
  }

  function scoreBadge(score) {
    var n = Number(score || 0);
    if (n >= 72) return "bg-emerald-100 text-emerald-700";
    if (n >= 54) return "bg-sky-100 text-sky-700";
    if (n >= 36) return "bg-amber-100 text-amber-700";
    return "bg-rose-100 text-rose-700";
  }

  function callStatusBadge(status) {
    var s = clean(status).toLowerCase();
    if (s === "booked" || s === "rescheduled") return "bg-emerald-100 text-emerald-700";
    if (s === "cancelled") return "bg-rose-100 text-rose-700";
    if (s === "zoom_failed") return "bg-amber-100 text-amber-700";
    return "bg-gray-100 text-gray-700";
  }

  function setMessage(text, bad) {
    if (!messageEl) return;
    messageEl.textContent = clean(text);
    messageEl.className = "text-sm " + (bad ? "text-rose-600" : "text-gray-600");
  }

  function setBookModalError(text) {
    if (!bookModalError) return;
    var msg = clean(text);
    bookModalError.textContent = msg;
    bookModalError.classList.toggle("hidden", !msg);
  }

  function showBookModal() {
    if (!bookModal) return;
    bookModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeBookModal() {
    currentLeadForBook = null;
    if (!bookModal) return;
    bookModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    setBookModalError("");
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
      throw new Error("Unauthorized");
    }

    if (!response.ok || !data || data.ok !== true) {
      throw new Error((data && data.error) || "Request failed");
    }

    return data;
  }

  function isFollowUpDue(call) {
    var next = clean(call && call.nextFollowUpAt);
    if (!next) return false;
    var when = new Date(next);
    if (!Number.isFinite(when.getTime())) return false;
    return when.getTime() <= Date.now();
  }

  function matchesFilters(row) {
    var filter = clean(filterStatusEl && filterStatusEl.value).toLowerCase() || "all";
    var q = clean(searchEl && searchEl.value).toLowerCase();
    var call = row.call && typeof row.call === "object" ? row.call : {};
    var hasCall = clean(call.bookingUuid);
    var callStatus = clean(call.status).toLowerCase();

    if (filter === "no_call" && hasCall) return false;
    if (filter === "booked" && !(hasCall && (callStatus === "booked" || callStatus === "rescheduled"))) return false;
    if (filter === "followup_due" && !isFollowUpDue(call)) return false;
    if (filter === "high_score" && Number(row.score || 0) < 72) return false;

    if (q) {
      var haystack = [
        row.fullName,
        row.schoolName,
        row.workEmail,
        row.phone,
        row.role,
      ].join(" ").toLowerCase();
      if (haystack.indexOf(q) === -1) return false;
    }

    return true;
  }

  async function updateOutcome(leadUuid) {
    var prefix = 'data-lead="' + leadUuid + '"';
    var outcomeEl = rowsEl.querySelector('select[' + prefix + '][data-field="outcome"]');
    var ownerEl = rowsEl.querySelector('input[' + prefix + '][data-field="owner"]');
    var followEl = rowsEl.querySelector('input[' + prefix + '][data-field="follow"]');
    var feedbackEl = rowsEl.querySelector('textarea[' + prefix + '][data-field="feedback"]');
    var saveBtn = rowsEl.querySelector('button[' + prefix + '][data-action="save"]');

    var row = (currentRows || []).find(function (x) {
      return clean(x && x.leadUuid) === clean(leadUuid);
    }) || null;
    if (!row || !row.call || !row.call.bookingUuid) throw new Error("No linked call found for this lead");

    var originalText = saveBtn ? clean(saveBtn.textContent) || "Save" : "Save";
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
    }

    try {
      await api("/.netlify/functions/admin-school-call-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          bookingUuid: clean(row.call.bookingUuid),
          action: "outcome",
          outcomeStatus: clean(outcomeEl && outcomeEl.value, 40).toLowerCase(),
          assignedOwner: clean(ownerEl && ownerEl.value, 180),
          nextFollowUpAtIso: clean(followEl && followEl.value) ? new Date(clean(followEl.value)).toISOString() : "",
          outcomeFeedback: clean(feedbackEl && feedbackEl.value, 4000),
          outcomeUpdatedBy: "admin",
        }),
      });

      setMessage("Outcome updated.", false);
      await load();
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    }
  }

  function toDatetimeLocalValue(iso) {
    var raw = clean(iso);
    if (!raw) return "";
    var d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return "";
    var y = String(d.getFullYear());
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    var h = String(d.getHours()).padStart(2, "0");
    var min = String(d.getMinutes()).padStart(2, "0");
    return y + "-" + m + "-" + day + "T" + h + ":" + min;
  }

  function renderRows(items) {
    if (!rowsEl) return;
    if (!items.length) {
      rowsEl.innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-sm text-gray-500">No scorecard leads match the selected filters.</td></tr>';
      return;
    }

    rowsEl.innerHTML = items.map(function (row) {
      var call = row.call && typeof row.call === "object" ? row.call : {};
      var callStatus = clean(call.status || "not_booked").toLowerCase();
      var outcome = clean(call.outcomeStatus || "pending").toLowerCase();
      var source = clean(row.sourcePath || "/courses/prompt-to-profit-schools/");
      var metaOk = row.metaLeadSent ? "sent" : "not_sent";
      var brevoOk = row.brevoSynced ? "synced" : "not_synced";
      var leadId = clean(row.leadUuid);

      return [
        "<tr>",
        '<td class="px-4 py-3 align-top">',
        '<p class="font-semibold text-gray-900">' + escapeHtml(row.fullName || "-") + "</p>",
        '<p class="text-xs text-gray-500">' + escapeHtml(row.role || "-") + "</p>",
        '<p class="text-xs text-gray-500 mt-1">' + escapeHtml(row.schoolName || "-") + "</p>",
        "</td>",
        '<td class="px-4 py-3 align-top">',
        '<p class="text-sm text-gray-800">' + escapeHtml(row.workEmail || "-") + "</p>",
        '<p class="text-xs text-gray-500">' + escapeHtml(row.phone || "-") + "</p>",
        '<p class="text-xs text-gray-500">Students: ' + escapeHtml(row.studentPopulation || "-") + "</p>",
        "</td>",
        '<td class="px-4 py-3 align-top">',
        '<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ' + scoreBadge(row.score) + '">' + escapeHtml(String(Number(row.score || 0))) + '/90</span>',
        '<p class="mt-2 text-xs text-gray-600">' + escapeHtml(row.bandKey || "-") + "</p>",
        '<p class="text-xs text-gray-500">' + escapeHtml(row.headline || "-") + "</p>",
        "</td>",
        '<td class="px-4 py-3 align-top">',
        '<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ' + callStatusBadge(callStatus) + '">' + escapeHtml(callStatus) + "</span>",
        '<p class="mt-2 text-xs text-gray-600">Outcome: ' + escapeHtml(outcome || "-") + "</p>",
        '<p class="text-xs text-gray-500">Start (Africa/Lagos - WAT): ' + escapeHtml(fmtDateInZone(call.slotStartIso, "Africa/Lagos")) + "</p>",
        '<p class="text-xs text-gray-500">Owner: ' + escapeHtml(call.assignedOwner || "-") + "</p>",
        "</td>",
        '<td class="px-4 py-3 align-top">',
        '<p class="text-xs text-gray-700">Meta: ' + escapeHtml(metaOk) + "</p>",
        '<p class="text-xs text-gray-700">Brevo: ' + escapeHtml(brevoOk) + "</p>",
        '<p class="text-xs text-gray-500 break-all">' + escapeHtml(source) + "</p>",
        "</td>",
        '<td class="px-4 py-3 align-top text-xs text-gray-700">',
        '<p>Submitted: ' + escapeHtml(fmtDate(row.createdAt)) + "</p>",
        '<p class="text-gray-500">Updated: ' + escapeHtml(fmtDate(row.updatedAt)) + "</p>",
        "</td>",
        '<td class="px-4 py-3 align-top text-xs text-gray-700 min-w-[320px]">',
        '<div class="space-y-2">',
        '<span class="picker-wrap block">',
        '<select data-lead="' + escapeHtml(leadId) + '" data-field="outcome" class="picker-select !rounded-lg !py-2 !pl-3 !pr-10 !text-xs !font-semibold">',
        ["pending", "follow_up", "completed", "won", "lost", "no_show"].map(function (x) {
          return '<option value="' + x + '"' + (x === outcome ? ' selected' : '') + '>' + x.replace(/_/g, " ") + '</option>';
        }).join(""),
        '</select>',
        '<span class="picker-wrap__icon"><svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg></span>',
        '</span>',
        '<input data-lead="' + escapeHtml(leadId) + '" data-field="owner" value="' + escapeHtml(call.assignedOwner || "") + '" placeholder="Owner" class="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800" />',
        '<input data-lead="' + escapeHtml(leadId) + '" data-field="follow" type="datetime-local" value="' + escapeHtml(toDatetimeLocalValue(call.nextFollowUpAt)) + '" class="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800" />',
        '<textarea data-lead="' + escapeHtml(leadId) + '" data-field="feedback" rows="2" placeholder="Feedback" class="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800">' + escapeHtml(row.nextStep || call.outcomeFeedback || "") + '</textarea>',
        call.bookingUuid
          ? '<button type="button" data-lead="' + escapeHtml(leadId) + '" data-action="save" class="inline-flex w-full sm:w-auto items-center justify-center rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">Save</button>'
          : '<span class="text-xs text-amber-700">Book a call first to save outcome</span>',
        '</div>',
        "</td>",
        '<td class="px-4 py-3 align-top text-right">',
        '<div class="flex w-full flex-col items-stretch sm:items-end gap-2">',
        (call.bookingUuid
          ? '<a href="/internal/school-calls/" class="inline-flex w-full sm:w-auto items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">View Call</a>'
          : '<button type="button" data-lead="' + escapeHtml(leadId) + '" data-action="book" class="inline-flex w-full sm:w-auto items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors">Book Call</button>'),
        '</div>',
        "</td>",
        "</tr>",
      ].join("");
    }).join("");

    Array.prototype.slice.call(rowsEl.querySelectorAll('button[data-action="save"]')).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var leadUuid = clean(btn.getAttribute("data-lead"));
        updateOutcome(leadUuid).catch(function (error) {
          setMessage(error.message || "Could not update outcome.", true);
        });
      });
    });

    Array.prototype.slice.call(rowsEl.querySelectorAll('button[data-action="book"]')).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var leadUuid = clean(btn.getAttribute("data-lead"));
        openBookModal(leadUuid).catch(function (error) {
          setMessage(error.message || "Could not open booking modal.", true);
        });
      });
    });
  }

  function applyFiltersAndRender() {
    var filtered = (currentRows || []).filter(matchesFilters);
    renderRows(filtered);
    setMessage("Showing " + String(filtered.length) + " of " + String((currentRows || []).length) + " scorecard lead(s).", false);
  }

  async function load() {
    setMessage("Loading scorecard leads...", false);
    var data = await api("/.netlify/functions/admin-school-scorecards-list");
    currentRows = Array.isArray(data.leads) ? data.leads : [];
    applyFiltersAndRender();
  }

  async function openBookModal(leadUuid) {
    var row = (currentRows || []).find(function (x) {
      return clean(x && x.leadUuid) === clean(leadUuid);
    }) || null;
    if (!row) throw new Error("Lead not found");

    currentLeadForBook = row;
    if (bookModalTitle) bookModalTitle.textContent = "Book call for " + clean(row.schoolName || row.fullName || "lead");
    setBookModalError("");

    var slotsRes = await api("/.netlify/functions/school-call-slots");
    var slots = Array.isArray(slotsRes.slots) ? slotsRes.slots.slice(0, 30) : [];
    if (!slots.length) throw new Error("No available slots right now.");

    if (bookModalSlot) {
      bookModalSlot.innerHTML = slots.map(function (slot) {
        var label = clean(slot.label || slot.startIso || "");
        var startIso = clean(slot.startIso, 80);
        if (!startIso) return "";
        return '<option value="' + escapeHtml(startIso) + '">' + escapeHtml(label || startIso) + '</option>';
      }).join("");
    }

    showBookModal();
    if (bookModalSlot) bookModalSlot.focus();
  }

  async function submitBookModal() {
    if (!currentLeadForBook) return;
    if (!bookModalSlot) throw new Error("Slot selector is missing");

    var slotStartIso = clean(bookModalSlot.value, 80);
    if (!slotStartIso) throw new Error("Please select a slot");

    var originalText = clean(bookModalConfirm && bookModalConfirm.textContent) || "Book Call";
    if (bookModalConfirm) {
      bookModalConfirm.disabled = true;
      bookModalConfirm.textContent = "Booking...";
    }

    try {
      await api("/.netlify/functions/admin-school-scorecard-call-create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          leadUuid: clean(currentLeadForBook.leadUuid),
          slotStartIso: slotStartIso,
          timezone: "Africa/Lagos",
        }),
      });

      closeBookModal();
      setMessage("Call booked successfully.", false);
      await load();
    } finally {
      if (bookModalConfirm) {
        bookModalConfirm.disabled = false;
        bookModalConfirm.textContent = originalText;
      }
    }
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      load().catch(function (error) {
        setMessage(error.message || "Could not load scorecard leads.", true);
      });
    });
  }

  if (filterStatusEl) {
    filterStatusEl.addEventListener("change", applyFiltersAndRender);
  }

  if (searchEl) {
    searchEl.addEventListener("input", applyFiltersAndRender);
  }

  if (bookModal) {
    bookModal.querySelectorAll("[data-school-scorecard-book-close]").forEach(function (el) {
      el.addEventListener("click", closeBookModal);
    });
  }

  if (bookModalConfirm) {
    bookModalConfirm.addEventListener("click", function () {
      setBookModalError("");
      submitBookModal().catch(function (error) {
        setBookModalError(error.message || "Could not create booking");
      });
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && bookModal && bookModal.getAttribute("aria-hidden") === "false") {
      closeBookModal();
    }
  });

  load().catch(function (error) {
    setMessage(error.message || "Could not load scorecard leads.", true);
  });
})();
