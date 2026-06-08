(function () {
  var loadingEl = document.getElementById("familyLoading");
  var errorEl = document.getElementById("familyError");
  var contentEl = document.getElementById("familyContent");
  var gridEl = document.getElementById("familyChildrenGrid");
  var emptyEl = document.getElementById("familyEmpty");
  var titleEl = document.getElementById("familyTitle");
  var summaryEl = document.getElementById("familySummary");
  var accountNameEl = document.getElementById("familyAccountName");
  var accountEmailEl = document.getElementById("familyAccountEmail");
  var enrollToggleEl = document.getElementById("familyEnrollToggle");
  var enrollPanelEl = document.getElementById("familyEnrollPanel");
  var enrollCloseEl = document.getElementById("familyEnrollClose");
  var enrollFormEl = document.getElementById("familyEnrollForm");
  var enrollCourseEl = document.getElementById("familyEnrollCourse");
  var enrollBatchEl = document.getElementById("familyEnrollBatch");
  var enrollChildrenEl = document.getElementById("familyEnrollChildren");
  var enrollAddChildEl = document.getElementById("familyEnrollAddChild");
  var enrollSummaryEl = document.getElementById("familyEnrollSummary");
  var enrollSubmitEl = document.getElementById("familyEnrollSubmit");
  var enrollMessageEl = document.getElementById("familyEnrollMessage");
  var maxChildren = 5;
  var selectedCourseData = null;
  var loadingEnrollmentOptions = false;

  var dashboardCourses = [
    { slug: "prompt-to-profit-holiday", label: "Prompt to Profit Holiday", explicitBatch: true },
    { slug: "prompt-to-profit", label: "Prompt to Profit", explicitBatch: false },
    { slug: "prompt-to-production", label: "Prompt to Profit Advanced", explicitBatch: false },
  ];

  function setVisible(el, visible) {
    if (!el) return;
    el.hidden = !visible;
    el.classList.toggle("hidden", !visible);
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] || ch;
    });
  }

  function courseName(slug) {
    var map = {
      "prompt-to-profit": "Prompt to Profit",
      "prompt-to-production": "Prompt to Profit Advanced",
      "prompt-to-profit-holiday": "Prompt to Profit Holiday",
      "ai-for-everyday-business-owners": "AI for Everyday Business Owners",
    };
    return map[String(slug || "").toLowerCase()] || String(slug || "Course");
  }

  function formatNgnMinor(minor) {
    var amount = Number(minor || 0) / 100;
    if (!Number.isFinite(amount)) return "";
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);
  }

  function setEnrollmentMessage(message, tone) {
    if (!enrollMessageEl) return;
    enrollMessageEl.textContent = message || "";
    enrollMessageEl.className = "text-sm font-semibold";
    if (!message) {
      enrollMessageEl.classList.add("hidden");
      return;
    }
    enrollMessageEl.classList.remove("hidden");
    enrollMessageEl.classList.add(tone === "error" ? "text-red-700" : "text-brand-700");
  }

  function paystackTotalForBase(baseMinor) {
    var courseMinor = Math.max(0, Math.round(Number(baseMinor || 0)));
    var vatPercent = Number(selectedCourseData && selectedCourseData.coursePricing && selectedCourseData.coursePricing.vatPercent);
    var safeVatPercent = Number.isFinite(vatPercent) && vatPercent >= 0 ? vatPercent : 7.5;
    var vatMinor = Math.round((courseMinor * safeVatPercent) / 100);
    var targetMinor = courseMinor + vatMinor;
    var applicableAtPrice = Math.round(targetMinor * 0.015) + (targetMinor < 250000 ? 0 : 10000);
    if (applicableAtPrice > 200000) return targetMinor + 200000;
    return Math.ceil(((targetMinor + (targetMinor < 250000 ? 0 : 10000)) / (1 - 0.015)) + 1);
  }

  function selectedBatch() {
    if (!selectedCourseData || !enrollBatchEl) return null;
    var batchKey = String(enrollBatchEl.value || "");
    var batches = Array.isArray(selectedCourseData.batches) ? selectedCourseData.batches : [];
    for (var i = 0; i < batches.length; i += 1) {
      if (String(batches[i].batchKey || "") === batchKey) return batches[i];
    }
    return selectedCourseData.activeBatch || null;
  }

  function enrollmentSeatCount() {
    if (!enrollChildrenEl) return 1;
    return Math.max(1, enrollChildrenEl.querySelectorAll("[data-family-enroll-child]").length || 1);
  }

  function enrollmentChildren() {
    if (!enrollChildrenEl) return [];
    return Array.prototype.slice.call(enrollChildrenEl.querySelectorAll("[data-family-enroll-child]")).map(function (row) {
      return {
        fullName: String((row.querySelector("[data-family-enroll-name]") || {}).value || "").trim(),
        age: String((row.querySelector("[data-family-enroll-age]") || {}).value || "").trim(),
        classLevel: String((row.querySelector("[data-family-enroll-class]") || {}).value || "").trim(),
      };
    });
  }

  function updateEnrollmentSummary() {
    if (!enrollSummaryEl) return;
    if (loadingEnrollmentOptions) {
      enrollSummaryEl.textContent = "Loading program pricing...";
      return;
    }
    var batch = selectedBatch();
    if (!batch) {
      enrollSummaryEl.textContent = "Choose an available batch to see the total.";
      return;
    }
    var coursePricing = selectedCourseData && selectedCourseData.coursePricing ? selectedCourseData.coursePricing : {};
    var basePerChild = Number(coursePricing.priceNgnMinor || 0) > 0
      ? Number(coursePricing.priceNgnMinor || 0)
      : Number(batch.paystackAmountMinor || 0);
    var seats = enrollmentSeatCount();
    var totalMinor = paystackTotalForBase(basePerChild * seats);
    enrollSummaryEl.textContent = String(seats) + " child" + (seats === 1 ? "" : "ren") + " selected - Total (Paystack): " + formatNgnMinor(totalMinor);
  }

  function updateAddChildState() {
    if (!enrollAddChildEl) return;
    var seats = enrollmentSeatCount();
    enrollAddChildEl.disabled = seats >= maxChildren;
    enrollAddChildEl.classList.toggle("opacity-60", seats >= maxChildren);
  }

  function addEnrollmentChildRow() {
    if (!enrollChildrenEl) return;
    var nextIndex = enrollmentSeatCount() + 1;
    if (nextIndex > maxChildren) return;
    var row = document.createElement("div");
    row.className = "rounded-lg border border-gray-200 bg-white p-4";
    row.setAttribute("data-family-enroll-child", "true");
    row.innerHTML = [
      '<div class="flex items-center justify-between gap-3">',
      '<h4 class="text-sm font-bold text-gray-900">Child ' + String(nextIndex) + "</h4>",
      '<button type="button" data-family-enroll-remove class="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">Remove</button>',
      "</div>",
      '<div class="mt-3 grid gap-3 md:grid-cols-3">',
      '<label class="block md:col-span-1"><span class="text-xs font-bold text-gray-700">Child full name</span><input data-family-enroll-name class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-semibold text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" autocomplete="off" placeholder="E.g. Ada Johnson" /></label>',
      '<label class="block"><span class="text-xs font-bold text-gray-700">Age</span><input data-family-enroll-age class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-semibold text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" inputmode="numeric" placeholder="10" /></label>',
      '<label class="block"><span class="text-xs font-bold text-gray-700">Class / level</span><input data-family-enroll-class class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-semibold text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" autocomplete="off" placeholder="Primary 5, JSS 1" /></label>',
      "</div>",
    ].join("");
    enrollChildrenEl.appendChild(row);
    renumberEnrollmentRows();
    updateAddChildState();
    updateEnrollmentSummary();
  }

  function renumberEnrollmentRows() {
    if (!enrollChildrenEl) return;
    Array.prototype.slice.call(enrollChildrenEl.querySelectorAll("[data-family-enroll-child]")).forEach(function (row, index) {
      var title = row.querySelector("h4");
      var remove = row.querySelector("[data-family-enroll-remove]");
      if (title) title.textContent = "Child " + String(index + 1);
      if (remove) {
        remove.hidden = enrollmentSeatCount() <= 1;
        remove.classList.toggle("hidden", enrollmentSeatCount() <= 1);
      }
    });
  }

  function resetEnrollmentChildren() {
    if (enrollChildrenEl) enrollChildrenEl.innerHTML = "";
    addEnrollmentChildRow();
  }

  function populateBatchOptions(data) {
    if (!enrollBatchEl) return;
    enrollBatchEl.innerHTML = "";
    var batches = Array.isArray(data.batches) ? data.batches : [];
    if (data.activeBatch && !batches.length) batches = [data.activeBatch];
    batches = batches.filter(function (batch) { return batch && !batch.isFull; });
    if (!batches.length) {
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = data.isEnrollmentLocked ? "Enrollment is locked" : "No open batch available";
      enrollBatchEl.appendChild(empty);
      enrollBatchEl.disabled = true;
      if (enrollSubmitEl) enrollSubmitEl.disabled = true;
      return;
    }
    batches.forEach(function (batch) {
      var option = document.createElement("option");
      option.value = batch.batchKey || "";
      option.textContent = batch.batchLabel || "Current program";
      if (Number.isFinite(Number(batch.remainingSeats))) {
        option.textContent += " - " + String(batch.remainingSeats) + " seat" + (Number(batch.remainingSeats) === 1 ? "" : "s") + " left";
      }
      enrollBatchEl.appendChild(option);
    });
    enrollBatchEl.disabled = batches.length <= 1;
    if (enrollSubmitEl) enrollSubmitEl.disabled = !!data.isEnrollmentLocked || !(data.familyEnrollment && data.familyEnrollment.enabled);
  }

  function loadEnrollmentOptions() {
    if (!enrollCourseEl) return Promise.resolve();
    var courseSlug = String(enrollCourseEl.value || "prompt-to-profit-holiday");
    var course = dashboardCourses.find(function (item) { return item.slug === courseSlug; }) || dashboardCourses[0];
    loadingEnrollmentOptions = true;
    selectedCourseData = null;
    setEnrollmentMessage("", "info");
    updateEnrollmentSummary();
    var url = course.explicitBatch
      ? "/.netlify/functions/course-open-batches?course_slug=" + encodeURIComponent(course.slug)
      : "/.netlify/functions/course-active-batch?course_slug=" + encodeURIComponent(course.slug);
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not load program options.");
          return json;
        });
      })
      .then(function (json) {
        maxChildren = Number(json.familyEnrollment && json.familyEnrollment.maxChildren) || maxChildren;
        selectedCourseData = json;
        populateBatchOptions(json);
        if (!(json.familyEnrollment && json.familyEnrollment.enabled)) {
          setEnrollmentMessage("Family enrollment is not available for this program.", "error");
        }
      })
      .catch(function (error) {
        selectedCourseData = null;
        populateBatchOptions({ batches: [] });
        setEnrollmentMessage(error.message || "Could not load program options.", "error");
      })
      .then(function () {
        loadingEnrollmentOptions = false;
        updateAddChildState();
        updateEnrollmentSummary();
      });
  }

  function setEnrollmentPanelOpen(open) {
    setVisible(enrollPanelEl, open);
    if (open && !selectedCourseData) loadEnrollmentOptions();
  }

  function statusLabel(value) {
    var status = String(value || "").replace(/_/g, " ");
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Pending";
  }

  function childCard(child) {
    var name = escapeHtml(child.fullName || "Child");
    var accessCode = escapeHtml(child.accessCode || "Pending");
    var course = escapeHtml(courseName(child.courseSlug));
    var batch = escapeHtml(child.batchLabel || child.batchKey || "Current program");
    var enrollmentStatus = escapeHtml(statusLabel(child.enrollmentStatus || child.status));
    var age = child.age ? '<span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">Age ' + escapeHtml(child.age) + "</span>" : "";
    var classLevel = child.classLevel ? '<span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">' + escapeHtml(child.classLevel) + "</span>" : "";
    return [
      '<article class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">',
      '<div class="flex items-start justify-between gap-3">',
      "<div>",
      '<h2 class="font-heading text-lg font-bold text-gray-900">' + name + "</h2>",
      '<p class="mt-1 text-sm text-gray-600">' + course + "</p>",
      "</div>",
      '<span class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">' + enrollmentStatus + "</span>",
      "</div>",
      '<div class="mt-3 flex flex-wrap gap-2">' + age + classLevel + "</div>",
      '<div class="mt-5 rounded-lg border border-brand-100 bg-brand-50 p-4">',
      '<p class="text-xs font-bold uppercase tracking-wide text-brand-600">Child Access Code</p>',
      '<p class="mt-1 font-mono text-2xl font-extrabold tracking-wide text-brand-800">' + accessCode + "</p>",
      "</div>",
      '<dl class="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">',
      "<div><dt class=\"font-semibold text-gray-500\">Batch</dt><dd class=\"mt-1 text-gray-900\">" + batch + "</dd></div>",
      "<div><dt class=\"font-semibold text-gray-500\">Progress</dt><dd class=\"mt-1 text-gray-900\">Available soon</dd></div>",
      "</dl>",
      "</article>",
    ].join("");
  }

  function render(data) {
    var account = data.account || {};
    var family = data.family || null;
    var children = Array.isArray(data.children) ? data.children : [];
    if (accountNameEl) accountNameEl.textContent = account.fullName || "";
    if (accountEmailEl) accountEmailEl.textContent = account.email || "";
    if (titleEl) titleEl.textContent = family ? "Your children" : "Family dashboard";
    if (summaryEl) {
      summaryEl.textContent = children.length
        ? String(children.length) + " child" + (children.length === 1 ? "" : "ren") + " enrolled under this family account."
        : "Manage all child enrollments from one parent account.";
    }
    if (enrollToggleEl) enrollToggleEl.textContent = family ? "Enrol another child" : "Enroll Child";
    if (gridEl) gridEl.innerHTML = children.map(childCard).join("");
    setVisible(emptyEl, !children.length);
    setVisible(contentEl, true);
  }

  if (enrollToggleEl) {
    enrollToggleEl.addEventListener("click", function () {
      setEnrollmentPanelOpen(enrollPanelEl ? enrollPanelEl.hidden : true);
    });
  }

  if (enrollCloseEl) {
    enrollCloseEl.addEventListener("click", function () {
      setEnrollmentPanelOpen(false);
    });
  }

  if (enrollCourseEl) {
    enrollCourseEl.addEventListener("change", function () {
      loadEnrollmentOptions();
    });
  }

  if (enrollBatchEl) {
    enrollBatchEl.addEventListener("change", updateEnrollmentSummary);
  }

  if (enrollAddChildEl) {
    enrollAddChildEl.addEventListener("click", function () {
      addEnrollmentChildRow();
    });
  }

  if (enrollChildrenEl) {
    enrollChildrenEl.addEventListener("input", updateEnrollmentSummary);
    enrollChildrenEl.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var button = target.closest("[data-family-enroll-remove]");
      if (!button) return;
      var row = button.closest("[data-family-enroll-child]");
      if (row && enrollmentSeatCount() > 1) row.remove();
      renumberEnrollmentRows();
      updateAddChildState();
      updateEnrollmentSummary();
    });
  }

  if (enrollFormEl) {
    enrollFormEl.addEventListener("submit", function (event) {
      event.preventDefault();
      setEnrollmentMessage("", "info");
      var children = enrollmentChildren();
      if (!children.length || children.some(function (child) { return !child.fullName; })) {
        setEnrollmentMessage("Add each child's full name before continuing.", "error");
        return;
      }
      var batch = selectedBatch();
      if (!batch) {
        setEnrollmentMessage("Choose an available batch before continuing.", "error");
        return;
      }
      if (enrollSubmitEl) {
        enrollSubmitEl.disabled = true;
        enrollSubmitEl.textContent = "Creating checkout...";
      }
      fetch("/.netlify/functions/family-enrollment-create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          courseSlug: enrollCourseEl ? enrollCourseEl.value : "prompt-to-profit-holiday",
          batchKey: batch.batchKey || null,
          children: children,
        }),
      })
        .then(function (res) {
          return res.json().catch(function () { return null; }).then(function (json) {
            if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not create checkout.");
            return json;
          });
        })
        .then(function (json) {
          if (json.checkoutUrl) {
            window.location.href = json.checkoutUrl;
            return;
          }
          throw new Error("Checkout link was not returned.");
        })
        .catch(function (error) {
          setEnrollmentMessage(error.message || "Could not create checkout.", "error");
          if (enrollSubmitEl) {
            enrollSubmitEl.disabled = false;
            enrollSubmitEl.textContent = "Proceed to Payment";
          }
        });
    });
  }

  resetEnrollmentChildren();

  fetch("/.netlify/functions/family-dashboard", { headers: { Accept: "application/json" } })
    .then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) {
        if (!res.ok || !json || !json.ok) {
          var error = new Error((json && json.error) || "Could not load family dashboard.");
          error.status = res.status;
          throw error;
        }
        return json;
      });
    })
    .then(function (json) {
      setVisible(loadingEl, false);
      render(json);
    })
    .catch(function (error) {
      setVisible(loadingEl, false);
      if (error && error.status === 401) {
        window.location.href = "/dashboard/?next=/dashboard/family/";
        return;
      }
      if (errorEl) {
        errorEl.textContent = error.message || "Could not load family dashboard.";
        setVisible(errorEl, true);
      }
    });
})();
