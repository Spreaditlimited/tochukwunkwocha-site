(function () {
  const listEl = document.getElementById("coursesList");
  const metaEl = document.getElementById("coursesMeta");

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function courseUrl(slug) {
    const s = String(slug || "").trim().toLowerCase();
    if (!s) return "/courses/";
    return `/courses/${encodeURIComponent(s)}/`;
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
            return [
              '<article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">',
              `<p class="text-sm font-bold text-gray-900">${escapeHtml(item.courseName || item.courseSlug)}</p>`,
              `<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>Batch: ${escapeHtml(item.batchLabel || item.batchKey || "N/A")}</span>
                ${statusBadge}
                <span>${escapeHtml(statusLabel)}: ${escapeHtml(isPending ? submittedAt : paidAt)}</span>
              </div>`,
              `<a class="mt-3 inline-flex items-center text-sm font-semibold text-brand-600 hover:text-brand-500" href="${escapeHtml(
                courseUrl(item.courseSlug)
              )}">Open Course Page</a>`,
              "</article>",
            ].join("");
          })
          .join("");
      }
    } catch (error) {
      if (metaEl) metaEl.textContent = "Could not load courses.";
      if (listEl) {
        listEl.innerHTML = `<p class="text-sm text-red-600">${escapeHtml(error.message || "Request failed")}</p>`;
      }
    }
  }

  load();
})();
