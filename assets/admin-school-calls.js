(function () {
  var rowsEl = document.getElementById("schoolCallsRows");
  var messageEl = document.getElementById("schoolCallsMessage");
  var refreshBtn = document.getElementById("schoolCallsRefreshBtn");

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

  function setMessage(text, bad) {
    if (!messageEl) return;
    messageEl.textContent = clean(text);
    messageEl.className = "text-sm " + (bad ? "text-red-600" : "text-gray-600");
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

  function renderRows(items) {
    if (!rowsEl) return;
    if (!items.length) {
      rowsEl.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-sm text-gray-500">No bookings yet.</td></tr>';
      return;
    }

    rowsEl.innerHTML = items.map(function (row) {
      var zoom = clean(row.zoomJoinUrl);
      return [
        "<tr>",
        '<td class="px-4 py-3">',
        '<p class="font-semibold text-gray-900">' + escapeHtml(row.schoolName || "-") + "</p>",
        '<p class="text-xs text-gray-500">' + escapeHtml(row.studentPopulation || "") + " students</p>",
        "</td>",
        '<td class="px-4 py-3">',
        '<p class="text-sm text-gray-800">' + escapeHtml(row.fullName || "-") + "</p>",
        '<p class="text-xs text-gray-500">' + escapeHtml(row.workEmail || "-") + "</p>",
        '<p class="text-xs text-gray-500">' + escapeHtml(row.phone || "-") + "</p>",
        "</td>",
        '<td class="px-4 py-3 text-gray-700">' + escapeHtml(row.slotLabel || "-") + "</td>",
        '<td class="px-4 py-3">' + statusPill(row.status) + "</td>",
        '<td class="px-4 py-3">' + (zoom ? '<a class="text-brand-600 underline" href="' + escapeHtml(zoom) + '" target="_blank" rel="noopener noreferrer">Open Zoom</a>' : '<span class="text-gray-400">-</span>') + "</td>",
        '<td class="px-4 py-3 text-right">',
        '<button type="button" data-action="reschedule" data-booking="' + escapeHtml(row.bookingUuid) + '" class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 mr-2">Reschedule</button>',
        '<button type="button" data-action="cancel" data-booking="' + escapeHtml(row.bookingUuid) + '" class="inline-flex items-center justify-center rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100">Cancel</button>',
        "</td>",
        "</tr>",
      ].join("");
    }).join("");

    Array.prototype.slice.call(rowsEl.querySelectorAll("button[data-action]")).forEach(function (button) {
      button.addEventListener("click", function () {
        var action = clean(button.getAttribute("data-action")).toLowerCase();
        var bookingUuid = clean(button.getAttribute("data-booking"));
        if (!bookingUuid) return;

        if (action === "cancel") {
          cancelBooking(bookingUuid).catch(function (error) {
            setMessage(error.message || "Could not cancel booking", true);
          });
          return;
        }

        if (action === "reschedule") {
          rescheduleBooking(bookingUuid).catch(function (error) {
            setMessage(error.message || "Could not reschedule booking", true);
          });
        }
      });
    });
  }

  async function cancelBooking(bookingUuid) {
    if (!window.confirm("Cancel this booking?")) return;
    var note = window.prompt("Optional cancellation note", "Cancelled by admin") || "Cancelled by admin";

    await api("/.netlify/functions/admin-school-call-update", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ bookingUuid: bookingUuid, action: "cancel", note: note }),
    });

    setMessage("Booking cancelled.", false);
    await load();
  }

  async function rescheduleBooking(bookingUuid) {
    var slotsRes = await api("/.netlify/functions/school-call-slots");
    var slots = Array.isArray(slotsRes.slots) ? slotsRes.slots.slice(0, 12) : [];
    if (!slots.length) {
      throw new Error("No available slots to reschedule into right now.");
    }

    var optionsText = slots.map(function (slot, index) {
      return String(index + 1) + ". " + String(slot.label || slot.startIso || "");
    }).join("\\n");

    var pickedRaw = window.prompt("Pick slot number:\\n\\n" + optionsText, "1");
    if (!pickedRaw) return;
    var picked = Number(pickedRaw);
    if (!Number.isFinite(picked) || picked < 1 || picked > slots.length) {
      throw new Error("Invalid slot selection.");
    }
    var slotStartIso = String(slots[picked - 1].startIso || "").trim();
    if (!slotStartIso) throw new Error("Could not resolve selected slot.");

    var note = window.prompt("Optional reschedule note", "Rescheduled by admin") || "Rescheduled by admin";

    await api("/.netlify/functions/admin-school-call-update", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ bookingUuid: bookingUuid, action: "reschedule", slotStartIso: slotStartIso, note: note }),
    });

    setMessage("Booking rescheduled.", false);
    await load();
  }

  async function load() {
    setMessage("Loading school calls...", false);
    var data = await api("/.netlify/functions/admin-school-calls-list");
    var bookings = Array.isArray(data.bookings) ? data.bookings : [];
    renderRows(bookings);
    setMessage("Loaded " + String(bookings.length) + " booking(s).", false);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      load().catch(function (error) {
        setMessage(error.message || "Could not load school calls", true);
      });
    });
  }

  load().catch(function (error) {
    setMessage(error.message || "Could not load school calls", true);
  });
})();
