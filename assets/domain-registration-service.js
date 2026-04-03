(function () {
  const domainInput = document.getElementById("domainInput");
  const suggestBtn = document.getElementById("domainSuggestBtn");
  const checkBtn = document.getElementById("domainCheckBtn");
  const statusEl = document.getElementById("domainStatus");
  const suggestionsEl = document.getElementById("domainSuggestions");

  const checkoutCard = document.getElementById("domainCheckoutCard");
  const selectedNameEl = document.getElementById("domainSelectedName");
  const customerNameInput = document.getElementById("domainCustomerName");
  const customerEmailInput = document.getElementById("domainCustomerEmail");
  const yearsInput = document.getElementById("domainYears");
  const autoRenewInput = document.getElementById("domainAutoRenew");
  const quoteCard = document.getElementById("domainQuoteCard");
  const quoteRowsEl = document.getElementById("domainQuoteRows");
  const quoteTotalEl = document.getElementById("domainQuoteTotal");
  const quoteStatusEl = document.getElementById("domainQuoteStatus");
  const registerBtn = document.getElementById("domainRegisterBtn");
  const customerStatusEl = document.getElementById("domainCustomerStatus");
  const unsupportedTlds = new Set(["ng", "com.ng"]);

  let selectedDomain = "";
  let latestQuote = null;

  function setStatus(message, ok) {
    if (!statusEl) return;
    statusEl.textContent = String(message || "");
    statusEl.style.color = ok ? "#ffffff" : "#fca5a5";
  }

  function setCustomerStatus(message, ok) {
    if (!customerStatusEl) return;
    customerStatusEl.textContent = String(message || "");
    customerStatusEl.style.color = ok ? "#166534" : "#b91c1c";
  }

  function normalizeDomain(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0];
  }

  function hasExplicitExtension(value) {
    const domain = normalizeDomain(value);
    if (!domain) return false;
    if (!domain.includes(".")) return false;
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain);
  }

  function domainStem(value) {
    return normalizeDomain(value).replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  }

  function extractExtension(fullDomain, stem) {
    const name = normalizeDomain(fullDomain);
    const safeStem = domainStem(stem);
    if (!name || !safeStem || !name.startsWith(safeStem + ".")) return "";
    return name.slice(safeStem.length + 1);
  }

  function getDomainTld(value) {
    const domain = normalizeDomain(value);
    if (!domain || !domain.includes(".")) return "";
    const parts = domain.split(".").filter(Boolean);
    if (parts.length < 2) return "";
    return parts.slice(1).join(".");
  }

  function isUnsupportedTld(value) {
    const tld = getDomainTld(value);
    return Boolean(tld) && unsupportedTlds.has(tld);
  }

  function normalizeEmail(value) {
    const email = String(value || "").trim().toLowerCase();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    return ok ? email : "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function collectSelectedServices() {
    return [];
  }

  function readAutoRenewEnabled() {
    if (!autoRenewInput) return true;
    return autoRenewInput.checked === true;
  }

  function formatMoney(currency, amountMinor) {
    const amt = Number(amountMinor || 0);
    const code = String(currency || "").toUpperCase();
    if (!code || !Number.isFinite(amt) || amt < 0) return "-";
    const amount = amt / 100;
    try {
      return new Intl.NumberFormat("en-NG", { style: "currency", currency: code }).format(amount);
    } catch (_error) {
      return code + " " + amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }

  function setQuoteStatus(message, ok) {
    if (!quoteStatusEl) return;
    quoteStatusEl.textContent = String(message || "");
    quoteStatusEl.style.color = ok ? "#6b7280" : "#b91c1c";
  }

  function clearQuote() {
    latestQuote = null;
    if (quoteCard) quoteCard.classList.add("hidden");
    if (quoteRowsEl) quoteRowsEl.innerHTML = "";
    if (quoteTotalEl) quoteTotalEl.textContent = "-";
    setQuoteStatus("", true);
  }

  function renderQuote(quote) {
    if (!quoteRowsEl || !quoteTotalEl) return;
    const rows = [];
    rows.push(
      `<div class="flex items-center justify-between text-sm"><span class="text-gray-600">Domain registration (${Number(
        quote.years || 1
      )} year${Number(quote.years || 1) > 1 ? "s" : ""})</span><span class="font-semibold text-gray-900">${escapeHtml(
        formatMoney(quote.currency, quote.baseAmountMinor)
      )}</span></div>`
    );
    (Array.isArray(quote.addOns) ? quote.addOns : []).forEach(function (item) {
      rows.push(
        `<div class="flex items-center justify-between text-sm"><span class="text-gray-600">${escapeHtml(
          item.label || "Add-on"
        )} x${Number(item.quantity || 1)}</span><span class="font-semibold text-gray-900">${escapeHtml(
          formatMoney(quote.currency, item.amountMinor)
        )}</span></div>`
      );
    });
    rows.push(
      `<div class="flex items-center justify-between text-sm pt-1"><span class="text-gray-600">Subtotal</span><span class="font-semibold text-gray-900">${escapeHtml(
        formatMoney(quote.currency, quote.subtotalMinor)
      )}</span></div>`
    );
    rows.push(
      `<div class="flex items-center justify-between text-sm"><span class="text-gray-600">VAT (${Number(
        quote.vatPercent || 0
      ).toLocaleString(undefined, { maximumFractionDigits: 2 })}%)</span><span class="font-semibold text-gray-900">${escapeHtml(
        formatMoney(quote.currency, quote.vatAmountMinor)
      )}</span></div>`
    );
    quoteRowsEl.innerHTML = rows.join("");
    quoteTotalEl.textContent = formatMoney(quote.currency, quote.totalAmountMinor);
  }

  async function refreshQuote() {
    if (!selectedDomain) {
      clearQuote();
      return;
    }
    const years = Math.max(1, Math.min(Number(yearsInput ? yearsInput.value : 1) || 1, 10));
    const selectedServices = collectSelectedServices();
    if (quoteCard) quoteCard.classList.remove("hidden");
    setQuoteStatus("Updating total...", true);
    try {
      const json = await request("/.netlify/functions/domain-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domainName: selectedDomain,
          years,
          selectedServices,
        }),
      });
      latestQuote = json.quote || null;
      if (latestQuote) renderQuote(latestQuote);
      setQuoteStatus("Total includes selected add-ons.", true);
    } catch (error) {
      latestQuote = null;
      if (quoteRowsEl) quoteRowsEl.innerHTML = "";
      if (quoteTotalEl) quoteTotalEl.textContent = "-";
      setQuoteStatus(error.message || "Could not load pricing.", false);
    }
  }

  async function request(path, options) {
    const res = await fetch(path, options || {});
    const json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || "Request failed");
    }
    return json;
  }

  function scrollToResultsArea() {
    const target = suggestionsEl || statusEl;
    if (!target || typeof target.scrollIntoView !== "function") return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setSelectedDomain(domainName) {
    const name = normalizeDomain(domainName);
    if (!name) return;
    selectedDomain = name;
    if (domainInput) domainInput.value = name;
    if (selectedNameEl) selectedNameEl.textContent = name;
    if (checkoutCard) checkoutCard.classList.remove("hidden");
    setStatus(`${name} is available. Continue below to complete payment details.`, true);
    refreshQuote();
  }

  function resetDomainSelection() {
    selectedDomain = "";
    if (checkoutCard) checkoutCard.classList.add("hidden");
    if (selectedNameEl) selectedNameEl.textContent = "";
    clearQuote();
  }

  function renderSuggestions(list, options) {
    if (!suggestionsEl) return;
    const items = Array.isArray(list) ? list : [];
    const mode = options && options.mode ? String(options.mode) : "domains";
    const stem = options && options.stem ? domainStem(options.stem) : "";

    if (!items.length) {
      suggestionsEl.innerHTML = "";
      return 0;
    }

    if (mode === "extensions" && stem) {
      const extChoices = [];
      const extSeen = new Set();
      items.forEach(function (item) {
        if (!item || !item.available) return;
        const domainName = String(item.domainName || "").trim().toLowerCase();
        if (isUnsupportedTld(domainName)) return;
        const ext = extractExtension(domainName, stem);
        if (!ext || extSeen.has(ext)) return;
        extSeen.add(ext);
        extChoices.push({ ext, domainName });
      });

      if (!extChoices.length) {
        suggestionsEl.innerHTML = "";
        return 0;
      }

      suggestionsEl.innerHTML = extChoices
        .map(function (choice) {
          return [
            `<button type="button" class="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-left font-semibold text-emerald-700 transition-colors hover:bg-emerald-100" data-domain-pick="${escapeHtml(
              choice.domainName
            )}">`,
            `<span class="block text-sm font-bold">.${escapeHtml(choice.ext)}</span>`,
            `<span class="block mt-1 text-[11px] text-emerald-700/90">${escapeHtml(choice.domainName)}</span>`,
            "</button>",
          ].join("");
        })
        .join("");
      return extChoices.length;
    }

    const htmlItems = items
      .slice(0, 12)
      .map(function (item) {
        const domainName = String(item && item.domainName ? item.domainName : "").trim().toLowerCase();
        if (!domainName || isUnsupportedTld(domainName)) return "";
        const available = Boolean(item && item.available);
        return [
          `<button type="button" class="rounded-xl border px-3 py-2.5 text-xs text-left font-semibold transition-colors ${
            available
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "border-gray-200 bg-gray-50 text-gray-500"
          }" data-domain-pick="${escapeHtml(domainName)}" ${available ? "" : "disabled"}>`,
          `${escapeHtml(domainName)} ${available ? "• available" : "• unavailable"}`,
          "</button>",
        ].join("");
      })
      .filter(Boolean)
      .join("");
    suggestionsEl.innerHTML = htmlItems;
    return htmlItems ? 1 : 0;
  }

  async function hydrateFromSession() {
    try {
      const session = await request("/.netlify/functions/user-session", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (customerNameInput && session.account && session.account.fullName && !customerNameInput.value) {
        customerNameInput.value = String(session.account.fullName || "");
      }
      if (customerEmailInput && session.account && session.account.email && !customerEmailInput.value) {
        customerEmailInput.value = String(session.account.email || "");
      }
      if (autoRenewInput && session.account && typeof session.account.domainsAutoRenewEnabled === "boolean") {
        autoRenewInput.checked = session.account.domainsAutoRenewEnabled;
      }
    } catch (_error) {}
  }

  if (suggestBtn) {
    suggestBtn.addEventListener("click", async function () {
      setStatus("", true);
      resetDomainSelection();
      const preferredName = normalizeDomain(domainInput ? domainInput.value : "");
      if (!preferredName) {
        setStatus("Enter a preferred domain first.", false);
        return;
      }
      if (hasExplicitExtension(preferredName) && isUnsupportedTld(preferredName)) {
        if (suggestionsEl) suggestionsEl.innerHTML = "";
        setStatus(".ng extensions are currently not supported.", false);
        return;
      }
      suggestBtn.disabled = true;
      suggestBtn.textContent = "Suggesting...";
      try {
        const json = await request("/.netlify/functions/domain-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferredName }),
        });
        const explicit = hasExplicitExtension(preferredName);
        if (explicit) {
          renderSuggestions(json.suggestions || [], { mode: "domains" });
          const pick = String(json.firstAvailable || "").trim().toLowerCase();
          if (pick) setSelectedDomain(pick);
          else setStatus("We couldn't find an available option for that name. Try a slightly different name.", false);
        } else {
          const count = renderSuggestions(json.suggestions || [], { mode: "extensions", stem: preferredName });
          if (count > 0) setStatus("Select your preferred extension below to continue.", true);
          else setStatus("We couldn't find available extensions for that name. Try a slightly different name.", false);
        }
      } catch (error) {
        setStatus(error.message || "Could not suggest domains", false);
      } finally {
        suggestBtn.disabled = false;
        suggestBtn.textContent = "Suggest";
        scrollToResultsArea();
      }
    });
  }

  if (checkBtn) {
    checkBtn.addEventListener("click", async function () {
      setStatus("", true);
      resetDomainSelection();
      const domainName = normalizeDomain(domainInput ? domainInput.value : "");
      if (!domainName) {
        setStatus("Enter a domain first.", false);
        return;
      }
      if (hasExplicitExtension(domainName) && isUnsupportedTld(domainName)) {
        if (suggestionsEl) suggestionsEl.innerHTML = "";
        setStatus(".ng extensions are currently not supported.", false);
        return;
      }
      checkBtn.disabled = true;
      checkBtn.textContent = "Checking...";
      try {
        if (hasExplicitExtension(domainName)) {
          const json = await request("/.netlify/functions/domain-check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domainName }),
          });
          if (json.available) setSelectedDomain(domainName);
          else setStatus(`${domainName} is not available. Try another name.`, false);
        } else {
          const json = await request("/.netlify/functions/domain-suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preferredName: domainName }),
          });
          const count = renderSuggestions(json.suggestions || [], { mode: "extensions", stem: domainName });
          if (count > 0) setStatus("Select your preferred extension below to continue.", true);
          else setStatus("We couldn't find available extensions for that name. Try a slightly different name.", false);
        }
      } catch (error) {
        setStatus(error.message || "Could not check domain", false);
      } finally {
        checkBtn.disabled = false;
        checkBtn.textContent = "Check";
        scrollToResultsArea();
      }
    });
  }

  if (registerBtn) {
    registerBtn.addEventListener("click", async function () {
      setCustomerStatus("", true);
      if (!selectedDomain) {
        setCustomerStatus("Search and pick an available domain first.", false);
        return;
      }

      const fullName = String(customerNameInput ? customerNameInput.value : "").trim();
      const email = normalizeEmail(customerEmailInput ? customerEmailInput.value : "");
      const years = Math.max(1, Math.min(Number(yearsInput ? yearsInput.value : 1) || 1, 10));
      const selectedServices = collectSelectedServices();
      const autoRenewEnabled = readAutoRenewEnabled();

      if (!fullName) {
        setCustomerStatus("Enter your full name.", false);
        return;
      }
      if (!email) {
        setCustomerStatus("Enter a valid email address.", false);
        return;
      }

      registerBtn.disabled = true;
      registerBtn.textContent = "Preparing payment...";
      try {
        // Re-check availability right before payment init.
        const verify = await request("/.netlify/functions/domain-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domainName: selectedDomain }),
        });
        if (!verify.available) {
          throw new Error(`${selectedDomain} is no longer available. Please choose another domain.`);
        }

        const json = await request("/.netlify/functions/domain-create-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName,
            email,
            domainName: selectedDomain,
            years,
            selectedServices,
            autoRenewEnabled,
          }),
        });
        if (json && json.quote) {
          latestQuote = json.quote;
          renderQuote(json.quote);
        }
        if (!json.checkoutUrl) throw new Error("Missing payment checkout URL.");
        window.location.href = json.checkoutUrl;
      } catch (error) {
        setCustomerStatus(error.message || "Could not initialize payment", false);
        registerBtn.disabled = false;
        registerBtn.textContent = "Continue to Payment";
      }
    });
  }

  if (suggestionsEl) {
    suggestionsEl.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-domain-pick]");
      if (!button || button.disabled) return;
      const value = normalizeDomain(button.getAttribute("data-domain-pick") || "");
      if (value) setSelectedDomain(value);
    });
  }

  if (yearsInput) yearsInput.addEventListener("change", refreshQuote);

  (function readReturnState() {
    const query = new URLSearchParams(window.location.search || "");
    const payment = String(query.get("payment") || "").trim().toLowerCase();
    if (payment === "failed") {
      setCustomerStatus("Payment was not completed. Please try again.", false);
    }
  })();

  hydrateFromSession();
})();
