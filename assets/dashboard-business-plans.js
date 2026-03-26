(function () {
  var listEl = document.getElementById("plansList");
  var metaEl = document.getElementById("plansMeta");

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function downloadDocx(item) {
    if (!item || !item.planUuid) throw new Error("Plan is unavailable.");
    var res = await fetch("/.netlify/functions/business-plan-export-user", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planUuid: item.planUuid }),
    });
    if (!res.ok) throw new Error("Could not download DOCX");

    var fileName = String(item.businessName || "business-plan").trim() || "business-plan";
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = fileName + ".docx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function attachDownloadHandlers(items) {
    var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-plan-idx]"));
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-plan-idx"));
        if (!Number.isFinite(idx) || !items[idx]) return;
        btn.disabled = true;
        downloadDocx(items[idx])
          .catch(function (error) {
            alert(error.message || "Could not download document.");
          })
          .finally(function () {
            btn.disabled = false;
          });
      });
    });
  }

  async function load() {
    try {
      var res = await fetch("/.netlify/functions/user-business-plans", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      var json = await res.json().catch(function () {
        return null;
      });

      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not load business plans");
      }

      var items = Array.isArray(json.items) ? json.items : [];
      if (metaEl) {
        var who = json.account && json.account.email ? " for " + json.account.email : "";
        metaEl.textContent = "Showing " + items.length + " generated business plan(s)" + who + ".";
      }

      if (!items.length) {
        if (listEl) {
          listEl.innerHTML = [
            '<div class="rounded-2xl border border-gray-200 bg-gray-50 p-6">',
            '<p class="text-base font-semibold text-gray-900">No business plan yet.</p>',
            '<p class="mt-2 text-sm text-gray-600">When your payment is completed and generation succeeds, your plan will appear here.</p>',
            '<a class="mt-4 inline-flex items-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-500" href="/services/business-plan/">Generate a Business Plan</a>',
            '</div>',
          ].join("");
        }
        return;
      }

      if (listEl) {
        listEl.innerHTML = items
          .map(function (item, idx) {
            var when = item.generatedAt ? new Date(item.generatedAt).toLocaleString() : "Unknown";
            var status = String(item.verificationStatus || "awaiting_verification");
            var verified = String(status).toLowerCase() === "verified";
            var statusLabel = verified ? "Verified" : "Awaiting Verification";
            return [
              '<article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">',
              '<p class="text-sm font-bold text-gray-900">' + escapeHtml(item.businessName || "Business Plan") + '</p>',
              '<p class="mt-1 text-xs text-gray-500">Purpose: ' + escapeHtml(item.purpose || "N/A") + ' • Generated: ' + escapeHtml(when) + '</p>',
              '<p class="mt-2 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ' + (verified ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200") + '">' + escapeHtml(statusLabel) + "</p>",
              '<div class="mt-3 flex flex-wrap gap-2">',
              '<button type="button" data-plan-idx="' + idx + '" class="inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50" ' + (verified ? "" : "disabled") + ">" + (verified ? "Download DOCX" : "Download Locked") + "</button>",
              '</div>',
              '</article>',
            ].join("");
          })
          .join("");
      }

      attachDownloadHandlers(items);
    } catch (error) {
      if (metaEl) metaEl.textContent = "Could not load business plans.";
      if (listEl) {
        listEl.innerHTML = '<p class="text-sm text-red-600">' + escapeHtml(error.message || "Request failed") + '</p>';
      }
    }
  }

  load();
})();
