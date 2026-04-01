(function () {
  const listEl = document.getElementById("projectsList");
  const metaEl = document.getElementById("projectsMeta");

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function load() {
    try {
      const res = await fetch("/.netlify/functions/user-leadpage-projects", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const json = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not load projects");
      }

      const items = Array.isArray(json.items) ? json.items : [];
      if (metaEl) {
        const who = json.account && json.account.email ? ` for ${json.account.email}` : "";
        metaEl.textContent = `Showing ${items.length} project(s)${who}.`;
      }

      if (!items.length) {
        if (listEl) {
          listEl.innerHTML = [
            '<div class="rounded-2xl border border-gray-200 bg-gray-50 p-6">',
            '<p class="text-base font-semibold text-gray-900">You do not have a project yet.</p>',
            '<p class="mt-2 text-sm text-gray-600">Start a new lead capture project to continue.</p>',
            '<a class="mt-4 inline-flex items-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-500" href="/dashboard/domains/">Open Domains</a>',
            "</div>",
          ].join("");
        }
        return;
      }

      if (listEl) {
        listEl.innerHTML = items
          .map(function (item) {
            return [
              '<article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">',
              `<p class="text-sm font-bold text-gray-900">${escapeHtml(item.businessName || item.jobUuid)}</p>`,
              `<p class="mt-1 text-xs text-gray-500">Payment: ${escapeHtml(item.paymentStatus)} • Build: ${escapeHtml(
                item.status
              )} • Publish: ${escapeHtml(item.publishStatus)}</p>`,
              item.dashboardUrl
                ? `<a class="mt-3 inline-flex items-center text-sm font-semibold text-brand-600 hover:text-brand-500" href="${escapeHtml(
                    item.dashboardUrl
                  )}">Open Project Dashboard</a>`
                : '<p class="mt-3 text-xs text-gray-500">Dashboard link unavailable</p>',
              "</article>",
            ].join("");
          })
          .join("");
      }
    } catch (error) {
      if (metaEl) metaEl.textContent = "Could not load projects.";
      if (listEl) {
        listEl.innerHTML = `<p class="text-sm text-red-600">${escapeHtml(error.message || "Request failed")}</p>`;
      }
    }
  }

  load();
})();

