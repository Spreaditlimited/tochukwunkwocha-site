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
  var submissionModal = document.getElementById("buildSubmissionModal");
  var submissionModalTitle = document.getElementById("buildSubmissionModalTitle");
  var submissionModalBody = document.getElementById("buildSubmissionModalBody");
  var paymentLinkModal = document.getElementById("buildPaymentLinkModal");
  var paymentLinkModalTitle = document.getElementById("buildPaymentLinkModalTitle");
  var paymentLinkModalDescription = document.getElementById("buildPaymentLinkModalDescription");
  var paymentLinkModalError = document.getElementById("buildPaymentLinkModalError");
  var paymentLinkModalConfirm = document.getElementById("buildPaymentLinkModalConfirmBtn");

  var currentRows = [];
  var currentLeadForBook = null;
  var currentLeadForPaymentLink = null;

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
  function followUpBadge(required) {
    if (required) return '<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-amber-100 text-amber-800">Required</span>';
    return '<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-600">No</span>';
  }

  function paymentStatusBadge(status) {
    var s = clean(status).toLowerCase();
    if (s === "paid") return '<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700">Paid</span>';
    if (s === "initiated") return '<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-amber-100 text-amber-700">Payment pending</span>';
    return '<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-600">Not sent</span>';
  }

  function isManualReviewLead(row) {
    return clean(row && row.bandKey).toLowerCase() === "manual_review" || Boolean(row && row.followUpRequired);
  }

  function canSendPaymentLinkForRow(row) {
    var call = row && row.call && typeof row.call === "object" ? row.call : {};
    var payment = row && row.discoveryPayment && typeof row.discoveryPayment === "object" ? row.discoveryPayment : {};
    return isManualReviewLead(row) && !clean(call.bookingUuid) && clean(payment.status).toLowerCase() !== "paid";
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

  function showSubmissionModal() {
    if (!submissionModal) return;
    submissionModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeSubmissionModal() {
    if (!submissionModal) return;
    submissionModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function setPaymentLinkModalError(text) {
    if (!paymentLinkModalError) return;
    var msg = clean(text);
    paymentLinkModalError.textContent = msg;
    paymentLinkModalError.classList.toggle("hidden", !msg);
  }

  function showPaymentLinkModal() {
    if (!paymentLinkModal) return;
    paymentLinkModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closePaymentLinkModal() {
    currentLeadForPaymentLink = null;
    if (!paymentLinkModal) return;
    paymentLinkModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    setPaymentLinkModalError("");
    if (paymentLinkModalConfirm) {
      paymentLinkModalConfirm.disabled = false;
      paymentLinkModalConfirm.textContent = "Send Payment Link";
    }
  }

  function renderSubmissionHtml(row) {
    var answers = Array.isArray(row && row.answers) ? row.answers : [];
    var scoredAnswers = answers.filter(function (a) { return clean(a && a.question).indexOf("Submitted - ") !== 0; });
    var submittedAnswers = answers.filter(function (a) { return clean(a && a.question).indexOf("Submitted - ") === 0; });
    var payment = row && row.discoveryPayment && typeof row.discoveryPayment === "object" ? row.discoveryPayment : {};
    var paymentStatus = clean(payment.status).toLowerCase();
    var answerHtml = scoredAnswers.length
      ? scoredAnswers.map(function (a, idx) {
        return '<div class="rounded-lg border border-gray-200 bg-white p-3"><p class="text-xs font-semibold text-gray-500">Q' + String(idx + 1) + '</p><p class="mt-1 text-sm font-semibold text-gray-900">' + escapeHtml(a.question || "-") + '</p><p class="mt-1 text-sm text-gray-700">' + escapeHtml(a.answer || "-") + '</p><p class="mt-1 text-xs text-gray-500">Score: ' + escapeHtml(String(Number(a.score || 0))) + "</p></div>";
      }).join("")
      : '<p class="text-sm text-gray-500">No captured answers.</p>';
    var submittedHtml = submittedAnswers.length
      ? submittedAnswers.map(function (a) {
        return '<div class="rounded-lg border border-gray-200 bg-white p-3"><p class="text-xs font-semibold text-gray-500">' + escapeHtml(clean(a.question).replace(/^Submitted - /, "") || "Submitted field") + '</p><p class="mt-1 text-sm whitespace-pre-wrap text-gray-800">' + escapeHtml(a.answer || "-") + "</p></div>";
      }).join("")
      : '<p class="text-sm text-gray-500">No explicit submitted field snapshot for this lead.</p>';
    return [
      '<div class="space-y-3">',
      '<div class="rounded-lg border border-gray-200 bg-white p-3">',
      '<p><span class="font-semibold">Name:</span> ' + escapeHtml(row.fullName || "-") + '</p>',
      '<p><span class="font-semibold">Business:</span> ' + escapeHtml(row.schoolName || "-") + '</p>',
      '<p><span class="font-semibold">Email:</span> ' + escapeHtml(row.workEmail || "-") + '</p>',
      '<p><span class="font-semibold">Phone:</span> ' + escapeHtml(row.phone || "-") + '</p>',
      '<p><span class="font-semibold">Role:</span> ' + escapeHtml(row.role || "-") + '</p>',
      '<p><span class="font-semibold">Company size/website:</span> ' + escapeHtml(row.studentPopulation || "-") + '</p>',
      '<p><span class="font-semibold">Score:</span> ' + escapeHtml(String(Number(row.score || 0))) + '/100</p>',
      '<p><span class="font-semibold">Band:</span> ' + escapeHtml(row.bandKey || "-") + '</p>',
      '<p><span class="font-semibold">Discovery payment:</span> ' + escapeHtml(paymentStatus || "not sent") + '</p>',
      "</div>",
      canSendPaymentLinkForRow(row)
        ? '<button type="button" data-lead="' + escapeHtml(row.leadUuid || "") + '" data-action="send-payment-link" class="inline-flex w-full items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors">Send Discovery Payment Link</button>'
        : "",
      '<div><p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Submitted Details</p><div class="space-y-2">' + submittedHtml + "</div></div>",
      '<div><p class="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Scoring Answers</p><div class="space-y-2">' + answerHtml + "</div></div>",
      "</div>",
    ].join("");
  }

  function openSubmissionModal(leadUuid) {
    var row = (currentRows || []).find(function (x) {
      return clean(x && x.leadUuid) === clean(leadUuid);
    }) || null;
    if (!row) return;
    if (submissionModalTitle) submissionModalTitle.textContent = "Submission - " + clean(row.schoolName || row.fullName || "Build lead");
    if (submissionModalBody) submissionModalBody.innerHTML = renderSubmissionHtml(row);
    var paymentBtn = submissionModalBody && submissionModalBody.querySelector('button[data-action="send-payment-link"]');
    if (paymentBtn) {
      paymentBtn.addEventListener("click", function () {
        try {
          openPaymentLinkModal(clean(paymentBtn.getAttribute("data-lead")));
        } catch (error) {
          setMessage(error.message || "Could not send discovery payment link.", true);
        }
      });
    }
    showSubmissionModal();
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

  function openPaymentLinkModal(leadUuid) {
    var row = (currentRows || []).find(function (x) {
      return clean(x && x.leadUuid) === clean(leadUuid);
    }) || null;
    if (!row) throw new Error("Lead not found");

    var payment = row.discoveryPayment && typeof row.discoveryPayment === "object" ? row.discoveryPayment : {};
    var verb = clean(payment.status).toLowerCase() === "initiated" ? "Resend" : "Send";
    currentLeadForPaymentLink = row;
    if (paymentLinkModalTitle) paymentLinkModalTitle.textContent = verb + " discovery payment link";
    if (paymentLinkModalDescription) {
      paymentLinkModalDescription.textContent = verb + " the discovery call payment link to " + clean(row.fullName || "this applicant") + " at " + clean(row.workEmail) + ".";
    }
    if (paymentLinkModalConfirm) paymentLinkModalConfirm.textContent = verb + " Payment Link";
    setPaymentLinkModalError("");
    if (submissionModal && submissionModal.getAttribute("aria-hidden") === "false") closeSubmissionModal();
    showPaymentLinkModal();
    if (paymentLinkModalConfirm) paymentLinkModalConfirm.focus();
  }

  async function submitPaymentLinkModal() {
    if (!currentLeadForPaymentLink) return;
    var originalText = paymentLinkModalConfirm ? clean(paymentLinkModalConfirm.textContent) : "Send Payment Link";
    if (paymentLinkModalConfirm) {
      paymentLinkModalConfirm.disabled = true;
      paymentLinkModalConfirm.textContent = "Sending...";
    }

    try {
      var data = await api("/.netlify/functions/admin-build-scorecard-send-payment-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ leadUuid: clean(currentLeadForPaymentLink.leadUuid) }),
      });
      closePaymentLinkModal();
      setMessage(data.message || "Discovery payment link sent.", false);
      await load();
    } finally {
      if (paymentLinkModalConfirm) {
        paymentLinkModalConfirm.disabled = false;
        paymentLinkModalConfirm.textContent = originalText;
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
      rowsEl.innerHTML = '<tr><td colspan="9" class="px-4 py-6 text-sm text-gray-500">No scorecard leads match the selected filters.</td></tr>';
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
      var payment = row.discoveryPayment && typeof row.discoveryPayment === "object" ? row.discoveryPayment : {};
      var paymentStatus = clean(payment.status).toLowerCase();
      var canSendPaymentLink = canSendPaymentLinkForRow(row);
      var paymentActionLabel = paymentStatus === "initiated" ? "Resend Payment Link" : "Send Payment Link";

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
        '<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ' + scoreBadge(row.score) + '">' + escapeHtml(String(Number(row.score || 0))) + '/100</span>',
        '<p class="mt-2 text-xs text-gray-600">' + escapeHtml(row.bandKey || "-") + "</p>",
        '<p class="text-xs text-gray-500">' + escapeHtml(row.headline || "-") + "</p>",
        "</td>",
        '<td class="px-4 py-3 align-top">',
        followUpBadge(Boolean(row.followUpRequired)),
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
        '<div class="mt-2">' + paymentStatusBadge(paymentStatus) + "</div>",
        row.discoveryPaymentLinkSentAt ? '<p class="mt-1 text-xs text-gray-500">Link sent: ' + escapeHtml(fmtDate(row.discoveryPaymentLinkSentAt)) + "</p>" : "",
        payment.paidAt ? '<p class="text-xs text-gray-500">Paid: ' + escapeHtml(fmtDate(payment.paidAt)) + "</p>" : "",
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
        '<button type="button" data-lead="' + escapeHtml(leadId) + '" data-action="view-submission" class="inline-flex w-full sm:w-auto items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors">View Submission</button>',
        (canSendPaymentLink
          ? '<button type="button" data-lead="' + escapeHtml(leadId) + '" data-action="send-payment-link" class="inline-flex w-full sm:w-auto items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors">' + escapeHtml(paymentActionLabel) + "</button>"
          : ""),
        (call.bookingUuid
          ? '<a href="/internal/build-calls/" class="inline-flex w-full sm:w-auto items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">View Call</a>'
          : (paymentStatus === "paid"
            ? '<span class="inline-flex w-full sm:w-auto items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 whitespace-nowrap">Paid - Awaiting Booking</span>'
            : '<span class="inline-flex w-full sm:w-auto items-center justify-center rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 whitespace-nowrap">Manual review only</span>')),
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

    Array.prototype.slice.call(rowsEl.querySelectorAll('button[data-action="view-submission"]')).forEach(function (btn) {
      btn.addEventListener("click", function () {
        openSubmissionModal(clean(btn.getAttribute("data-lead")));
      });
    });

    Array.prototype.slice.call(rowsEl.querySelectorAll('button[data-action="send-payment-link"]')).forEach(function (btn) {
      btn.addEventListener("click", function () {
        try {
          openPaymentLinkModal(clean(btn.getAttribute("data-lead")));
        } catch (error) {
          setMessage(error.message || "Could not send discovery payment link.", true);
        }
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
    var data = await api("/.netlify/functions/admin-build-scorecards-list");
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

  if (submissionModal) {
    Array.prototype.slice.call(submissionModal.querySelectorAll("[data-build-submission-close]")).forEach(function (el) {
      el.addEventListener("click", closeSubmissionModal);
    });
  }

  if (paymentLinkModal) {
    Array.prototype.slice.call(paymentLinkModal.querySelectorAll("[data-build-payment-link-close]")).forEach(function (el) {
      el.addEventListener("click", closePaymentLinkModal);
    });
  }

  if (paymentLinkModalConfirm) {
    paymentLinkModalConfirm.addEventListener("click", function () {
      setPaymentLinkModalError("");
      submitPaymentLinkModal().catch(function (error) {
        setPaymentLinkModalError(error.message || "Could not send discovery payment link.");
      });
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && bookModal && bookModal.getAttribute("aria-hidden") === "false") {
      closeBookModal();
      return;
    }
    if (event.key === "Escape" && submissionModal && submissionModal.getAttribute("aria-hidden") === "false") {
      closeSubmissionModal();
      return;
    }
    if (event.key === "Escape" && paymentLinkModal && paymentLinkModal.getAttribute("aria-hidden") === "false") {
      closePaymentLinkModal();
    }
  });

  load().catch(function (error) {
    setMessage(error.message || "Could not load scorecard leads.", true);
  });
})();
