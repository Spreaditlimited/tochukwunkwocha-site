(function () {
  const groupsEl = document.getElementById("settingsGroups");
  const messageEl = document.getElementById("settingsMessage");
  const auditRowsEl = document.getElementById("settingsAuditRows");
  const saveTopBtn = document.getElementById("settingsSaveBtnTop");
  const saveBottomBtn = document.getElementById("settingsSaveBtnBottom");
  const adminAccountsMessageEl = document.getElementById("adminAccountsMessage");
  const adminAccountCreateForm = document.getElementById("adminAccountCreateForm");
  const adminAccountCreateBtn = document.getElementById("adminAccountCreateBtn");
  const adminAccountGeneratePasswordBtn = document.getElementById("adminAccountGeneratePasswordBtn");
  const adminAccountFullName = document.getElementById("adminAccountFullName");
  const adminAccountEmail = document.getElementById("adminAccountEmail");
  const adminAccountPassword = document.getElementById("adminAccountPassword");
  const adminPagePermissionsWrap = document.getElementById("adminPagePermissionsWrap");
  const adminAccountsRows = document.getElementById("adminAccountsRows");
  const adminResetPasswordModal = document.getElementById("adminResetPasswordModal");
  const adminResetPasswordBackdrop = document.getElementById("adminResetPasswordBackdrop");
  const adminResetPasswordCloseBtn = document.getElementById("adminResetPasswordCloseBtn");
  const adminResetPasswordCancelBtn = document.getElementById("adminResetPasswordCancelBtn");
  const adminResetPasswordTitle = document.getElementById("adminResetPasswordTitle");
  const adminResetPasswordDesc = document.getElementById("adminResetPasswordDesc");
  const adminResetPasswordForm = document.getElementById("adminResetPasswordForm");
  const adminResetPasswordInput = document.getElementById("adminResetPasswordInput");
  const adminResetPasswordGenerateBtn = document.getElementById("adminResetPasswordGenerateBtn");
  const adminResetPasswordSubmitBtn = document.getElementById("adminResetPasswordSubmitBtn");
  const adminResetPasswordError = document.getElementById("adminResetPasswordError");

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
  let adminPageOptions = [];
  let adminAccounts = [];
  let pendingResetAdmin = null;
  const REQUIRED_ADMIN_PAGE_OPTIONS = [
    "/internal/school-scorecards/",
  ];

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

  function setAdminAccountsMessage(text, type) {
    if (!adminAccountsMessageEl) return;
    const hasText = Boolean(text);
    adminAccountsMessageEl.classList.toggle("hidden", !hasText);
    adminAccountsMessageEl.textContent = String(text || "");
    adminAccountsMessageEl.classList.remove("border-emerald-200", "bg-emerald-50", "text-emerald-800", "border-rose-200", "bg-rose-50", "text-rose-800");
    if (!hasText) return;
    if (type === "error") {
      adminAccountsMessageEl.classList.add("border-rose-200", "bg-rose-50", "text-rose-800");
      return;
    }
    adminAccountsMessageEl.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-800");
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

  function pageLabel(path) {
    const map = {
      "/internal/": "Dashboard",
      "/internal/manual-payments/": "Enrollments",
      "/internal/installments/": "Installments",
      "/internal/domain-management/": "Domain Management",
      "/internal/video-library/": "Video Library",
      "/internal/learning-progress/": "Learning Progress",
      "/internal/learning-support/": "Learning Support",
      "/internal/schools/": "Schools",
      "/internal/school-calls/": "School Calls",
      "/internal/school-scorecards/": "School Scorecards",
      "/internal/settings/": "Settings",
    };
    return map[String(path || "").trim()] || String(path || "");
  }

  function renderPermissionCheckboxes(containerEl, selected, namePrefix) {
    if (!containerEl) return;
    const set = new Set(Array.isArray(selected) ? selected : []);
    containerEl.innerHTML = (adminPageOptions || []).map(function (path) {
      const p = String(path || "");
      const id = (namePrefix || "perm") + "-" + p.replace(/[^a-z0-9]+/gi, "-");
      return [
        '<label class="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">',
        '<input type="checkbox" data-page-perm value="' + escapeHtml(p) + '" id="' + escapeHtml(id) + '" class="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" ' + (set.has(p) ? "checked" : "") + " />",
        '<span>' + escapeHtml(pageLabel(p)) + "</span>",
        "</label>",
      ].join("");
    }).join("");
  }

  function readPermissionsFrom(containerEl) {
    if (!containerEl) return [];
    return Array.from(containerEl.querySelectorAll("input[data-page-perm]:checked"))
      .map(function (x) { return String(x.value || "").trim(); })
      .filter(Boolean);
  }

  function withRequiredAdminPageOptions(options) {
    const base = Array.isArray(options) ? options.slice() : [];
    const set = new Set(base.map(function (x) { return String(x || "").trim(); }).filter(Boolean));
    REQUIRED_ADMIN_PAGE_OPTIONS.forEach(function (path) {
      const p = String(path || "").trim();
      if (!p || set.has(p)) return;
      set.add(p);
      base.push(p);
    });
    return base;
  }

  function generateAdminPassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*_-+=";
    const length = 16;
    const bytes = [];
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const arr = new Uint8Array(length);
      window.crypto.getRandomValues(arr);
      for (let i = 0; i < arr.length; i += 1) bytes.push(arr[i]);
    } else {
      for (let i = 0; i < length; i += 1) {
        bytes.push(Math.floor(Math.random() * 256));
      }
    }
    let out = "";
    for (let i = 0; i < length; i += 1) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  }

  function openResetPasswordModal(account) {
    if (!adminResetPasswordModal || !adminResetPasswordInput) return;
    pendingResetAdmin = account || null;
    const name = String(account && (account.fullName || account.email) || "admin").trim();
    if (adminResetPasswordTitle) adminResetPasswordTitle.textContent = "Reset Admin Password";
    if (adminResetPasswordDesc) adminResetPasswordDesc.textContent = "Set a new password for " + name + ".";
    if (adminResetPasswordInput) {
      adminResetPasswordInput.value = "";
      adminResetPasswordInput.focus();
    }
    if (adminResetPasswordError) {
      adminResetPasswordError.textContent = "";
      adminResetPasswordError.classList.add("hidden");
    }
    if (adminResetPasswordSubmitBtn) {
      adminResetPasswordSubmitBtn.disabled = false;
      adminResetPasswordSubmitBtn.textContent = "Update Password";
    }
    adminResetPasswordModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeResetPasswordModal() {
    pendingResetAdmin = null;
    if (!adminResetPasswordModal) return;
    adminResetPasswordModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (adminResetPasswordError) {
      adminResetPasswordError.textContent = "";
      adminResetPasswordError.classList.add("hidden");
    }
    if (adminResetPasswordForm) adminResetPasswordForm.reset();
  }

  function setResetPasswordError(text) {
    if (!adminResetPasswordError) return;
    const msg = String(text || "").trim();
    adminResetPasswordError.textContent = msg;
    adminResetPasswordError.classList.toggle("hidden", !msg);
  }

  function renderAdminAccountsTable() {
    if (!adminAccountsRows) return;
    if (!Array.isArray(adminAccounts) || !adminAccounts.length) {
      adminAccountsRows.innerHTML = '<tr><td colspan="4" class="px-3 py-4 text-sm text-gray-500">No admin accounts yet.</td></tr>';
      return;
    }

    adminAccountsRows.innerHTML = adminAccounts.map(function (account) {
      const uuid = String(account.adminUuid || "").trim();
      const perms = Array.isArray(account.allowedPages) ? account.allowedPages : [];
      const permsHtml = (adminPageOptions || []).map(function (path) {
        const id = "rowperm-" + uuid + "-" + path.replace(/[^a-z0-9]+/gi, "-");
        return [
          '<label class="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 mr-2 mb-2">',
          '<input type="checkbox" value="' + escapeHtml(path) + '" data-admin-row-page="' + escapeHtml(path) + '" data-admin-row-uuid="' + escapeHtml(uuid) + '" id="' + escapeHtml(id) + '" class="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500" ' + (perms.indexOf(path) > -1 ? "checked" : "") + " />",
          '<span>' + escapeHtml(pageLabel(path)) + "</span>",
          "</label>",
        ].join("");
      }).join("");

      return [
        '<tr class="border-b border-gray-50 align-top">',
        '<td class="px-3 py-3 text-sm text-gray-800">',
        '<p class="font-semibold text-gray-900">' + escapeHtml(account.fullName || "-") + "</p>",
        '<p class="text-xs text-gray-500">' + escapeHtml(account.email || "-") + "</p>",
        '<p class="text-xs text-gray-400">Last login: ' + escapeHtml(account.lastLoginAt || "-") + "</p>",
        "</td>",
        '<td class="px-3 py-3 text-xs text-gray-700"><div class="flex flex-wrap">' + permsHtml + "</div></td>",
        '<td class="px-3 py-3 text-sm">',
        (account.isActive ? '<span class="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">active</span>' : '<span class="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">inactive</span>'),
        "</td>",
        '<td class="px-3 py-3 text-sm">',
        '<div class="flex w-full max-w-xs flex-col gap-2 sm:max-w-none sm:flex-row sm:flex-wrap">',
        '<button type="button" data-admin-save="' + escapeHtml(uuid) + '" class="inline-flex w-full sm:w-auto min-w-[9.5rem] items-center justify-center rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white hover:bg-brand-500">Save Permissions</button>',
        '<button type="button" data-admin-toggle="' + escapeHtml(uuid) + '" data-admin-next-active="' + (account.isActive ? "0" : "1") + '" class="inline-flex w-full sm:w-auto min-w-[8rem] items-center justify-center rounded-lg bg-white px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-gray-800 ring-1 ring-inset ring-gray-300 hover:bg-gray-50">' + (account.isActive ? "Deactivate" : "Activate") + "</button>",
        '<button type="button" data-admin-reset-pass="' + escapeHtml(uuid) + '" class="inline-flex w-full sm:w-auto min-w-[9rem] items-center justify-center rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-100">Reset Password</button>',
        "</div>",
        "</td>",
        "</tr>",
      ].join("");
    }).join("");

    Array.from(adminAccountsRows.querySelectorAll("button[data-admin-save]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        const uuid = String(btn.getAttribute("data-admin-save") || "").trim();
        const row = btn.closest("tr");
        const adminEmail = row ? String((row.querySelector("td p.text-xs.text-gray-500") || {}).textContent || "").trim() : "";
        const checks = Array.from(adminAccountsRows.querySelectorAll('input[data-admin-row-uuid=\"' + uuid + '\"]'));
        const selected = checks
          .filter(function (x) { return x.checked; })
          .map(function (x) {
            return String(x.value || x.getAttribute("data-admin-row-page") || "").trim();
          })
          .filter(Boolean);
        if (!selected.length) {
          setAdminAccountsMessage("Select at least one page permission before saving.", "error");
          return;
        }
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = "Saving...";
        updateAdminAccount(uuid, { allowedPages: selected }).catch(function (error) {
          const reason = error && error.message ? error.message : "Could not update admin account";
          setAdminAccountsMessage("Could not save permissions" + (adminEmail ? " for " + adminEmail : "") + ": " + reason, "error");
        }).finally(function () {
          btn.disabled = false;
          btn.textContent = originalText;
        });
      });
    });

    Array.from(adminAccountsRows.querySelectorAll("button[data-admin-toggle]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        const uuid = String(btn.getAttribute("data-admin-toggle") || "").trim();
        const nextActive = String(btn.getAttribute("data-admin-next-active") || "") === "1";
        updateAdminAccount(uuid, { isActive: nextActive }).catch(function (error) {
          setAdminAccountsMessage(error && error.message ? error.message : "Could not update admin account", "error");
        });
      });
    });

    Array.from(adminAccountsRows.querySelectorAll("button[data-admin-reset-pass]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        const uuid = String(btn.getAttribute("data-admin-reset-pass") || "").trim();
        const account = (adminAccounts || []).find(function (x) {
          return String(x && x.adminUuid || "").trim() === uuid;
        }) || { adminUuid: uuid };
        openResetPasswordModal(account);
      });
    });
  }

  async function loadAdminAccounts() {
    if (!adminAccountsRows) return;
    setAdminAccountsMessage("Loading admin accounts...", "ok");
    const res = await fetch("/.netlify/functions/admin-admin-accounts-list", {
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
      throw new Error((json && json.error) || "Could not load admin accounts");
    }
    adminPageOptions = withRequiredAdminPageOptions(Array.isArray(json.pageOptions) ? json.pageOptions : []);
    adminAccounts = Array.isArray(json.accounts) ? json.accounts : [];
    renderPermissionCheckboxes(adminPagePermissionsWrap, adminPageOptions, "new-admin-perm");
    renderAdminAccountsTable();
    setAdminAccountsMessage("Admin accounts loaded.", "ok");
  }

  async function createAdminAccount() {
    if (!adminAccountCreateForm) return;
    const fullName = String(adminAccountFullName && adminAccountFullName.value || "").trim();
    const email = String(adminAccountEmail && adminAccountEmail.value || "").trim().toLowerCase();
    const password = String(adminAccountPassword && adminAccountPassword.value || "");
    const allowedPages = readPermissionsFrom(adminPagePermissionsWrap);
    if (!fullName || !email || !password) throw new Error("Full name, email and password are required");
    if (password.length < 8) throw new Error("Password must be at least 8 characters");
    if (!allowedPages.length) throw new Error("Select at least one page permission");

    const res = await fetch("/.netlify/functions/admin-admin-accounts-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        fullName: fullName,
        email: email,
        password: password,
        allowedPages: allowedPages,
      }),
    });

    if (res.status === 401) {
      redirectToInternalSignIn();
      return;
    }
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not create admin account");
    }
    if (adminAccountCreateForm) adminAccountCreateForm.reset();
    renderPermissionCheckboxes(adminPagePermissionsWrap, adminPageOptions, "new-admin-perm");
    setAdminAccountsMessage("Admin account created.", "ok");
    await loadAdminAccounts();
  }

  async function updateAdminAccount(adminUuid, payload) {
    if (!adminUuid) return;
    if (payload && Object.prototype.hasOwnProperty.call(payload, "allowedPages")) {
      const selected = Array.isArray(payload.allowedPages) ? payload.allowedPages.filter(Boolean) : [];
      if (!selected.length) throw new Error("Select at least one page permission");
    }
    setAdminAccountsMessage("Saving admin account changes...", "ok");
    const res = await fetch("/.netlify/functions/admin-admin-accounts-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(Object.assign({ adminUuid: adminUuid }, payload || {})),
    });

    if (res.status === 401) {
      redirectToInternalSignIn();
      return;
    }
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error(((json && json.error) || "Could not update admin account") + " (HTTP " + String(res.status) + ")");
    }
    setAdminAccountsMessage("Admin account updated.", "ok");
    await loadAdminAccounts();
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
  if (adminAccountCreateForm) {
    adminAccountCreateForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (adminAccountCreateBtn) {
        adminAccountCreateBtn.disabled = true;
        adminAccountCreateBtn.textContent = "Creating...";
      }
      createAdminAccount()
        .catch(function (error) {
          setAdminAccountsMessage(error.message || "Could not create admin account", "error");
        })
        .finally(function () {
          if (adminAccountCreateBtn) {
            adminAccountCreateBtn.disabled = false;
            adminAccountCreateBtn.textContent = "Create Admin";
          }
        });
    });
  }

  if (adminAccountGeneratePasswordBtn && adminAccountPassword) {
    adminAccountGeneratePasswordBtn.addEventListener("click", function () {
      const generated = generateAdminPassword();
      adminAccountPassword.value = generated;
      adminAccountPassword.focus();
      adminAccountPassword.select();
      setAdminAccountsMessage("Random password generated.", "ok");
    });
  }

  if (adminResetPasswordGenerateBtn && adminResetPasswordInput) {
    adminResetPasswordGenerateBtn.addEventListener("click", function () {
      const generated = generateAdminPassword();
      adminResetPasswordInput.value = generated;
      adminResetPasswordInput.focus();
      adminResetPasswordInput.select();
      setResetPasswordError("");
    });
  }

  if (adminResetPasswordBackdrop) {
    adminResetPasswordBackdrop.addEventListener("click", closeResetPasswordModal);
  }
  if (adminResetPasswordCloseBtn) {
    adminResetPasswordCloseBtn.addEventListener("click", closeResetPasswordModal);
  }
  if (adminResetPasswordCancelBtn) {
    adminResetPasswordCancelBtn.addEventListener("click", closeResetPasswordModal);
  }
  if (adminResetPasswordForm) {
    adminResetPasswordForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!pendingResetAdmin || !pendingResetAdmin.adminUuid) return;
      const password = String(adminResetPasswordInput && adminResetPasswordInput.value || "").trim();
      if (password.length < 8) {
        setResetPasswordError("Password must be at least 8 characters.");
        return;
      }
      setResetPasswordError("");
      if (adminResetPasswordSubmitBtn) {
        adminResetPasswordSubmitBtn.disabled = true;
        adminResetPasswordSubmitBtn.textContent = "Updating...";
      }
      updateAdminAccount(String(pendingResetAdmin.adminUuid || ""), { password: password })
        .then(function () {
          closeResetPasswordModal();
        })
        .catch(function (error) {
          setResetPasswordError(error.message || "Could not update admin password.");
        })
        .finally(function () {
          if (adminResetPasswordSubmitBtn) {
            adminResetPasswordSubmitBtn.disabled = false;
            adminResetPasswordSubmitBtn.textContent = "Update Password";
          }
        });
    });
  }
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || !adminResetPasswordModal) return;
    if (adminResetPasswordModal.getAttribute("aria-hidden") === "false") {
      closeResetPasswordModal();
    }
  });

  loadSettings().catch(function (error) {
    setMessage(error.message || "Could not load settings", "error");
  });
  loadAdminAccounts().catch(function (error) {
    setAdminAccountsMessage(error.message || "Could not load admin accounts", "error");
  });
})();
