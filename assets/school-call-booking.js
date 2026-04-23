(function () {
  var bookForm = document.getElementById("bookForm");
  var slotStartIsoInput = document.getElementById("slotStartIso");
  var slotDateInput = document.getElementById("slotDate");
  var slotTimeGrid = document.getElementById("slotTimeGrid");
  var slotTimeEmpty = document.getElementById("slotTimeEmpty");

  var rescheduleSlotInput = document.getElementById("rescheduleSlot");
  var rescheduleDateInput = document.getElementById("rescheduleDate");
  var rescheduleTimeGrid = document.getElementById("rescheduleTimeGrid");
  var rescheduleTimeEmpty = document.getElementById("rescheduleTimeEmpty");

  var refreshSlotsBtn = document.getElementById("refreshSlotsBtn");
  var bookStatus = document.getElementById("bookStatus");
  var bookMeetingPanel = document.getElementById("bookMeetingPanel");
  var bookSubmitBtn = document.getElementById("bookSubmitBtn");

  var bookPanel = document.getElementById("bookPanel");
  var managePanel = document.getElementById("managePanel");
  var manageSummary = document.getElementById("manageSummary");
  var manageActions = document.getElementById("manageActions");
  var manageClosed = document.getElementById("manageClosed");
  var manageStatus = document.getElementById("manageStatus");
  var manageNote = document.getElementById("manageNote");
  var rescheduleBtn = document.getElementById("rescheduleBtn");
  var cancelBtn = document.getElementById("cancelBtn");

  var manageToken = "";
  var slotsByDate = {};
  var slotDateKeys = [];

  function setStatus(el, message, tone) {
    if (!el) return;
    el.textContent = String(message || "");
    el.classList.remove("error", "ok");
    if (tone === "error") el.classList.add("error");
    else if (tone === "ok") el.classList.add("ok");
  }

  function getManageTokenFromUrl() {
    var params = new URLSearchParams(window.location.search || "");
    return String(params.get("manage") || "").trim();
  }

  function toLondonDateKey(iso) {
    var dt = new Date(String(iso || ""));
    if (Number.isNaN(dt.getTime())) return "";
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(dt);

    var year = "";
    var month = "";
    var day = "";

    parts.forEach(function (part) {
      if (part.type === "year") year = part.value;
      if (part.type === "month") month = part.value;
      if (part.type === "day") day = part.value;
    });

    if (!year || !month || !day) return "";
    return year + "-" + month + "-" + day;
  }

  function toLondonTimeLabel(iso) {
    var dt = new Date(String(iso || ""));
    if (Number.isNaN(dt.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "numeric",
      minute: "2-digit",
    }).format(dt);
  }

  function rebuildSlots(slots) {
    slotsByDate = {};

    (Array.isArray(slots) ? slots : []).forEach(function (slot) {
      var startIso = String((slot && slot.startIso) || "").trim();
      if (!startIso) return;

      var dateKey = toLondonDateKey(startIso);
      if (!dateKey) return;

      if (!slotsByDate[dateKey]) slotsByDate[dateKey] = [];
      slotsByDate[dateKey].push({
        startIso: startIso,
        timeLabel: toLondonTimeLabel(startIso),
        label: String((slot && slot.label) || "").trim(),
      });
    });

    slotDateKeys = Object.keys(slotsByDate).sort();

    slotDateKeys.forEach(function (dateKey) {
      slotsByDate[dateKey].sort(function (a, b) {
        return String(a.startIso).localeCompare(String(b.startIso));
      });
    });
  }

  function setDateInputState(input) {
    if (!input) return;
    if (!slotDateKeys.length) {
      input.value = "";
      input.disabled = true;
      input.removeAttribute("min");
      return;
    }

    input.disabled = false;
    input.min = slotDateKeys[0];
    input.max = slotDateKeys[slotDateKeys.length - 1];
  }

  function renderTimeButtons(gridEl, emptyEl, hiddenInput, dateKey, preferredIso) {
    if (!gridEl || !emptyEl || !hiddenInput) return;

    var list = slotsByDate[dateKey] || [];
    var selectedIso = String(preferredIso || "").trim();

    gridEl.innerHTML = "";
    hiddenInput.value = "";

    if (!list.length) {
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;

    var hasPreferred = list.some(function (slot) {
      return slot.startIso === selectedIso;
    });
    if (!hasPreferred) selectedIso = list[0].startIso;

    hiddenInput.value = selectedIso;

    list.forEach(function (slot) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "time-chip" + (slot.startIso === selectedIso ? " active" : "");
      btn.textContent = slot.timeLabel || slot.label || slot.startIso;
      btn.dataset.iso = slot.startIso;
      btn.setAttribute("aria-pressed", slot.startIso === selectedIso ? "true" : "false");

      btn.addEventListener("click", function () {
        hiddenInput.value = slot.startIso;
        var buttons = gridEl.querySelectorAll(".time-chip");
        buttons.forEach(function (buttonEl) {
          var active = buttonEl.dataset.iso === slot.startIso;
          buttonEl.classList.toggle("active", active);
          buttonEl.setAttribute("aria-pressed", active ? "true" : "false");
        });
      });

      gridEl.appendChild(btn);
    });
  }

  function syncPicker(dateInput, gridEl, emptyEl, hiddenInput, preferredIso) {
    if (!dateInput || !gridEl || !emptyEl || !hiddenInput) return;

    setDateInputState(dateInput);

    if (!slotDateKeys.length) {
      renderTimeButtons(gridEl, emptyEl, hiddenInput, "", "");
      return;
    }

    var preferredDate = toLondonDateKey(preferredIso);
    var dateValue = String(dateInput.value || "").trim();

    if (preferredDate && slotDateKeys.indexOf(preferredDate) >= 0) {
      dateValue = preferredDate;
    }

    if (!dateValue || slotDateKeys.indexOf(dateValue) < 0) {
      dateValue = slotDateKeys[0];
    }

    dateInput.value = dateValue;
    renderTimeButtons(gridEl, emptyEl, hiddenInput, dateValue, preferredIso);
  }

  async function fetchJson(url, init) {
    var res = await fetch(
      url,
      Object.assign(
        {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        },
        init || {}
      )
    );
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !data || data.ok !== true) {
      throw new Error((data && data.error) || "Request failed");
    }
    return data;
  }

  function trackLeadEvent(eventId) {
    var id = String(eventId || "").trim();
    if (!id) return;
    if (typeof window.fbq !== "function") return;

    var storageKey = "meta_lead_sent_" + id;
    try {
      if (window.sessionStorage && window.sessionStorage.getItem(storageKey) === "1") return;
    } catch (_error) {}

    try {
      window.fbq(
        "track",
        "Lead",
        {
          content_name: "Prompt to Profit for Schools Call Booking",
          content_category: "booking",
          lead_type: "call_booked",
        },
        { eventID: id }
      );
      try {
        if (window.sessionStorage) window.sessionStorage.setItem(storageKey, "1");
      } catch (_storageError) {}
    } catch (_error) {}
  }

  async function loadSlots() {
    if (slotTimeGrid) slotTimeGrid.innerHTML = "";
    if (rescheduleTimeGrid) rescheduleTimeGrid.innerHTML = "";
    if (slotTimeEmpty) {
      slotTimeEmpty.hidden = false;
      slotTimeEmpty.textContent = "Loading available times...";
    }
    if (rescheduleTimeEmpty) {
      rescheduleTimeEmpty.hidden = false;
      rescheduleTimeEmpty.textContent = "Loading available times...";
    }

    var data = await fetchJson("/.netlify/functions/school-call-slots");
    var slots = Array.isArray(data.slots) ? data.slots : [];

    rebuildSlots(slots);

    if (slotTimeEmpty) slotTimeEmpty.textContent = "No available times for this date.";
    if (rescheduleTimeEmpty) rescheduleTimeEmpty.textContent = "No available times for this date.";

    syncPicker(slotDateInput, slotTimeGrid, slotTimeEmpty, slotStartIsoInput, slotStartIsoInput && slotStartIsoInput.value);
    syncPicker(
      rescheduleDateInput,
      rescheduleTimeGrid,
      rescheduleTimeEmpty,
      rescheduleSlotInput,
      rescheduleSlotInput && rescheduleSlotInput.value
    );

    return slots;
  }

  function renderBookedPanel(data) {
    if (!bookMeetingPanel) return;
    var slotLabel = String(data.slotLabel || "").trim();
    var zoomJoinUrl = String(data.zoomJoinUrl || "").trim();
    var manageUrl = window.location.origin + window.location.pathname + "?manage=" + encodeURIComponent(String(data.manageToken || ""));

    var html = [
      "<p><strong>Booked successfully.</strong></p>",
      slotLabel ? "<p><strong>Time:</strong> " + slotLabel + " (Europe/London)</p>" : "",
      zoomJoinUrl ? '<p><strong>Zoom:</strong> <a href="' + zoomJoinUrl + '" target="_blank" rel="noopener noreferrer">Join meeting</a></p>' : "",
      '<p><strong>Manage:</strong> <a href="' + manageUrl + '">Reschedule or cancel</a></p>',
    ].join("");

    bookMeetingPanel.innerHTML = html;
    bookMeetingPanel.hidden = false;
  }

  async function loadManageBooking(token) {
    var data = await fetchJson("/.netlify/functions/school-call-manage?manage=" + encodeURIComponent(token));
    var booking = data.booking || {};

    var summary = [
      "Booking: " + String(booking.schoolName || ""),
      booking.slotLabel ? "Time: " + booking.slotLabel + " (Europe/London)" : "",
      booking.status ? "Status: " + booking.status : "",
      booking.zoomJoinUrl ? "Zoom: " + booking.zoomJoinUrl : "",
    ]
      .filter(Boolean)
      .join(" | ");

    setStatus(manageSummary, summary, "idle");

    var status = String(booking.status || "").toLowerCase();
    if (status === "cancelled") {
      manageActions.hidden = true;
      manageClosed.hidden = false;
    } else {
      manageActions.hidden = false;
      manageClosed.hidden = true;
      if (rescheduleSlotInput) {
        rescheduleSlotInput.value = String(booking.slotStartIso || "").trim();
      }
      syncPicker(rescheduleDateInput, rescheduleTimeGrid, rescheduleTimeEmpty, rescheduleSlotInput, booking.slotStartIso);
    }
  }

  if (slotDateInput) {
    slotDateInput.addEventListener("change", function () {
      syncPicker(slotDateInput, slotTimeGrid, slotTimeEmpty, slotStartIsoInput, "");
    });
  }

  if (rescheduleDateInput) {
    rescheduleDateInput.addEventListener("change", function () {
      syncPicker(rescheduleDateInput, rescheduleTimeGrid, rescheduleTimeEmpty, rescheduleSlotInput, "");
    });
  }

  if (refreshSlotsBtn) {
    refreshSlotsBtn.addEventListener("click", function () {
      setStatus(bookStatus, "", "idle");
      loadSlots().catch(function (error) {
        setStatus(bookStatus, error.message || "Could not refresh slots", "error");
      });
    });
  }

  if (bookForm) {
    bookForm.addEventListener("submit", function (event) {
      event.preventDefault();
      setStatus(bookStatus, "", "idle");
      if (bookMeetingPanel) bookMeetingPanel.hidden = true;

      var payload = {
        fullName: String((bookForm.fullName && bookForm.fullName.value) || "").trim(),
        schoolName: String((bookForm.schoolName && bookForm.schoolName.value) || "").trim(),
        workEmail: String((bookForm.workEmail && bookForm.workEmail.value) || "").trim(),
        phone: String((bookForm.phone && bookForm.phone.value) || "").trim(),
        role: String((bookForm.role && bookForm.role.value) || "").trim(),
        studentPopulation: String((bookForm.studentPopulation && bookForm.studentPopulation.value) || "").trim(),
        slotStartIso: String((bookForm.slotStartIso && bookForm.slotStartIso.value) || "").trim(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
        website: String((bookForm.website && bookForm.website.value) || "").trim(),
      };

      if (
        !payload.fullName ||
        !payload.schoolName ||
        !payload.workEmail ||
        !payload.phone ||
        !payload.role ||
        !payload.studentPopulation ||
        !payload.slotStartIso
      ) {
        setStatus(bookStatus, "Please complete all fields and choose a slot.", "error");
        return;
      }

      if (bookSubmitBtn) {
        bookSubmitBtn.disabled = true;
        bookSubmitBtn.textContent = "Booking...";
      }

      fetchJson("/.netlify/functions/school-call-book", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (data) {
          trackLeadEvent(data && data.meta && data.meta.eventId);
          setStatus(bookStatus, "Call booked successfully. Check your email for details.", "ok");
          renderBookedPanel(data);
          bookForm.reset();
          if (slotStartIsoInput) slotStartIsoInput.value = "";
          return loadSlots();
        })
        .catch(function (error) {
          setStatus(bookStatus, error.message || "Could not book call.", "error");
        })
        .finally(function () {
          if (bookSubmitBtn) {
            bookSubmitBtn.disabled = false;
            bookSubmitBtn.textContent = "Book call";
          }
        });
    });
  }

  if (rescheduleBtn) {
    rescheduleBtn.addEventListener("click", function () {
      setStatus(manageStatus, "", "idle");
      var slotStartIso = String((rescheduleSlotInput && rescheduleSlotInput.value) || "").trim();
      if (!slotStartIso) {
        setStatus(manageStatus, "Please choose a new slot.", "error");
        return;
      }

      rescheduleBtn.disabled = true;
      rescheduleBtn.textContent = "Rescheduling...";

      fetchJson("/.netlify/functions/school-call-reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          manageToken: manageToken,
          slotStartIso: slotStartIso,
          note: String((manageNote && manageNote.value) || "").trim(),
        }),
      })
        .then(function (data) {
          setStatus(manageStatus, "Booking rescheduled to " + String(data.slotLabel || "new time") + ".", "ok");
          return loadManageBooking(manageToken);
        })
        .catch(function (error) {
          setStatus(manageStatus, error.message || "Could not reschedule booking.", "error");
        })
        .finally(function () {
          rescheduleBtn.disabled = false;
          rescheduleBtn.textContent = "Reschedule";
        });
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      setStatus(manageStatus, "", "idle");
      if (!window.confirm("Cancel this booking?")) return;

      cancelBtn.disabled = true;
      cancelBtn.textContent = "Cancelling...";

      fetchJson("/.netlify/functions/school-call-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          manageToken: manageToken,
          reason: String((manageNote && manageNote.value) || "").trim(),
        }),
      })
        .then(function () {
          setStatus(manageStatus, "Booking cancelled.", "ok");
          return loadManageBooking(manageToken);
        })
        .catch(function (error) {
          setStatus(manageStatus, error.message || "Could not cancel booking.", "error");
        })
        .finally(function () {
          cancelBtn.disabled = false;
          cancelBtn.textContent = "Cancel booking";
        });
    });
  }

  function boot() {
    manageToken = getManageTokenFromUrl();

    loadSlots()
      .then(function () {
        if (manageToken) {
          return loadManageBooking(manageToken);
        }
        return null;
      })
      .catch(function (error) {
        setStatus(bookStatus, error.message || "Could not load slots.", "error");
        setStatus(manageStatus, error.message || "Could not load slots.", "error");
      });

    if (manageToken) {
      if (bookPanel) bookPanel.hidden = true;
      if (managePanel) managePanel.hidden = false;
    } else {
      if (bookPanel) bookPanel.hidden = false;
      if (managePanel) managePanel.hidden = true;
    }
  }

  boot();
})();
