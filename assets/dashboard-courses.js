(function () {
  const listEl = document.getElementById("coursesList");
  const metaEl = document.getElementById("coursesMeta");
  const discoverEl = document.getElementById("discoverCoursesList");
  const welcomeEl = document.getElementById("coursesWelcomeNotice");
  const PURCHASE_WELCOME_KEY = "recent_course_purchase_notice_v1";
  const PURCHASE_WELCOME_DURATION_MS = 60 * 1000;
  const COURSE_DURATION_DAYS = {
    "prompt-to-profit": 5,
  };
  const DEFAULT_COURSE_CATALOG = [
    {
      slug: "prompt-to-profit",
      name: "Prompt to Profit",
      subtitle: "A 5-day beginner-friendly intensive to use AI properly and build practical websites and web tools.",
      href: "/courses/prompt-to-profit/",
      theme: {
        card: "bg-gradient-to-br from-[#eef4ff] via-[#f4f8ff] to-[#fdfdff] ring-[#c9dafd]",
        badge: "bg-[#dbeafe] text-[#1e3a8a]",
        button: "bg-[#1f3a73] text-white hover:bg-[#172d59]",
      },
    },
    {
      slug: "prompt-to-production",
      name: "Prompt to Profit Advanced",
      subtitle: "A 4-week hybrid program to master VS Code and AI coding assistants to build, debug, and deploy real web applications.",
      href: "/courses/prompt-to-production/",
      theme: {
        card: "bg-gradient-to-br from-[#eafaf3] via-[#f2fdf7] to-[#fbfffd] ring-[#b9e5cf]",
        badge: "bg-[#d1fae5] text-[#065f46]",
        button: "bg-[#136145] text-white hover:bg-[#0f4f38]",
      },
    },
    {
      slug: "prompt-to-profit-schools",
      name: "Prompt to Profit for Schools",
      subtitle: "A structured school program helping secondary students use AI to build practical digital projects with confidence.",
      href: "/courses/prompt-to-profit-schools/",
      theme: {
        card: "bg-gradient-to-br from-[#ecfeff] via-[#f0fdfa] to-[#f8fffe] ring-[#99f6e4]",
        badge: "bg-[#ccfbf1] text-[#0f766e]",
        button: "bg-[#0f766e] text-white hover:bg-[#0b5f59]",
      },
    },
    {
      slug: "ai-for-everyday-business-owners",
      name: "AI for Everyday Business Owners",
      subtitle: "Use ChatGPT to save time, write better, think clearly, and work faster across everyday business tasks.",
      href: "/courses/ai-for-everyday-business-owners/",
      theme: {
        card: "bg-gradient-to-br from-[#fff7ed] via-[#fffbf5] to-[#ffffff] ring-[#fdba74]",
        badge: "bg-[#ffedd5] text-[#9a3412]",
        button: "bg-[#c2410c] text-white hover:bg-[#9a3412]",
      },
    },
  ];
  let COURSE_CATALOG = DEFAULT_COURSE_CATALOG.slice();

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

  function prettifySlug(slug) {
    return String(slug || "")
      .trim()
      .split("-")
      .filter(Boolean)
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  }

  function courseNameForSlug(slug) {
    const normalized = normalizeSlug(slug);
    const found = COURSE_CATALOG.find(function (item) {
      return item.slug === normalized;
    });
    return (found && found.name) || prettifySlug(normalized) || "this course";
  }


  function readPurchaseWelcomeNotice() {
    try {
      const raw = window.localStorage.getItem(PURCHASE_WELCOME_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const courseName = String(parsed.courseName || "").trim();
      const expiresAt = Number(parsed.expiresAt || 0);
      if (!courseName || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
      return {
        courseName,
        expiresAt,
      };
    } catch (_error) {
      return null;
    }
  }

  function clearPurchaseWelcomeNotice() {
    try {
      window.localStorage.removeItem(PURCHASE_WELCOME_KEY);
    } catch (_error) {
      return;
    }
  }

  function consumePurchaseWelcomeFromQuery() {
    try {
      const search = new URLSearchParams(window.location.search);
      if (String(search.get("payment") || "").toLowerCase() !== "success") return;
      const querySlug = search.get("course_slug") || search.get("course") || "";
      const courseName = courseNameForSlug(querySlug);
      const payload = {
        courseName,
        expiresAt: Date.now() + PURCHASE_WELCOME_DURATION_MS,
      };
      window.localStorage.setItem(PURCHASE_WELCOME_KEY, JSON.stringify(payload));
      search.delete("payment");
      search.delete("course_slug");
      search.delete("course");
      search.delete("order_uuid");
      const url = new URL(window.location.href);
      url.search = search.toString();
      window.history.replaceState({}, "", url.pathname + (url.search ? "?" + url.search : "") + url.hash);
    } catch (_error) {
      return;
    }
  }

  function renderPurchaseWelcomeNotice() {
    if (!welcomeEl) return;
    const notice = readPurchaseWelcomeNotice();
    if (!notice) {
      clearPurchaseWelcomeNotice();
      welcomeEl.classList.add("hidden");
      welcomeEl.textContent = "";
      return;
    }
    welcomeEl.textContent = "Thank you for purchasing " + notice.courseName + ". We look forward to seeing you in class.";
    welcomeEl.classList.remove("hidden");
    const remainingMs = Math.max(0, notice.expiresAt - Date.now());
    window.setTimeout(function () {
      clearPurchaseWelcomeNotice();
      welcomeEl.classList.add("hidden");
      welcomeEl.textContent = "";
    }, remainingMs);
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

  function genericSubtitle(name) {
    return (String(name || "").trim() || "Course") + ". Practical learning program.";
  }

  function courseHref(slug) {
    const s = normalizeSlug(slug);
    return s ? `/courses/${encodeURIComponent(s)}/` : "/courses/";
  }

  function buildCatalogFromItems(items) {
    const rows = Array.isArray(items) ? items : [];
    const result = rows
      .map(function (item) {
        const slug = normalizeSlug(item && item.slug);
        const name = String(item && item.label || "").trim() || prettifySlug(slug);
        if (!slug) return null;
        const existing = DEFAULT_COURSE_CATALOG.find(function (row) {
          return normalizeSlug(row.slug) === slug;
        });
        if (existing) {
          return {
            slug: slug,
            name: name || existing.name,
            subtitle: existing.subtitle,
            href: existing.href,
            theme: existing.theme,
          };
        }
        return {
          slug: slug,
          name: name || slug,
          subtitle: genericSubtitle(name || slug),
          href: courseHref(slug),
          theme: {
            card: "bg-gradient-to-br from-[#f6f7fb] via-[#fbfbfe] to-[#ffffff] ring-[#e5e7eb]",
            badge: "bg-gray-200 text-gray-700",
            button: "bg-brand-600 text-white hover:bg-brand-500",
          },
        };
      })
      .filter(Boolean);
    return result.length ? result : DEFAULT_COURSE_CATALOG.slice();
  }

  async function loadCourseCatalog() {
    const res = await fetch("/.netlify/functions/course-slugs-list", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load course catalog");
    }
    COURSE_CATALOG = buildCatalogFromItems(Array.isArray(json.items) ? json.items : []);
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
    const accessExpiresDate = parseAnyDate(item && item.accessExpiresAt);
    const batchStatus = normalizeSlug(item && item.batchStatus);
    const courseSlug = normalizeSlug(item && item.courseSlug);
    const source = normalizeSlug(item && item.source);
    const enrollmentMode = normalizeSlug(item && item.enrollmentMode);
    const durationDays = Number(COURSE_DURATION_DAYS[courseSlug] || 0);
    const paidOrSubmittedAt = parseAnyDate((item && item.paidAt) || (item && item.submittedAt));
    const now = new Date();
    const hasActiveAccess = !!(accessExpiresDate && accessExpiresDate.getTime() > now.getTime());
    const batchLabel = String(item && item.batchLabel || "").toLowerCase();
    const isImmediate = enrollmentMode === "immediate" || batchLabel.indexOf("immediate access") !== -1;
    function passedLabel() {
      if (hasActiveAccess && startDate && startDate.getTime() <= now.getTime()) {
        return {
          label: "Batch access valid",
          css: "bg-emerald-100 text-emerald-700",
        };
      }
      return {
        label: "Batch already passed",
        css: "bg-rose-100 text-rose-700",
      };
    }
    if (!startDate) {
      if (isImmediate) {
        return hasActiveAccess
          ? {
              label: "Immediate access active",
              css: "bg-emerald-100 text-emerald-700",
            }
          : {
              label: "Access window ended",
              css: "bg-rose-100 text-rose-700",
            };
      }
      if (source === "school" && hasActiveAccess) {
        return {
          label: "Access active now",
          css: "bg-emerald-100 text-emerald-700",
        };
      }
      if (batchStatus === "closed") {
        return passedLabel();
      }
      if (durationDays > 0 && paidOrSubmittedAt) {
        const inferredEnd = new Date(paidOrSubmittedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
        if (now.getTime() >= inferredEnd.getTime()) {
          return passedLabel();
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
        return passedLabel();
      }
      return {
        label: `In progress (ends ${formatDateShort(endDate)})`,
        css: "bg-emerald-100 text-emerald-700",
      };
    }

    if (batchStatus === "closed") {
      return passedLabel();
    }

    return {
      label: `Started ${formatDateShort(startDate)}`,
      css: "bg-emerald-100 text-emerald-700",
    };
  }

  async function submitSchoolWebsite(courseSlug, websiteUrl) {
    const res = await fetch("/.netlify/functions/school-student-website-submit", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        course_slug: String(courseSlug || "").trim().toLowerCase(),
        website_url: String(websiteUrl || "").trim(),
      }),
    });
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not submit website link.");
    }
    return json;
  }

  async function submitCertificateProof(courseSlug, websiteUrl) {
    const res = await fetch("/.netlify/functions/user-certificate-proof-submit", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        course_slug: String(courseSlug || "").trim().toLowerCase(),
        website_url: String(websiteUrl || "").trim(),
      }),
    });
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not submit certificate proof.");
    }
    return json;
  }

  function renderPurchasedCourses(items, account) {
      const certificateNameNeedsConfirmation = !!(account && account.certificateNameNeedsConfirmation);
      const ownedSlugs = items.map(function (item) {
        return normalizeSlug(item.courseSlug);
      });
      if (metaEl) {
        const who = account && account.email ? ` for ${account.email}` : "";
        const note = certificateNameNeedsConfirmation
          ? " Confirm your profile name in Dashboard Profile to enable certificate issuance."
          : "";
        metaEl.textContent = `Showing ${items.length} paid course(s)${who}.${note}`;
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
            const accessExpiresAt = item.accessExpiresAt ? new Date(item.accessExpiresAt).toLocaleString() : "";
            const statusLabel = isPending ? "Pending verification" : "Paid";
            const statusBadge = isPending
              ? '<span class="status-pill status-pending_verification">Pending verification</span>'
              : '<span class="status-pill status-approved">Paid</span>';
            const theme = themeForSlug(item.courseSlug);
            const timing = batchTimingMeta(item);
            const resumeLessonId = Number(item.resumeLessonId || 0);
            const resumeSource = String(item.resumeSource || "").toLowerCase();
            const hasResume = resumeSource === "last_watched" && Number.isFinite(resumeLessonId) && resumeLessonId > 0;
            const resumeLabel = hasResume ? "Resume where you stopped" : "Open Course Player";
            const resumeDetail = hasResume && item.lastActivityAt
              ? `Last watched: ${escapeHtml(new Date(item.lastActivityAt).toLocaleString())}`
              : "";
            const isSchool = String(item.source || "").toLowerCase() === "school";
            const websiteSubmittedAt = item.schoolWebsiteSubmittedAt
              ? new Date(item.schoolWebsiteSubmittedAt).toLocaleString()
              : "";
            const certificateIssuedAt = item.schoolCertificateIssuedAt
              ? new Date(item.schoolCertificateIssuedAt).toLocaleString()
              : "";
            const schoolCertificateUrl = String(item.schoolCertificateUrl || "").trim();
            const completionPercent = Number(item.individualCompletionPercent || 0);
            const completedLessons = Number(item.individualCompletedLessons || 0);
            const totalLessons = Number(item.individualTotalLessons || 0);
            const individualCertificateIssuedAt = item.individualCertificateIssuedAt
              ? new Date(item.individualCertificateIssuedAt).toLocaleString()
              : "";
            const individualCertificateUrl = String(item.individualCertificateUrl || "").trim();
            const certificateProofRequired = !!item.certificateProofRequired;
            const certificateProofStatus = String(item.certificateProofStatus || "missing").toLowerCase();
            const certificateProofSubmittedAt = item.certificateProofSubmittedAt
              ? new Date(item.certificateProofSubmittedAt).toLocaleString()
              : "";
            const certificateProofLink = String(item.certificateProofLink || "").trim();
            const proofSubmissionUnlocked = completionPercent >= 100;
            const proofNameConfirmed = !certificateNameNeedsConfirmation;
            const needsWebsiteProof = !!certificateProofRequired;
            const proofSubmitEnabled = needsWebsiteProof && proofSubmissionUnlocked && proofNameConfirmed && certificateProofStatus !== "approved" && certificateProofStatus !== "pending";
            const certificateProofBadge = certificateProofStatus === "approved"
              ? '<span data-certificate-proof-badge="' + escapeHtml(item.courseSlug) + '" class="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Proof approved</span>'
              : certificateProofStatus === "pending"
                ? '<span data-certificate-proof-badge="' + escapeHtml(item.courseSlug) + '" class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Proof pending review</span>'
                : certificateProofStatus === "rejected"
                  ? '<span data-certificate-proof-badge="' + escapeHtml(item.courseSlug) + '" class="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">Proof rejected</span>'
                  : '<span data-certificate-proof-badge="' + escapeHtml(item.courseSlug) + '" class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">Proof missing</span>';
            const certificateBlock = [
                  '<div class="mt-3 rounded-xl border border-gray-200 bg-white/70 p-3">',
                  '<div class="flex flex-wrap items-center gap-2">',
                  '<p class="text-xs font-semibold uppercase tracking-wide text-gray-600">Learning Support</p>',
                  !isSchool && needsWebsiteProof ? certificateProofBadge : "",
                  "</div>",
                  `<p class="mt-1 text-xs text-gray-600">${
                    !isSchool && needsWebsiteProof
                      ? "Complete all lessons and submit your website link to unlock certificate."
                      : "Complete all lessons to unlock certificate."
                  } Progress: ${escapeHtml(String(completedLessons))}/${escapeHtml(String(totalLessons))} (${escapeHtml(String(completionPercent))}%).</p>`,
                  (!isSchool && needsWebsiteProof) ? `<div class="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input type="url" ${isSchool ? `data-school-website-input="${escapeHtml(item.courseSlug)}"` : `data-certificate-proof-input="${escapeHtml(item.courseSlug)}"`} class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm ${!isSchool && !proofSubmitEnabled ? "bg-gray-100 text-gray-500" : ""}" placeholder="https://yourwebsite.com" value="${escapeHtml(isSchool ? (item.schoolWebsiteUrl || "") : certificateProofLink)}" ${!isSchool && !proofSubmitEnabled ? "disabled" : ""} />
                        <button type="button" ${isSchool ? `data-submit-school-website="${escapeHtml(item.courseSlug)}"` : `data-submit-certificate-proof="${escapeHtml(item.courseSlug)}" data-certificate-proof-enabled="${proofSubmitEnabled ? "1" : "0"}"`} class="inline-flex w-full items-center justify-center rounded-lg bg-brand-700 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[128px] sm:flex-none" ${!isSchool && !proofSubmitEnabled ? "disabled" : ""}>Submit Proof</button>
                      </div>`
                  : ""
                  ,
                  isSchool
                    ? `<p data-school-website-status="${escapeHtml(item.courseSlug)}" class="mt-2 text-xs ${websiteSubmittedAt ? "text-emerald-700" : "text-gray-500"}">${
                      websiteSubmittedAt
                        ? "Submitted: " + escapeHtml(websiteSubmittedAt)
                        : "No proof submitted yet."
                    }</p>`
                    : (needsWebsiteProof ? `<p data-certificate-proof-status="${escapeHtml(item.courseSlug)}" class="mt-2 text-xs ${
                      certificateProofStatus === "approved"
                        ? "text-emerald-700"
                        : certificateProofStatus === "pending"
                          ? "text-amber-700"
                          : certificateProofStatus === "rejected"
                            ? "text-rose-700"
                            : "text-gray-500"
                    }">${
                      !proofSubmissionUnlocked
                        ? "Finish all lessons to enable proof submission."
                        : !proofNameConfirmed
                          ? "Confirm your profile name in Dashboard Profile to enable certificate issuance."
                        : certificateProofStatus === "approved"
                          ? "Approved" + (certificateProofSubmittedAt ? ": " + escapeHtml(certificateProofSubmittedAt) : "")
                          : certificateProofStatus === "pending"
                            ? "Submitted for admin review" + (certificateProofSubmittedAt ? ": " + escapeHtml(certificateProofSubmittedAt) : "")
                            : certificateProofStatus === "rejected"
                              ? "Rejected. Submit an improved website proof link."
                              : "No proof submitted yet."
                    }</p>` : ""),
                  (isSchool ? schoolCertificateUrl : individualCertificateUrl)
                    ? [
                        `<a href="${escapeHtml(isSchool ? schoolCertificateUrl : individualCertificateUrl)}" target="_blank" rel="noopener noreferrer" class="mt-1 inline-flex items-center justify-center rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600">Download Certificate</a>`,
                        (isSchool ? certificateIssuedAt : individualCertificateIssuedAt)
                          ? `<p class="mt-1 text-xs text-emerald-700">Issued: ${escapeHtml(isSchool ? certificateIssuedAt : individualCertificateIssuedAt)}</p>`
                          : "",
                      ].join("")
                    : isPending
                      ? '<p class="mt-1 text-xs text-gray-600">Certificate becomes available after payment verification and full lesson completion.</p>'
                    : !isSchool && needsWebsiteProof && completionPercent >= 100 && certificateProofStatus === "rejected"
                      ? '<p class="mt-1 text-xs text-rose-700">Certificate is locked. Your proof link was rejected, submit an improved website link.</p>'
                    : !isSchool && needsWebsiteProof && completionPercent >= 100 && certificateNameNeedsConfirmation
                      ? '<p class="mt-1 text-xs text-amber-700">Certificate is ready but paused. Confirm your profile name in Dashboard Profile to issue it.</p>'
                    : !isSchool && needsWebsiteProof && completionPercent >= 100 && certificateProofStatus !== "pending" && certificateProofStatus !== "approved"
                      ? '<p class="mt-1 text-xs text-gray-600">Certificate is locked. Submit your website link to unlock it.</p>'
                    : completionPercent >= 100 && certificateNameNeedsConfirmation
                      ? '<p class="mt-1 text-xs text-amber-700">Certificate is ready but paused. Confirm your profile name in Dashboard Profile to issue it.</p>'
                    : !isSchool && needsWebsiteProof
                      ? ""
                    : "",
                  "</div>",
                ].join("");
            return [
              `<article class="rounded-2xl p-5 shadow-sm ring-1 ${theme.card}">`,
              '<div class="flex items-start justify-between gap-3">',
              `<div><p class="text-sm font-bold text-gray-900">${escapeHtml(item.courseName || item.courseSlug)}</p>`,
              `<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                <span>Batch: ${escapeHtml(item.batchLabel || item.batchKey || "N/A")}</span>
                ${statusBadge}
                <span>${escapeHtml(statusLabel)}: ${escapeHtml(isPending ? submittedAt : paidAt)}</span>
                <span>Access Expires: ${escapeHtml(accessExpiresAt || "Not set")}</span>
              </div></div>`,
              `<span class="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${theme.badge}">Enrolled</span>`,
              "</div>",
              `<div class="mt-3"><span class="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${timing.css}">${escapeHtml(
                timing.label
              )}</span></div>`,
              certificateBlock,
              resumeDetail ? `<p class="mt-2 text-xs text-gray-600">${resumeDetail}</p>` : "",
              '<div class="mt-4 flex flex-wrap gap-2">',
              `<a class="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${theme.button}" href="${escapeHtml(
                coursePlayerUrl(item.courseSlug, hasResume ? resumeLessonId : 0)
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
      renderPurchasedCourses(items, json.account || null);
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

  if (listEl) {
    listEl.addEventListener("click", function (event) {
      const target = event.target && event.target.closest ? event.target.closest("[data-submit-school-website]") : null;
      const proofTarget = event.target && event.target.closest ? event.target.closest("[data-submit-certificate-proof]") : null;
      if (!target && !proofTarget) return;
      if (proofTarget) {
        const enabled = String(proofTarget.getAttribute("data-certificate-proof-enabled") || "0") === "1";
        const courseSlug = String(proofTarget.getAttribute("data-submit-certificate-proof") || "").trim().toLowerCase();
        if (!courseSlug) return;
        const input = listEl.querySelector('[data-certificate-proof-input="' + courseSlug + '"]');
        const status = listEl.querySelector('[data-certificate-proof-status="' + courseSlug + '"]');
        const badge = listEl.querySelector('[data-certificate-proof-badge="' + courseSlug + '"]');
        if (!enabled) {
          if (status) {
            status.textContent = "Finish all lessons before submitting proof.";
            status.className = "mt-2 text-xs text-gray-600";
          }
          return;
        }
        const websiteUrl = String(input && input.value || "").trim();
        if (!websiteUrl) {
          if (status) {
            status.textContent = "Enter website URL.";
            status.className = "mt-2 text-xs text-red-600";
          }
          return;
        }
        proofTarget.disabled = true;
        const proofPrev = proofTarget.textContent;
        proofTarget.textContent = "Submitting...";
        submitCertificateProof(courseSlug, websiteUrl)
          .then(function (json) {
            if (status) {
              const ts = json && json.proof && json.proof.submitted_at ? new Date(json.proof.submitted_at).toLocaleString() : "Just now";
              status.textContent = "Submitted for review: " + ts;
              status.className = "mt-2 text-xs text-amber-700";
            }
            if (badge) {
              badge.textContent = "Proof pending review";
              badge.className = "inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700";
            }
            load().catch(function () {
              return null;
            });
          })
          .catch(function (error) {
            if (status) {
              status.textContent = error.message || "Could not submit proof link.";
              status.className = "mt-2 text-xs text-red-600";
            }
          })
          .finally(function () {
            proofTarget.disabled = false;
            proofTarget.textContent = proofPrev || "Submit Proof";
          });
        return;
      }
      if (!target) return;
      const courseSlug = String(target.getAttribute("data-submit-school-website") || "").trim().toLowerCase();
      if (!courseSlug) return;
      const input = listEl.querySelector('[data-school-website-input="' + courseSlug + '"]');
      const status = listEl.querySelector('[data-school-website-status="' + courseSlug + '"]');
      const websiteUrl = String(input && input.value || "").trim();
      if (!websiteUrl) {
        if (status) {
          status.textContent = "Enter website URL.";
          status.className = "mt-2 text-xs text-red-600";
        }
        return;
      }
      target.disabled = true;
      const prev = target.textContent;
      target.textContent = "Submitting...";
      submitSchoolWebsite(courseSlug, websiteUrl)
        .then(function (json) {
          if (status) {
            const ts = json && json.submitted_at ? new Date(json.submitted_at).toLocaleString() : "Just now";
            status.textContent = "Submitted: " + ts;
            status.className = "mt-2 text-xs text-emerald-700";
          }
        })
        .catch(function (error) {
          if (status) {
            status.textContent = error.message || "Could not submit website link.";
            status.className = "mt-2 text-xs text-red-600";
          }
        })
        .finally(function () {
          target.disabled = false;
          target.textContent = prev || "Submit Link";
        });
    });
  }

  consumePurchaseWelcomeFromQuery();
  renderPurchaseWelcomeNotice();
  loadCourseCatalog()
    .catch(function () {
      COURSE_CATALOG = DEFAULT_COURSE_CATALOG.slice();
      return null;
    })
    .then(function () {
      return load();
    });
})();
