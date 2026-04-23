(function () {
  var rowsEl = document.getElementById("schoolCallsRows");
  var messageEl = document.getElementById("schoolCallsMessage");

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

  var currentRows = [];
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
    return d.toLocaleString();
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
      var contactTz = clean(row.timezone) || "UTC";
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
        '<p class="text-sm font-medium text-gray-800">' + escapeHtml(row.slotLabel || "-") + "</p>",
        '<p class="text-xs text-gray-500">Lead timezone (' + escapeHtml(contactTz) + '): ' + escapeHtml(fmtDateInZone(slotStartIso, contactTz)) + "</p>",
        '<p class="text-xs text-gray-500">UTC start: ' + escapeHtml(fmtDateInZone(slotStartIso, "UTC")) + "</p>",
        '<p class="text-xs text-gray-500">UTC end: ' + escapeHtml(fmtDateInZone(slotEndIso, "UTC")) + "</p>",
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

        openActionModal(action, row).catch(function (error) {
          setMessage(error.message || "Could not open action modal", true);
        });
      });
    });
  }

  async function load() {
    setMessage("Loading school calls...", false);
    var data = await api("/.netlify/functions/admin-school-calls-list");
    var bookings = Array.isArray(data.bookings) ? data.bookings : [];
    currentRows = bookings;
    renderRows(bookings);
    setMessage("Loaded " + String(bookings.length) + " booking(s).", false);
  }

  if (modalEl) {
    modalEl.querySelectorAll("[data-school-call-modal-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
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
    }
  });

  load().catch(function (error) {
    setMessage(error.message || "Could not load school calls", true);
  });
})();
