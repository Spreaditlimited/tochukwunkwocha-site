(function () {
  const groupsEl = document.getElementById("settingsGroups");
  const messageEl = document.getElementById("settingsMessage");
  const auditRowsEl = document.getElementById("settingsAuditRows");
  const saveTopBtn = document.getElementById("settingsSaveBtnTop");
  const saveBottomBtn = document.getElementById("settingsSaveBtnBottom");
  const pricingSaveBtn = document.getElementById("pricingControlsSaveBtn");

  const PINNED_PRICING_KEYS = [
    "SITE_VAT_PERCENT",
    "DOMAIN_VAT_PERCENT",
    "SCHOOLS_VAT_PERCENT",
    "SCHOOLS_MIN_SEATS",
    "SCHOOLS_PRICE_PER_STUDENT_NGN_MINOR",
  ];
  const HIDDEN_CATEGORIES = new Set([
    "Business Plan",
    "Registrar (Namecheap)",
    "Publish Limits",
  ]);
  const HIDDEN_KEYS = new Set([
    "FLODESK_API_KEY",
    "FLODESK_ENROL_SEGMENT_ID",
    "FLODESK_ENROL_PROD_SEGMENT_ID",
    "FLODESK_PRE_ENROL_SEGMENT_ID",
    "AFFILIATE_SCHOOL_PAYMENT_COMMISSION_TYPE",
    "AFFILIATE_SCHOOL_PAYMENT_COMMISSION_VALUE",
    "AFFILIATE_SCHOOL_PAYMENT_COMMISSION_CURRENCY",
    "AFFILIATE_SCHOOL_ONBOARDING_COMMISSION_TYPE",
    "AFFILIATE_SCHOOL_ONBOARDING_COMMISSION_VALUE",
    "AFFILIATE_SCHOOL_ONBOARDING_COMMISSION_CURRENCY",
  ]);
  const HIDDEN_KEY_PREFIXES = [
    "LEADPAGE_",
    "BREVO_LEADPAGE_",
    "NETLIFY_",
    "GEMINI_",
    "GOOGLE_AI_",
    "OPENAI_",
    "AFFILIATE_SCHOOL_PAYMENT_",
    "AFFILIATE_SCHOOL_ONBOARDING_",
  ];
  const LEADPAGE_VISIBLE_KEYS = new Set([
    "LEADPAGE_DOMAIN_PROVIDER",
  ]);

  let items = [];
  let auditItems = [];

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setMessage(text, type) {
    if (!messageEl) return;
    const hasText = Boolean(text);
    messageEl.classList.toggle("hidden", !hasText);
    messageEl.textContent = String(text || "");
    messageEl.classList.remove("border-emerald-200", "bg-emerald-50", "text-emerald-800", "border-rose-200", "bg-rose-50", "text-rose-800");
    if (!hasText) return;
    if (type === "error") {
      messageEl.classList.add("border-rose-200", "bg-rose-50", "text-rose-800");
      return;
    }
    messageEl.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-800");
  }

  function redirectToInternalSignIn() {
    const next = `${window.location.pathname}${window.location.search || ""}`;
    window.location.href = `/internal/?next=${encodeURIComponent(next)}`;
  }

  function sourceBadge(source) {
    const s = String(source || "empty");
    if (s === "override") return '<span class="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">override</span>';
    if (s === "env") return '<span class="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-200">env</span>';
    return '<span class="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 ring-1 ring-gray-200">empty</span>';
  }

  function shouldHideSetting(item) {
    const category = String(item && item.category || "");
    const key = String(item && item.key || "");
    if (!key) return true;
    if (HIDDEN_CATEGORIES.has(category)) return true;
    if (HIDDEN_KEYS.has(key)) return true;
    for (let i = 0; i < HIDDEN_KEY_PREFIXES.length; i += 1) {
      const prefix = HIDDEN_KEY_PREFIXES[i];
      if (key.indexOf(prefix) === 0 && !LEADPAGE_VISIBLE_KEYS.has(key)) {
        return true;
      }
    }
    return false;
  }

  function restartBadge(restartSensitive) {
    if (!restartSensitive) return "";
    return '<span class="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">restart-sensitive</span>';
  }

  function renderItems() {
    if (!groupsEl) return;
    const map = new Map();
    for (const item of items) {
      if (shouldHideSetting(item)) continue;
      const cat = String(item.category || "Other");
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(item);
    }

    const html = Array.from(map.entries())
      .map(function ([category, entries]) {
        const rows = entries
          .map(function (item) {
            const key = String(item.key || "");
            const inputType = item.secret ? "password" : "text";
            return `
              <div class="rounded-xl border border-gray-200 bg-white p-4">
                <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <label class="min-w-0 flex-1 break-all text-xs font-bold uppercase tracking-wider text-gray-500">${escapeHtml(key)}</label>
                  <div class="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    ${restartBadge(item.restartSensitive)}
                    ${sourceBadge(item.source)}
                  </div>
                </div>
                <input
                  type="${inputType}"
                  data-key="${escapeHtml(key)}"
                  value="${escapeHtml(item.value || "")}"
                  class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                  placeholder="${item.secret ? "Secret value" : "Value"}"
                />
              </div>
            `;
          })
          .join("");

        return `
          <section class="rounded-2xl border border-gray-200 bg-white p-5">
            <h3 class="mb-4 text-lg font-heading font-extrabold text-gray-900">${escapeHtml(category)}</h3>
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              ${rows}
            </div>
          </section>
        `;
      })
      .join("");

    groupsEl.innerHTML = html || '<p class="text-sm text-gray-600">No settings found.</p>';
  }

  function renderAudit() {
    if (!auditRowsEl) return;
    if (!Array.isArray(auditItems) || !auditItems.length) {
      auditRowsEl.innerHTML = '<tr><td colspan="4" class="px-3 py-5 text-sm text-gray-500">No audit entries yet.</td></tr>';
      return;
    }

    auditRowsEl.innerHTML = auditItems
      .map(function (item) {
        const when = item && item.created_at ? new Date(item.created_at).toLocaleString() : "-";
        const key = String((item && item.setting_key) || "-");
        const action = String((item && item.action_type) || "-");
        const by = String((item && item.updated_by) || "admin");
        return `
          <tr class="border-b border-gray-50">
            <td class="px-3 py-2 text-sm text-gray-600">${escapeHtml(when)}</td>
            <td class="px-3 py-2 text-sm font-semibold text-gray-900">${escapeHtml(key)}</td>
            <td class="px-3 py-2 text-sm text-gray-700">${escapeHtml(action)}</td>
            <td class="px-3 py-2 text-sm text-gray-700">${escapeHtml(by)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderPinnedPricing() {
    const byKey = new Map(
      (items || []).map(function (item) {
        return [String(item.key || ""), String(item.value || "")];
      })
    );
    Array.from(document.querySelectorAll("[data-pricing-key]")).forEach(function (input) {
      const key = String(input.getAttribute("data-pricing-key") || "");
      if (!key || PINNED_PRICING_KEYS.indexOf(key) === -1) return;
      if (Object.prototype.hasOwnProperty.call(input, "value")) {
        input.value = byKey.get(key) || "";
      }
    });
  }

  async function loadSettings() {
    setMessage("Loading settings...", "ok");
    const res = await fetch("/.netlify/functions/admin-tochukwu-settings-get", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (res.status === 401) {
      redirectToInternalSignIn();
      return;
    }
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load settings");
    }
    items = Array.isArray(json.items) ? json.items : [];
    auditItems = Array.isArray(json.audit) ? json.audit : [];
    renderItems();
    renderPinnedPricing();
    renderAudit();
    setMessage("Settings loaded.", "ok");
  }

  function collectPayload() {
    const merged = new Map();
    const mainInputs = Array.from(document.querySelectorAll("input[data-key]"));
    mainInputs.forEach(function (input) {
      const key = String(input.getAttribute("data-key") || "");
      if (!key) return;
      merged.set(key, String(input.value || "").trim());
    });
    const pricingInputs = Array.from(document.querySelectorAll("[data-pricing-key]"));
    pricingInputs.forEach(function (input) {
      const key = String(input.getAttribute("data-pricing-key") || "");
      if (!key || PINNED_PRICING_KEYS.indexOf(key) === -1) return;
      merged.set(key, String(input.value || "").trim());
    });
    return Array.from(merged.entries()).map(function (entry) {
      return { key: entry[0], value: entry[1] };
    });
  }

  function setSavingState(saving) {
    const textTop = saving ? "Saving..." : "Save All";
    const textBottom = saving ? "Saving..." : "Save Settings";
    if (saveTopBtn) {
      saveTopBtn.disabled = saving;
      saveTopBtn.textContent = textTop;
    }
    if (saveBottomBtn) {
      saveBottomBtn.disabled = saving;
      saveBottomBtn.textContent = textBottom;
    }
  }

  async function saveSettings() {
    setSavingState(true);
    setMessage("", "");
    try {
      const payload = collectPayload();
      const res = await fetch("/.netlify/functions/admin-tochukwu-settings-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ items: payload }),
      });
      if (res.status === 401) {
        redirectToInternalSignIn();
        return;
      }
      const json = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not save settings");
      }
      items = Array.isArray(json.items) ? json.items : items;
      auditItems = Array.isArray(json.audit) ? json.audit : auditItems;
      renderItems();
      renderPinnedPricing();
      renderAudit();
      setMessage("Settings saved successfully.", "ok");
    } catch (error) {
      setMessage(error.message || "Could not save settings", "error");
    } finally {
      setSavingState(false);
    }
  }

  if (saveTopBtn) {
    saveTopBtn.addEventListener("click", function () {
      saveSettings();
    });
  }
  if (saveBottomBtn) {
    saveBottomBtn.addEventListener("click", function () {
      saveSettings();
    });
  }
  if (pricingSaveBtn) {
    pricingSaveBtn.addEventListener("click", function () {
      saveSettings();
    });
  }

  loadSettings().catch(function (error) {
    setMessage(error.message || "Could not load settings", "error");
  });
})();
