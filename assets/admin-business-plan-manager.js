(function () {
  var appCard = document.getElementById("adminAppCard");
  var logoutBtn = document.getElementById("adminLogoutBtn");
  var messageEl = document.getElementById("managerMessage");
  var saveBtn = document.getElementById("managerSaveBtn");

  var priceNairaInput = document.getElementById("priceNaira");
  var priceMinorPreview = document.getElementById("priceMinorPreview");
  var verifierNameInput = document.getElementById("verifierNameInput");
  var verifierBioInput = document.getElementById("verifierBioInput");
  var verifierLinkedinInput = document.getElementById("verifierLinkedinInput");
  var verifierImageUrlInput = document.getElementById("verifierImageUrlInput");
  var verifierImageFileInput = document.getElementById("verifierImageFileInput");

  var verifierImagePreview = document.getElementById("verifierImagePreview");
  var verifierNamePreview = document.getElementById("verifierNamePreview");
  var verifierBioPreview = document.getElementById("verifierBioPreview");
  var queueStatusSelect = document.getElementById("bpQueueStatus");
  var queueRefreshBtn = document.getElementById("bpQueueRefreshBtn");
  var queueRows = document.getElementById("bpQueueRows");
  var queueMeta = document.getElementById("bpQueueMeta");
  var queueModal = document.getElementById("bpQueueDetailsModal");
  var queueDetailsText = document.getElementById("bpQueueDetailsText");
  var queueVerifierNotes = document.getElementById("bpQueueVerifierNotes");
  var queueVerifyBtn = document.getElementById("bpQueueVerifyBtn");
  var verifierCreateForm = document.getElementById("verifierCreateForm");
  var verifierCreateName = document.getElementById("verifierCreateName");
  var verifierCreateEmail = document.getElementById("verifierCreateEmail");
  var verifierCreatePassword = document.getElementById("verifierCreatePassword");
  var verifierCreateBtn = document.getElementById("verifierCreateBtn");
  var verifierRows = document.getElementById("verifierRows");

  var SETTINGS_KEYS = {
    priceMinor: "BUSINESS_PLAN_PRICE_NGN_MINOR",
    verifierName: "BUSINESS_PLAN_VERIFIER_NAME",
    verifierImageUrl: "BUSINESS_PLAN_VERIFIER_IMAGE_URL",
    verifierBio: "BUSINESS_PLAN_VERIFIER_BIO",
    verifierLinkedinUrl: "BUSINESS_PLAN_VERIFIER_LINKEDIN_URL",
  };
  var queueItems = [];
  var activePlanUuid = "";
  var verifierItems = [];

  function clean(value, max) {
    return String(value || "").trim().slice(0, max);
  }

  function setMessage(text, type) {
    if (!messageEl) return;
    var hasText = Boolean(text);
    messageEl.classList.toggle("hidden", !hasText);
    messageEl.textContent = String(text || "");
    messageEl.classList.remove("border-emerald-200", "bg-emerald-50", "text-emerald-800", "border-rose-200", "bg-rose-50", "text-rose-800", "border-gray-200", "bg-gray-50", "text-gray-700");
    if (!hasText) return;
    if (type === "error") {
      messageEl.classList.add("border-rose-200", "bg-rose-50", "text-rose-800");
      return;
    }
    if (type === "ok") {
      messageEl.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-800");
      return;
    }
    messageEl.classList.add("border-gray-200", "bg-gray-50", "text-gray-700");
  }

  function redirectToInternalSignIn() {
    var next = window.location.pathname + (window.location.search || "");
    window.location.href = "/internal/?next=" + encodeURIComponent(next);
  }

  function toMinorFromNaira(value) {
    var naira = Number(value || 0);
    if (!Number.isFinite(naira) || naira <= 0) return 0;
    return Math.round(naira * 100);
  }

  function toNairaFromMinor(value) {
    var minor = Number(value || 0);
    if (!Number.isFinite(minor) || minor <= 0) return 200;
    return Math.round(minor / 100);
  }

  function updatePricePreview() {
    var minor = toMinorFromNaira(priceNairaInput ? priceNairaInput.value : 0);
    if (priceMinorPreview) priceMinorPreview.textContent = String(minor || 0);
  }

  function updateVerifierPreview() {
    if (verifierNamePreview && verifierNameInput) verifierNamePreview.textContent = clean(verifierNameInput.value, 120) || "Jane Doe";
    if (verifierBioPreview && verifierBioInput) verifierBioPreview.textContent = clean(verifierBioInput.value, 4000);
    if (verifierImagePreview && verifierImageUrlInput) {
      var imageUrl = clean(verifierImageUrlInput.value, 1000);
      verifierImagePreview.src = imageUrl || "https://ui-avatars.com/api/?name=Jane+Doe&background=10b981&color=fff";
    }
  }

  function setSavingState(saving) {
    if (!saveBtn) return;
    saveBtn.disabled = Boolean(saving);
    saveBtn.textContent = saving ? "Saving..." : "Save Changes";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtDate(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }

  function fmtMoney(minor, currency) {
    var amount = Number(minor || 0) / 100;
    var code = String(currency || "NGN").toUpperCase();
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(amount);
    } catch (_error) {
      return code + " " + amount.toFixed(2);
    }
  }

  function selectedStatus() {
    return String((queueStatusSelect && queueStatusSelect.value) || "all").trim() || "all";
  }

  function openQueueModal(item) {
    if (!queueModal || !item) return;
    activePlanUuid = String(item.planUuid || "");
    if (queueDetailsText) queueDetailsText.textContent = String(item.planText || "");
    if (queueVerifierNotes) queueVerifierNotes.value = String(item.verifierNotes || "");
    if (queueVerifyBtn) {
      var awaiting = String(item.verificationStatus || "").toLowerCase() !== "verified";
      queueVerifyBtn.disabled = !awaiting;
      queueVerifyBtn.textContent = awaiting ? "Mark Verified" : "Already Verified";
    }
    queueModal.classList.remove("hidden");
    queueModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("overflow-hidden");
  }

  function closeQueueModal() {
    if (!queueModal) return;
    queueModal.classList.add("hidden");
    queueModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("overflow-hidden");
    activePlanUuid = "";
  }

  function renderQueue(items) {
    if (!queueRows) return;
    if (!Array.isArray(items) || !items.length) {
      queueRows.innerHTML = '<tr><td colspan="6" class="px-3 py-5 text-sm text-gray-500">No records found.</td></tr>';
      return;
    }

    queueRows.innerHTML = items
      .map(function (item, idx) {
        var status = String(item.verificationStatus || "awaiting_verification");
        var verified = status.toLowerCase() === "verified";
        return [
          "<tr class=\"border-b border-gray-50\">",
          '<td class="px-3 py-2 text-sm font-semibold text-gray-900">' + escapeHtml(item.businessName || "-") + "</td>",
          '<td class="px-3 py-2 text-sm text-gray-700">' + escapeHtml(item.fullName || "-") + "<br/><span class=\"text-xs text-gray-500\">" + escapeHtml(item.email || "-") + "</span></td>",
          '<td class="px-3 py-2 text-sm text-gray-700">' + escapeHtml(fmtMoney(item.amountMinor, item.paymentCurrency)) + "</td>",
          '<td class="px-3 py-2 text-sm"><span class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ' + (verified ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200") + '">' + escapeHtml(verified ? "Verified" : "Awaiting Verification") + "</span></td>",
          '<td class="px-3 py-2 text-sm text-gray-700">' + escapeHtml(fmtDate(item.generatedAt)) + "</td>",
          '<td class="px-3 py-2 text-sm"><button type="button" data-queue-view="' + idx + '" class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50">Open</button></td>',
          "</tr>",
        ].join("");
      })
      .join("");
  }

  async function loadQueue() {
    var status = selectedStatus();
    var query = status && status !== "all" ? "?status=" + encodeURIComponent(status) : "";
    var res = await fetch("/.netlify/functions/admin-business-plans-list" + query, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (res.status === 401 || res.status === 403) {
      redirectToInternalSignIn();
      return;
    }
    var json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load business plan queue");
    }
    queueItems = Array.isArray(json.items) ? json.items : [];
    if (queueMeta) queueMeta.textContent = "Showing " + queueItems.length + " plan record(s).";
    renderQueue(queueItems);
  }

  async function verifyActivePlan() {
    if (!activePlanUuid) return;
    if (queueVerifyBtn) {
      queueVerifyBtn.disabled = true;
      queueVerifyBtn.textContent = "Saving...";
    }
    try {
      var res = await fetch("/.netlify/functions/admin-business-plans-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          planUuid: activePlanUuid,
          verifierNotes: queueVerifierNotes ? queueVerifierNotes.value : "",
        }),
      });
      if (res.status === 401 || res.status === 403) {
        redirectToInternalSignIn();
        return;
      }
      var json = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not verify plan");
      }
      setMessage("Plan marked as verified.", "ok");
      closeQueueModal();
      await loadQueue();
    } catch (error) {
      setMessage(error.message || "Could not verify plan", "error");
      if (queueVerifyBtn) {
        queueVerifyBtn.disabled = false;
        queueVerifyBtn.textContent = "Mark Verified";
      }
    }
  }

  async function checkSession() {
    var res = await fetch("/.netlify/functions/admin-session", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    return res.ok;
  }

  function renderVerifierRows(items) {
    if (!verifierRows) return;
    if (!Array.isArray(items) || !items.length) {
      verifierRows.innerHTML = '<tr><td colspan="4" class="px-3 py-5 text-sm text-gray-500">No verifier account yet.</td></tr>';
      return;
    }
    verifierRows.innerHTML = items
      .map(function (item, idx) {
        return [
          '<tr class="border-b border-gray-50">',
          '<td class="px-3 py-2 text-sm font-semibold text-gray-900">' + escapeHtml(item.fullName || "-") + "</td>",
          '<td class="px-3 py-2 text-sm text-gray-700">' + escapeHtml(item.email || "-") + "</td>",
          '<td class="px-3 py-2 text-sm text-gray-700">' + escapeHtml(fmtDate(item.lastLoginAt)) + "</td>",
          '<td class="px-3 py-2 text-sm">',
          '<div class="flex items-center gap-2">',
          '<input type="password" data-v-pass="' + idx + '" minlength="8" class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900" placeholder="New password" />',
          '<button type="button" data-v-save="' + idx + '" class="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50">Update</button>',
          "</div>",
          "</td>",
          "</tr>",
        ].join("");
      })
      .join("");
  }

  async function loadVerifiers() {
    var res = await fetch("/.netlify/functions/admin-verifier-list", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (res.status === 401 || res.status === 403) {
      redirectToInternalSignIn();
      return;
    }
    var json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load verifiers");
    }
    verifierItems = Array.isArray(json.items) ? json.items : [];
    renderVerifierRows(verifierItems);
  }

  async function createVerifier() {
    var fullName = clean(verifierCreateName && verifierCreateName.value, 180);
    var email = clean(verifierCreateEmail && verifierCreateEmail.value, 190).toLowerCase();
    var password = String((verifierCreatePassword && verifierCreatePassword.value) || "");
    if (!fullName || !email || password.length < 8) {
      throw new Error("Verifier name, email and password (8+ chars) are required");
    }
    if (verifierCreateBtn) {
      verifierCreateBtn.disabled = true;
      verifierCreateBtn.textContent = "Creating...";
    }
    try {
      var res = await fetch("/.netlify/functions/admin-verifier-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fullName: fullName, email: email, password: password }),
      });
      var json = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not create verifier");
      }
      if (verifierCreateForm) verifierCreateForm.reset();
      await loadVerifiers();
      setMessage("Verifier account created.", "ok");
    } finally {
      if (verifierCreateBtn) {
        verifierCreateBtn.disabled = false;
        verifierCreateBtn.textContent = "Create Verifier";
      }
    }
  }

  async function updateVerifierPasswordByRow(idx) {
    var item = verifierItems[idx];
    if (!item || !item.verifierUuid) return;
    var input = document.querySelector('[data-v-pass="' + idx + '"]');
    var password = String((input && input.value) || "");
    if (password.length < 8) throw new Error("Password must be at least 8 characters");
    var res = await fetch("/.netlify/functions/admin-verifier-password-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ verifierUuid: item.verifierUuid, password: password }),
    });
    var json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not update verifier password");
    }
    if (input) input.value = "";
    setMessage("Verifier password updated.", "ok");
  }

  async function logout() {
    await fetch("/.netlify/functions/admin-logout", {
      method: "POST",
      credentials: "include",
    }).catch(function () {
      return null;
    });
  }

  async function getUploadSignature() {
    var res = await fetch("/.netlify/functions/upload-signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "business_plan_verifier" }),
    });
    var json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not prepare image upload");
    }
    return json;
  }

  async function uploadImage(file) {
    var uploadConfig = await getUploadSignature();
    var fd = new FormData();
    fd.append("file", file);
    fd.append("api_key", uploadConfig.apiKey);
    fd.append("timestamp", String(uploadConfig.timestamp));
    fd.append("folder", uploadConfig.folder);
    fd.append("signature", uploadConfig.signature);

    var endpoint = "https://api.cloudinary.com/v1_1/" + encodeURIComponent(uploadConfig.cloudName) + "/auto/upload";
    var res = await fetch(endpoint, { method: "POST", body: fd });
    var json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.secure_url) {
      var msg = (json && json.error && json.error.message) || "Could not upload image";
      throw new Error(msg);
    }
    return String(json.secure_url || "");
  }

  async function loadManagerData() {
    setMessage("Loading manager data...", "info");
    var res = await fetch("/.netlify/functions/admin-tochukwu-settings-get", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (res.status === 401) {
      redirectToInternalSignIn();
      return;
    }
    var json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Could not load manager data");
    }

    var rows = Array.isArray(json.items) ? json.items : [];
    var map = {};
    rows.forEach(function (row) {
      if (!row || !row.key) return;
      map[String(row.key)] = String(row.value || "");
    });

    var priceMinor = Number(map[SETTINGS_KEYS.priceMinor] || 20000);
    if (priceNairaInput) priceNairaInput.value = String(toNairaFromMinor(priceMinor));
    if (verifierNameInput) verifierNameInput.value = clean(map[SETTINGS_KEYS.verifierName] || "Jane Doe", 120);
    if (verifierBioInput) verifierBioInput.value = clean(map[SETTINGS_KEYS.verifierBio], 4000);
    if (verifierLinkedinInput) verifierLinkedinInput.value = clean(map[SETTINGS_KEYS.verifierLinkedinUrl] || "https://linkedin.com/in/your-expert-link", 1000);
    if (verifierImageUrlInput) {
      verifierImageUrlInput.value = clean(
        map[SETTINGS_KEYS.verifierImageUrl] || "https://ui-avatars.com/api/?name=Jane+Doe&background=10b981&color=fff",
        1000
      );
    }

    updatePricePreview();
    updateVerifierPreview();
    await loadVerifiers();
    await loadQueue();
    setMessage("Manager data loaded.", "ok");
  }

  async function saveManagerData() {
    var naira = Number(priceNairaInput && priceNairaInput.value);
    if (!Number.isFinite(naira) || naira <= 0) {
      setMessage("Enter a valid business plan price in Naira.", "error");
      return;
    }

    var entries = [
      { key: SETTINGS_KEYS.priceMinor, value: String(toMinorFromNaira(naira)) },
      { key: SETTINGS_KEYS.verifierName, value: clean(verifierNameInput && verifierNameInput.value, 120) },
      { key: SETTINGS_KEYS.verifierImageUrl, value: clean(verifierImageUrlInput && verifierImageUrlInput.value, 1000) },
      { key: SETTINGS_KEYS.verifierBio, value: clean(verifierBioInput && verifierBioInput.value, 4000) },
      { key: SETTINGS_KEYS.verifierLinkedinUrl, value: clean(verifierLinkedinInput && verifierLinkedinInput.value, 1000) },
    ];

    setSavingState(true);
    setMessage("", "");
    try {
      var res = await fetch("/.netlify/functions/admin-tochukwu-settings-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ items: entries }),
      });
      if (res.status === 401) {
        redirectToInternalSignIn();
        return;
      }
      var json = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !json || !json.ok) {
        throw new Error((json && json.error) || "Could not save manager data");
      }
      setMessage("Business plan manager updated successfully.", "ok");
    } catch (error) {
      setMessage(error.message || "Could not save manager data", "error");
    } finally {
      setSavingState(false);
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      await logout();
      window.location.href = "/internal/";
    });
  }

  if (priceNairaInput) {
    priceNairaInput.addEventListener("input", updatePricePreview);
  }
  if (verifierNameInput) verifierNameInput.addEventListener("input", updateVerifierPreview);
  if (verifierBioInput) verifierBioInput.addEventListener("input", updateVerifierPreview);
  if (verifierImageUrlInput) verifierImageUrlInput.addEventListener("input", updateVerifierPreview);

  if (verifierImageFileInput) {
    verifierImageFileInput.addEventListener("change", async function () {
      var file = verifierImageFileInput.files && verifierImageFileInput.files[0];
      if (!file) return;
      setMessage("Uploading image...", "info");
      try {
        var url = await uploadImage(file);
        if (verifierImageUrlInput) verifierImageUrlInput.value = url;
        updateVerifierPreview();
        setMessage("Image uploaded successfully.", "ok");
      } catch (error) {
        setMessage(error.message || "Could not upload image", "error");
      } finally {
        verifierImageFileInput.value = "";
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", function () {
      saveManagerData();
    });
  }
  if (verifierCreateForm) {
    verifierCreateForm.addEventListener("submit", function (event) {
      event.preventDefault();
      createVerifier().catch(function (error) {
        setMessage(error.message || "Could not create verifier", "error");
      });
    });
  }
  if (verifierRows) {
    verifierRows.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-v-save]");
      if (!btn) return;
      var idx = Number(btn.getAttribute("data-v-save"));
      if (!Number.isFinite(idx)) return;
      updateVerifierPasswordByRow(idx).catch(function (error) {
        setMessage(error.message || "Could not update verifier password", "error");
      });
    });
  }

  if (queueStatusSelect) {
    queueStatusSelect.addEventListener("change", function () {
      loadQueue().catch(function (error) {
        setMessage(error.message || "Could not load queue", "error");
      });
    });
  }
  if (queueRefreshBtn) {
    queueRefreshBtn.addEventListener("click", function () {
      loadQueue().catch(function (error) {
        setMessage(error.message || "Could not load queue", "error");
      });
    });
  }
  if (queueRows) {
    queueRows.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-queue-view]");
      if (!btn) return;
      var idx = Number(btn.getAttribute("data-queue-view"));
      if (!Number.isFinite(idx) || !queueItems[idx]) return;
      openQueueModal(queueItems[idx]);
    });
  }
  if (queueVerifyBtn) {
    queueVerifyBtn.addEventListener("click", function () {
      verifyActivePlan();
    });
  }
  Array.prototype.slice.call(document.querySelectorAll("[data-bp-close]")).forEach(function (el) {
    el.addEventListener("click", function () {
      closeQueueModal();
    });
  });

  checkSession()
    .then(function (authed) {
      if (!authed) {
        redirectToInternalSignIn();
        return;
      }
      if (appCard) appCard.hidden = false;
      return loadManagerData();
    })
    .catch(function (error) {
      if (appCard) appCard.hidden = false;
      setMessage((error && error.message) || "Could not load manager data", "error");
    });
})();
