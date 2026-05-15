(function () {
  var rowsEl = document.getElementById("schoolCallsRows");
  var messageEl = document.getElementById("schoolCallsMessage");
  var resendBtn = document.getElementById("schoolCallResendBtn");
  var resendHoursInput = document.getElementById("schoolCallResendHours");
  var upcomingTabBtn = document.getElementById("schoolCallsUpcomingTab");
  var pastTabBtn = document.getElementById("schoolCallsPastTab");

  var modalEl = document.getElementById("schoolCallModal");
  var modalForm = document.getElementById("schoolCallModalForm");
  var modalEyebrow = document.getElementById("schoolCallModalEyebrow");
  var modalTitle = document.getElementById("schoolCallModalTitle");
  var modalDesc = document.getElementById("schoolCallModalDesc");
  var modalError = document.getElementById("schoolCallModalError");
  var modalConfirmBtn = document.getElementById("schoolCallModalConfirmBtn");

  var outcomeFieldsEl = document.getElementById("schoolCallModalOutcomeFields");
  var rescheduleFieldsEl = document.getElementById("schoolCallModalRescheduleFields");
  var cancelFieldsEl = document.getElementById("schoolCallModalCancelFields");

  var outcomeStatusInput = document.getElementById("schoolCallOutcomeStatus");
  var assignedOwnerInput = document.getElementById("schoolCallAssignedOwner");
  var followUpInput = document.getElementById("schoolCallFollowUpAt");
  var outcomeFeedbackInput = document.getElementById("schoolCallOutcomeFeedback");

  var rescheduleSlotInput = document.getElementById("schoolCallRescheduleSlot");
  var rescheduleNoteInput = document.getElementById("schoolCallRescheduleNote");
  var cancelNoteInput = document.getElementById("schoolCallCancelNote");
  var submissionModalEl = document.getElementById("buildCallSubmissionModal");
  var submissionModalTitleEl = document.getElementById("buildCallSubmissionModalTitle");
  var submissionModalBodyEl = document.getElementById("buildCallSubmissionModalBody");

  var currentRows = [];
  var currentTab = "upcoming";
  var pendingAction = null;

  function clean(value, max) {
    return String(value || "").trim().slice(0, Number(max || 4000));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setMessage(text, bad) {
    if (!messageEl) return;
    messageEl.textContent = clean(text);
    messageEl.className = "text-sm " + (bad ? "text-red-600" : "text-gray-600");
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
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: rawZone,
      }).format(d);
    } catch (_error) {
      return "-";
    }
  }

  function fmtDateInZoneDetailed(iso, zone) {
    var rawIso = clean(iso);
    var rawZone = clean(zone);
    if (!rawIso || !rawZone) return "-";
    var d = new Date(rawIso);
    if (!Number.isFinite(d.getTime())) return "-";
    try {
      return new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: rawZone,
        timeZoneName: "short",
      }).format(d);
    } catch (_error) {
      return "-";
    }
  }

  function shortText(value, max) {
    var text = clean(value);
    if (!text) return "";
    var limit = Number(max || 120);
    if (text.length <= limit) return text;
    return text.slice(0, Math.max(1, limit - 1)) + "…";
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

  function datetimeLocalToIso(value) {
    var raw = clean(value);
    if (!raw) return "";
    var d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toISOString();
  }

  function parseIsoMs(value) {
    var raw = clean(value);
    if (!raw) return NaN;
    var ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }

  function isPastCall(row) {
    var slotMs = parseIsoMs(row && row.slotStartIso);
    if (!Number.isFinite(slotMs)) return false;
    return slotMs < Date.now();
  }

  function tabRows(items, tab) {
    var list = Array.isArray(items) ? items.slice() : [];
    var wanted = clean(tab, 30).toLowerCase() === "past" ? "past" : "upcoming";
    list = list.filter(function (row) {
      return wanted === "past" ? isPastCall(row) : !isPastCall(row);
    });
    list.sort(function (a, b) {
      var aMs = parseIsoMs(a && a.slotStartIso);
      var bMs = parseIsoMs(b && b.slotStartIso);
      if (!Number.isFinite(aMs) && !Number.isFinite(bMs)) return 0;
      if (!Number.isFinite(aMs)) return 1;
      if (!Number.isFinite(bMs)) return -1;
      return wanted === "past" ? (bMs - aMs) : (aMs - bMs);
    });
    return list;
  }

  function renderTabState() {
    var isPast = currentTab === "past";
    if (upcomingTabBtn) {
      upcomingTabBtn.classList.toggle("bg-white", !isPast);
      upcomingTabBtn.classList.toggle("text-brand-700", !isPast);
      upcomingTabBtn.classList.toggle("shadow-sm", !isPast);
      upcomingTabBtn.classList.toggle("text-gray-600", isPast);
    }
    if (pastTabBtn) {
      pastTabBtn.classList.toggle("bg-white", isPast);
      pastTabBtn.classList.toggle("text-brand-700", isPast);
      pastTabBtn.classList.toggle("shadow-sm", isPast);
      pastTabBtn.classList.toggle("text-gray-600", !isPast);
    }
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

  function statusPill(status) {
    var raw = clean(status).toLowerCase();
    var cls = "bg-amber-100 text-amber-700";
    if (raw === "booked" || raw === "rescheduled") cls = "bg-emerald-100 text-emerald-700";
    if (raw === "cancelled") cls = "bg-rose-100 text-rose-700";
    return '<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ' + cls + '">' + escapeHtml(raw || "unknown") + "</span>";
  }

  function outcomePill(outcome) {
    var raw = clean(outcome).toLowerCase();
    if (!raw) return '<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-600">not set</span>';
    var cls = "bg-indigo-100 text-indigo-700";
    if (raw === "won" || raw === "completed") cls = "bg-emerald-100 text-emerald-700";
    if (raw === "lost" || raw === "no_show") cls = "bg-rose-100 text-rose-700";
    if (raw === "follow_up" || raw === "pending") cls = "bg-amber-100 text-amber-700";
    return '<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ' + cls + '">' + escapeHtml(raw) + "</span>";
  }

  function setModalError(text) {
    if (!modalError) return;
    var msg = clean(text, 500);
    modalError.textContent = msg;
    modalError.classList.toggle("hidden", !msg);
  }

  function showModal() {
    if (!modalEl) return;
    modalEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    pendingAction = null;
    if (!modalEl) return;
    modalEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    setModalError("");
    if (modalConfirmBtn) {
      modalConfirmBtn.disabled = false;
      modalConfirmBtn.textContent = "Confirm Action";
    }
  }

  function showSubmissionModal() {
    if (!submissionModalEl) return;
    submissionModalEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeSubmissionModal() {
    if (!submissionModalEl) return;
    submissionModalEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function renderSubmissionHtml(row) {
    var answers = Array.isArray(row && row.buildAnswers) ? row.buildAnswers : [];
    var scoredAnswers = answers.filter(function (a) { return clean(a && a.question).indexOf("Submitted - ") !== 0; });
    var submittedAnswers = answers.filter(function (a) { return clean(a && a.question).indexOf("Submitted - ") === 0; });
    var answersHtml = scoredAnswers.length
      ? scoredAnswers.map(function (a, idx) {
        return '<div class="rounded-lg border border-gray-200 bg-white p-3"><p class="text-xs font-semibold text-gray-500">Q' + String(idx + 1) + '</p><p class="mt-1 text-sm font-semibold text-gray-900">' + escapeHtml(a.question || "-") + '</p><p class="mt-1 text-sm text-gray-700">' + escapeHtml(a.answer || "-") + '</p><p class="mt-1 text-xs text-gray-500">Score: ' + escapeHtml(String(Number(a.score || 0))) + '</p></div>';
      }).join("")
      : '<p class="text-sm text-gray-500">No submission answers found for this call.</p>';
    var submittedHtml = submittedAnswers.length
      ? submittedAnswers.map(function (a) {
        return '<div class="rounded-lg border border-gray-200 bg-white p-3"><p class="text-xs font-semibold text-gray-500">' + escapeHtml(clean(a.question).replace(/^Submitted - /, "") || "Submitted field") + '</p><p class="mt-1 text-sm whitespace-pre-wrap text-gray-800">' + escapeHtml(a.answer || "-") + '</p></div>';
      }).join("")
      : '<p class="text-sm text-gray-500">No explicit submitted field snapshot for this call.</p>';

    return [
      '<div class="space-y-3">',
      '<div class="rounded-lg border border-gray-200 bg-white p-3">',
      '<p><span class="font-semibold">Name:</span> ' + escapeHtml(row.fullName || "-") + '</p>',
      '<p><span class="font-semibold">Business:</span> ' + escapeHtml(row.buildBusinessName || row.schoolName || "-") + '</p>',
      '<p><span class="font-semibold">Email:</span> ' + escapeHtml(row.workEmail || "-") + '</p>',
      '<p><span class="font-semibold">Phone:</span> ' + escapeHtml(row.phone || "-") + '</p>',
      '<p><span class="font-semibold">Role:</span> ' + escapeHtml(row.role || "-") + '</p>',
      '<p><span class="font-semibold">Score:</span> ' + escapeHtml(String(Number(row.buildScore || 0))) + '/100</p>',
      '<p><span class="font-semibold">Band:</span> ' + escapeHtml(row.buildBandKey || "-") + '</p>',
      '<p><span class="font-semibold">Headline:</span> ' + escapeHtml(row.buildHeadline || "-") + '</p>',
      "</div>",
      '<div><p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Submitted Details</p><div class="space-y-2">' + submittedHtml + "</div></div>",
      '<div><p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Scoring Answers</p><div class="space-y-2">' + answersHtml + "</div></div>",
      "</div>",
    ].join("");
  }

  function showOnlyFields(which) {
    if (outcomeFieldsEl) outcomeFieldsEl.classList.toggle("hidden", which !== "outcome");
    if (rescheduleFieldsEl) rescheduleFieldsEl.classList.toggle("hidden", which !== "reschedule");
    if (cancelFieldsEl) cancelFieldsEl.classList.toggle("hidden", which !== "cancel");
  }

  async function openActionModal(action, row) {
    if (!modalEl) return;
    var actionName = clean(action).toLowerCase();
    var bookingUuid = clean(row && row.bookingUuid, 72);
    if (!bookingUuid) return;

    pendingAction = {
      action: actionName,
      bookingUuid: bookingUuid,
      row: row || {},
    };

    setModalError("");

    if (actionName === "outcome") {
      if (modalEyebrow) modalEyebrow.textContent = "Call outcome";
      if (modalTitle) modalTitle.textContent = "Update call outcome";
      if (modalDesc) modalDesc.textContent = "Record ownership, result, and follow-up notes for this meeting.";
      if (modalConfirmBtn) modalConfirmBtn.textContent = "Save outcome";
      showOnlyFields("outcome");

      if (outcomeStatusInput) outcomeStatusInput.value = clean(row.callOutcomeStatus || "pending").toLowerCase() || "pending";
      if (assignedOwnerInput) assignedOwnerInput.value = clean(row.assignedOwner || "");
      if (followUpInput) followUpInput.value = toDatetimeLocalValue(row.nextFollowUpAt);
      if (outcomeFeedbackInput) outcomeFeedbackInput.value = clean(row.outcomeFeedback || "", 4000);

      showModal();
      if (outcomeStatusInput) outcomeStatusInput.focus();
      return;
    }

    if (actionName === "reschedule") {
      if (modalEyebrow) modalEyebrow.textContent = "Reschedule call";
      if (modalTitle) modalTitle.textContent = "Pick a new slot";
      if (modalDesc) modalDesc.textContent = "This updates both the booking and the linked Zoom meeting.";
      if (modalConfirmBtn) modalConfirmBtn.textContent = "Confirm reschedule";
      showOnlyFields("reschedule");

      if (rescheduleNoteInput) rescheduleNoteInput.value = clean(row.rescheduleNote || "Rescheduled by admin", 255) || "Rescheduled by admin";

      var slotsRes = await api("/.netlify/functions/school-call-slots");
      var slots = Array.isArray(slotsRes.slots) ? slotsRes.slots.slice(0, 20) : [];
      if (!slots.length) {
        throw new Error("No available slots to reschedule into right now.");
      }

      if (rescheduleSlotInput) {
        rescheduleSlotInput.innerHTML = slots.map(function (slot) {
          var label = clean(slot.label || slot.startIso || "");
          var startIso = clean(slot.startIso, 80);
          if (!startIso) return "";
          return '<option value="' + escapeHtml(startIso) + '">' + escapeHtml(label || startIso) + "</option>";
        }).join("");
      }

      showModal();
      if (rescheduleSlotInput) rescheduleSlotInput.focus();
      return;
    }

    if (modalEyebrow) modalEyebrow.textContent = "Cancel call";
    if (modalTitle) modalTitle.textContent = "Confirm cancellation";
    if (modalDesc) modalDesc.textContent = "This will cancel the booking and clear its current slot.";
    if (modalConfirmBtn) modalConfirmBtn.textContent = "Cancel booking";
    showOnlyFields("cancel");

    if (cancelNoteInput) cancelNoteInput.value = clean(row.cancelReason || "Cancelled by admin", 255) || "Cancelled by admin";

    showModal();
    if (cancelNoteInput) cancelNoteInput.focus();
  }

  async function submitActionFromModal() {
    if (!pendingAction || !pendingAction.bookingUuid || !pendingAction.action) return;

    var bookingUuid = pendingAction.bookingUuid;
    var actionName = pendingAction.action;

    if (actionName === "outcome") {
      var outcomeStatus = clean(outcomeStatusInput && outcomeStatusInput.value, 40).toLowerCase();
      if (!outcomeStatus) throw new Error("Outcome status is required.");

      var assignedOwner = clean(assignedOwnerInput && assignedOwnerInput.value, 180);
      var nextFollowUpAtIso = datetimeLocalToIso(followUpInput && followUpInput.value);
      var outcomeFeedback = clean(outcomeFeedbackInput && outcomeFeedbackInput.value, 4000);

      await api("/.netlify/functions/admin-school-call-update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          bookingUuid: bookingUuid,
          action: "outcome",
          outcomeStatus: outcomeStatus,
          outcomeFeedback: outcomeFeedback,
          assignedOwner: assignedOwner,
          nextFollowUpAtIso: nextFollowUpAtIso,
          outcomeUpdatedBy: "admin",
        }),
      });

      setMessage("Call outcome updated.", false);
      return;
    }

    if (actionName === "reschedule") {
      var slotStartIso = clean(rescheduleSlotInput && rescheduleSlotInput.value, 80);
      if (!slotStartIso) throw new Error("Please select a slot.");
      var note = clean(rescheduleNoteInput && rescheduleNoteInput.value, 255) || "Rescheduled by admin";

      await api("/.netlify/functions/admin-school-call-update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          bookingUuid: bookingUuid,
          action: "reschedule",
          slotStartIso: slotStartIso,
          note: note,
        }),
      });

      setMessage("Booking rescheduled.", false);
      return;
    }

    var cancelNote = clean(cancelNoteInput && cancelNoteInput.value, 255) || "Cancelled by admin";
    await api("/.netlify/functions/admin-school-call-update", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ bookingUuid: bookingUuid, action: "cancel", note: cancelNote }),
    });

    setMessage("Booking cancelled.", false);
  }

  function renderRows(items) {
    if (!rowsEl) return;
    if (!items.length) {
      rowsEl.innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-sm text-gray-500">No bookings yet.</td></tr>';
      return;
    }

    rowsEl.innerHTML = items.map(function (row) {
      var zoom = clean(row.zoomJoinUrl);
      var slotStartIso = clean(row.slotStartIso);
      var slotEndIso = clean(row.slotEndIso);
      var outcomeStatus = clean(row.callOutcomeStatus).toLowerCase();
      var feedback = clean(row.outcomeFeedback);

      return [
        "<tr>",
        '<td class="px-4 py-3">',
        '<p class="font-semibold text-gray-900">' + escapeHtml(row.schoolName || "-") + "</p>",
        '<p class="text-xs text-gray-500">' + escapeHtml(row.studentPopulation || "") + " students</p>",
        '<p class="text-xs text-gray-500">Created: ' + escapeHtml(fmtDate(row.createdAt)) + "</p>",
        "</td>",

        '<td class="px-4 py-3">',
        '<p class="text-sm text-gray-800">' + escapeHtml(row.fullName || "-") + "</p>",
        '<p class="text-xs text-gray-500">' + escapeHtml(row.workEmail || "-") + "</p>",
        '<p class="text-xs text-gray-500">' + escapeHtml(row.phone || "-") + "</p>",
        '<p class="text-xs text-gray-500">Role: ' + escapeHtml(row.role || "-") + "</p>",
        "</td>",

        '<td class="px-4 py-3 text-gray-700">',
        '<p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Call timezone (Africa/Lagos - WAT)</p>',
        '<p class="text-sm font-semibold text-gray-800">' + escapeHtml(fmtDateInZoneDetailed(slotStartIso, "Africa/Lagos")) + "</p>",
        '<p class="text-xs text-gray-500">WAT window: ' + escapeHtml(fmtDateInZone(slotStartIso, "Africa/Lagos")) + " → " + escapeHtml(fmtDateInZone(slotEndIso, "Africa/Lagos")) + "</p>",
        "</td>",

        '<td class="px-4 py-3 text-gray-700">',
        '<p class="text-sm">' + escapeHtml(row.assignedOwner || "-") + "</p>",
        '<p class="text-xs text-gray-500">Updated by: ' + escapeHtml(row.outcomeUpdatedBy || "-") + "</p>",
        "</td>",

        '<td class="px-4 py-3">',
        outcomePill(outcomeStatus),
        '<p class="mt-1 text-xs text-gray-500">Follow-up: ' + escapeHtml(fmtDate(row.nextFollowUpAt)) + "</p>",
        feedback ? '<p class="mt-1 text-xs text-gray-600" title="' + escapeHtml(feedback) + '">' + escapeHtml(shortText(feedback, 110)) + "</p>" : "",
        "</td>",

        '<td class="px-4 py-3">' + statusPill(row.status) + "</td>",
        '<td class="px-4 py-3">' + (zoom ? '<a class="text-brand-600 underline" href="' + escapeHtml(zoom) + '" target="_blank" rel="noopener noreferrer">Open Zoom</a>' : '<span class="text-gray-400">-</span>') + "</td>",

        '<td class="px-4 py-3">',
        '<div class="flex flex-col items-end gap-2 min-w-[8.5rem]">',
        '<button type="button" data-action="submission" data-booking="' + escapeHtml(row.bookingUuid) + '" class="inline-flex w-32 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Submission</button>',
        '<button type="button" data-action="outcome" data-booking="' + escapeHtml(row.bookingUuid) + '" class="inline-flex w-32 items-center justify-center rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">Outcome</button>',
        '<button type="button" data-action="reschedule" data-booking="' + escapeHtml(row.bookingUuid) + '" class="inline-flex w-32 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Reschedule</button>',
        '<button type="button" data-action="cancel" data-booking="' + escapeHtml(row.bookingUuid) + '" class="inline-flex w-32 items-center justify-center rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100">Cancel</button>',
        "</div>",
        "</td>",
        "</tr>",
      ].join("");
    }).join("");

    Array.prototype.slice.call(rowsEl.querySelectorAll("button[data-action]")).forEach(function (button) {
      button.addEventListener("click", function () {
        var action = clean(button.getAttribute("data-action")).toLowerCase();
        var bookingUuid = clean(button.getAttribute("data-booking"));
        var row = (currentRows || []).find(function (x) {
          return clean(x && x.bookingUuid) === bookingUuid;
        }) || null;
        if (!bookingUuid || !action || !row) return;
        if (action === "submission") {
          if (submissionModalTitleEl) submissionModalTitleEl.textContent = "Submission - " + clean(row.buildBusinessName || row.schoolName || row.fullName || "Build lead", 180);
          if (submissionModalBodyEl) submissionModalBodyEl.innerHTML = renderSubmissionHtml(row);
          showSubmissionModal();
          return;
        }

        openActionModal(action, row).catch(function (error) {
          setMessage(error.message || "Could not open action modal", true);
        });
      });
    });
  }

  async function load() {
    setMessage("Loading build calls...", false);
    var data = await api("/.netlify/functions/admin-build-calls-list");
    var bookings = Array.isArray(data.bookings) ? data.bookings : [];
    currentRows = bookings;
    var visible = tabRows(bookings, currentTab);
    renderRows(visible);
    renderTabState();
    setMessage("Loaded " + String(visible.length) + " " + (currentTab === "past" ? "past" : "upcoming") + " booking(s).", false);
  }

  async function resendRecentNotifications() {
    var lookbackHours = Number(clean(resendHoursInput && resendHoursInput.value, 10) || 72);
    if (!Number.isFinite(lookbackHours) || lookbackHours < 1) lookbackHours = 72;
    setMessage("Resending booking emails for recent calls...", false);
    var result = await api("/.netlify/functions/admin-school-call-notifications-resend", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        lookbackHours: lookbackHours,
        limit: 120,
        sendLead: true,
        sendAdmins: true,
      }),
    });
    var msg =
      "Resend complete. Scanned " + String(result.scanned || 0) +
      ", lead emails sent " + String(result.leadSent || 0) +
      ", admin emails sent " + String(result.adminSent || 0) +
      ", failures " + String(result.failureCount || 0) + ".";
    setMessage(msg, Number(result.failureCount || 0) > 0);
  }

  if (modalEl) {
    modalEl.querySelectorAll("[data-school-call-modal-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });
  }
  if (submissionModalEl) {
    submissionModalEl.querySelectorAll("[data-build-call-submission-close]").forEach(function (el) {
      el.addEventListener("click", closeSubmissionModal);
    });
  }

  if (modalForm) {
    modalForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!pendingAction || !modalConfirmBtn) return;

      var idleText = clean(modalConfirmBtn.textContent, 80) || "Confirm Action";
      modalConfirmBtn.disabled = true;
      modalConfirmBtn.textContent = "Saving...";
      setModalError("");

      submitActionFromModal()
        .then(function () {
          closeModal();
          return load();
        })
        .catch(function (error) {
          setModalError(error.message || "Could not update booking");
        })
        .finally(function () {
          if (modalConfirmBtn) {
            modalConfirmBtn.disabled = false;
            modalConfirmBtn.textContent = idleText;
          }
        });
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && modalEl && modalEl.getAttribute("aria-hidden") === "false") {
      closeModal();
      return;
    }
    if (event.key === "Escape" && submissionModalEl && submissionModalEl.getAttribute("aria-hidden") === "false") {
      closeSubmissionModal();
    }
  });

  if (resendBtn) {
    resendBtn.addEventListener("click", function () {
      var original = clean(resendBtn.textContent, 80) || "Resend Recent Emails";
      resendBtn.disabled = true;
      resendBtn.textContent = "Resending...";
      resendRecentNotifications()
        .catch(function (error) {
          setMessage(error.message || "Could not resend recent call emails.", true);
        })
        .finally(function () {
          resendBtn.disabled = false;
          resendBtn.textContent = original;
        });
    });
  }

  if (upcomingTabBtn) {
    upcomingTabBtn.addEventListener("click", function () {
      currentTab = "upcoming";
      renderTabState();
      renderRows(tabRows(currentRows, currentTab));
      setMessage("Showing upcoming calls.", false);
    });
  }

  if (pastTabBtn) {
    pastTabBtn.addEventListener("click", function () {
      currentTab = "past";
      renderTabState();
      renderRows(tabRows(currentRows, currentTab));
      setMessage("Showing past calls.", false);
    });
  }

  load().catch(function (error) {
    setMessage(error.message || "Could not load build calls", true);
  });
})();
