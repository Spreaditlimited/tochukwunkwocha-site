(function () {
  const listEl = document.getElementById("coursesList");
  const metaEl = document.getElementById("coursesMeta");
  const discoverEl = document.getElementById("discoverCoursesList");
  const COURSE_DURATION_DAYS = {
    "prompt-to-profit": 5,
  };
  const COURSE_CATALOG = [
    {
      slug: "prompt-to-profit",
      name: "Prompt to Profit",
      subtitle: "Build websites with AI and position for paid jobs.",
      href: "/courses/prompt-to-profit/",
      theme: {
        card: "bg-gradient-to-br from-[#eef4ff] via-[#f4f8ff] to-[#fdfdff] ring-[#c9dafd]",
        badge: "bg-[#dbeafe] text-[#1e3a8a]",
        button: "bg-[#1f3a73] text-white hover:bg-[#172d59]",
      },
    },
    {
      slug: "prompt-to-production",
      name: "Prompt to Production",
      subtitle: "Go from prompting to shipping full AI-powered products.",
      href: "/courses/prompt-to-production/",
      theme: {
        card: "bg-gradient-to-br from-[#eafaf3] via-[#f2fdf7] to-[#fbfffd] ring-[#b9e5cf]",
        badge: "bg-[#d1fae5] text-[#065f46]",
        button: "bg-[#136145] text-white hover:bg-[#0f4f38]",
      },
    },
  ];

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function courseUrl(slug) {
    const s = String(slug || "").trim().toLowerCase();
    if (!s) return "/courses/";
    return `/courses/${encodeURIComponent(s)}/`;
  }

  function coursePlayerUrl(slug, lessonId) {
    const s = String(slug || "").trim().toLowerCase();
    const base = `/dashboard/courses/player/?course=${encodeURIComponent(s)}`;
    const id = Number(lessonId || 0);
    if (!Number.isFinite(id) || id <= 0) return base;
    return `${base}&lesson=${encodeURIComponent(String(Math.trunc(id)))}`;
  }

  function normalizeSlug(value) {
    return String(value || "").trim().toLowerCase();
  }

  function themeForSlug(slug) {
    const s = normalizeSlug(slug);
    const found = COURSE_CATALOG.find(function (item) {
      return item.slug === s;
    });
    return (
      (found && found.theme) || {
        card: "bg-gradient-to-br from-[#f6f7fb] via-[#fbfbfe] to-[#ffffff] ring-[#e5e7eb]",
        badge: "bg-gray-200 text-gray-700",
        button: "bg-brand-600 text-white hover:bg-brand-500",
      }
    );
  }

  function renderDiscoverCourses(ownedSlugs) {
    if (!discoverEl) return;
    const owned = new Set((ownedSlugs || []).map(normalizeSlug).filter(Boolean));
    const available = COURSE_CATALOG.filter(function (item) {
      return !owned.has(item.slug);
    });

    if (!available.length) {
      discoverEl.innerHTML = [
        '<article class="rounded-2xl border border-gray-200 bg-gray-50 p-5 lg:col-span-2">',
        '<p class="text-sm font-semibold text-gray-900">You already own all available courses.</p>',
        '<p class="mt-1 text-sm text-gray-600">Check your courses above to continue learning.</p>',
        "</article>",
      ].join("");
      return;
    }

    discoverEl.innerHTML = available
      .map(function (course) {
        const spanClass = available.length === 1 ? " lg:col-span-2" : "";
        return [
          `<article class="rounded-2xl p-5 ring-1 shadow-sm ${course.theme.card}${spanClass}">`,
          `<span class="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${course.theme.badge}">Available now</span>`,
          `<h4 class="mt-3 text-lg font-heading font-extrabold text-gray-900">${escapeHtml(course.name)}</h4>`,
          `<p class="mt-2 text-sm text-gray-700">${escapeHtml(course.subtitle)}</p>`,
          `<a href="${escapeHtml(course.href)}" class="mt-4 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${course.theme.button}">View Course</a>`,
          "</article>",
        ].join("");
      })
      .join("");
  }

  function parseSqlDate(value) {
    const v = String(value || "").trim();
    if (!v) return null;
    const d = new Date(v.replace(" ", "T") + "Z");
    if (!Number.isFinite(d.getTime())) return null;
    return d;
  }

  function parseAnyDate(value) {
    const a = parseSqlDate(value);
    if (a) return a;
    const raw = String(value || "").trim();
    if (!raw) return null;
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return null;
    return d;
  }

  function formatDateShort(date) {
    if (!date) return "";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function batchTimingMeta(item) {
    const startDate = parseSqlDate(item && item.batchStartAt);
    const batchStatus = normalizeSlug(item && item.batchStatus);
    const courseSlug = normalizeSlug(item && item.courseSlug);
    const durationDays = Number(COURSE_DURATION_DAYS[courseSlug] || 0);
    const paidOrSubmittedAt = parseAnyDate((item && item.paidAt) || (item && item.submittedAt));
    const now = new Date();
    if (!startDate) {
      if (batchStatus === "closed") {
        return {
          label: "Batch already passed",
          css: "bg-rose-100 text-rose-700",
        };
      }
      if (durationDays > 0 && paidOrSubmittedAt) {
        const inferredEnd = new Date(paidOrSubmittedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
        if (now.getTime() >= inferredEnd.getTime()) {
          return {
            label: "Batch already passed",
            css: "bg-rose-100 text-rose-700",
          };
        }
      }
      return {
        label: "Start date to be announced",
        css: "bg-gray-200 text-gray-700",
      };
    }

    if (startDate.getTime() > now.getTime()) {
      return {
        label: `Starts ${formatDateShort(startDate)}`,
        css: "bg-amber-100 text-amber-800",
      };
    }

    if (durationDays > 0) {
      const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
      if (now.getTime() >= endDate.getTime()) {
        return {
          label: "Batch already passed",
          css: "bg-rose-100 text-rose-700",
        };
      }
      return {
        label: `In progress (ends ${formatDateShort(endDate)})`,
        css: "bg-emerald-100 text-emerald-700",
      };
    }

    if (batchStatus === "closed") {
      return {
        label: "Batch already passed",
        css: "bg-rose-100 text-rose-700",
      };
    }

    return {
      label: `Started ${formatDateShort(startDate)}`,
      css: "bg-emerald-100 text-emerald-700",
    };
  }

  async function load() {
    try {
      const res = await fetch("/.netlify/functions/user-purchased-courses", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const json = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not load courses");
      }

      const items = Array.isArray(json.items) ? json.items : [];
      const ownedSlugs = items.map(function (item) {
        return normalizeSlug(item.courseSlug);
      });
      if (metaEl) {
        const who = json.account && json.account.email ? ` for ${json.account.email}` : "";
        metaEl.textContent = `Showing ${items.length} paid course(s)${who}.`;
      }

      if (!items.length) {
        if (listEl) {
          listEl.innerHTML = [
            '<div class="rounded-2xl border border-gray-200 bg-gray-50 p-6">',
            '<p class="text-base font-semibold text-gray-900">You have not purchased any course yet.</p>',
            '<p class="mt-2 text-sm text-gray-600">When you pay for a course, it will appear here.</p>',
            '<a class="mt-4 inline-flex items-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-500" href="/courses/">Browse Courses</a>',
            "</div>",
          ].join("");
        }
        renderDiscoverCourses([]);
        return;
      }

      if (listEl) {
        listEl.innerHTML = items
          .map(function (item) {
            const status = String(item.status || "").toLowerCase();
            const isPending = status === "pending_verification";
            const paidAt = item.paidAt ? new Date(item.paidAt).toLocaleString() : "Unknown";
            const submittedAt = item.submittedAt ? new Date(item.submittedAt).toLocaleString() : "Unknown";
            const statusLabel = isPending ? "Pending verification" : "Paid";
            const statusBadge = isPending
              ? '<span class="status-pill status-pending_verification">Pending verification</span>'
              : '<span class="status-pill status-approved">Paid</span>';
            const theme = themeForSlug(item.courseSlug);
            const timing = batchTimingMeta(item);
            const resumeLessonId = Number(item.resumeLessonId || 0);
            const hasResume = Number.isFinite(resumeLessonId) && resumeLessonId > 0;
            const resumeLabel = hasResume ? "Resume where you stopped" : "Open Course Player";
            const resumeDetail = hasResume && item.lastActivityAt
              ? `Last watched: ${escapeHtml(new Date(item.lastActivityAt).toLocaleString())}`
              : "";
            return [
              `<article class="rounded-2xl p-5 shadow-sm ring-1 ${theme.card}">`,
              '<div class="flex items-start justify-between gap-3">',
              `<div><p class="text-sm font-bold text-gray-900">${escapeHtml(item.courseName || item.courseSlug)}</p>`,
              `<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                <span>Batch: ${escapeHtml(item.batchLabel || item.batchKey || "N/A")}</span>
                ${statusBadge}
                <span>${escapeHtml(statusLabel)}: ${escapeHtml(isPending ? submittedAt : paidAt)}</span>
              </div></div>`,
              `<span class="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${theme.badge}">Enrolled</span>`,
              "</div>",
              `<div class="mt-3"><span class="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${timing.css}">${escapeHtml(
                timing.label
              )}</span></div>`,
              resumeDetail ? `<p class="mt-2 text-xs text-gray-600">${resumeDetail}</p>` : "",
              '<div class="mt-4 flex flex-wrap gap-2">',
              `<a class="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${theme.button}" href="${escapeHtml(
                coursePlayerUrl(item.courseSlug, resumeLessonId)
              )}">${escapeHtml(resumeLabel)}</a>`,
              `<a class="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50" href="${escapeHtml(
                courseUrl(item.courseSlug)
              )}">Course Page</a>`,
              "</div>",
              "</article>",
            ].join("");
          })
          .join("");
      }
      renderDiscoverCourses(ownedSlugs);
    } catch (error) {
      if (metaEl) metaEl.textContent = "Could not load courses.";
      if (listEl) {
        listEl.innerHTML = `<p class="text-sm text-red-600">${escapeHtml(error.message || "Request failed")}</p>`;
      }
      if (discoverEl) {
        discoverEl.innerHTML = "";
      }
    }
  }

  load();
})();
