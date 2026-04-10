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
  const registrantAddress1Input = document.getElementById("domainRegistrantAddress1");
  const registrantCityInput = document.getElementById("domainRegistrantCity");
  const registrantStateInput = document.getElementById("domainRegistrantState");
  const registrantCountryInput = document.getElementById("domainRegistrantCountry");
  const registrantPostalCodeInput = document.getElementById("domainRegistrantPostalCode");
  const registrantPhoneInput = document.getElementById("domainRegistrantPhone");
  const registrantPhoneCcInput = document.getElementById("domainRegistrantPhoneCc");
  const yearsInput = document.getElementById("domainYears");
  const autoRenewInput = document.getElementById("domainAutoRenew");
  const quoteCard = document.getElementById("domainQuoteCard");
  const quoteRowsEl = document.getElementById("domainQuoteRows");
  const quoteTotalEl = document.getElementById("domainQuoteTotal");
  const quoteStatusEl = document.getElementById("domainQuoteStatus");
  const registerBtn = document.getElementById("domainRegisterBtn");
  const customerStatusEl = document.getElementById("domainCustomerStatus");
  const unsupportedTlds = new Set(["ng", "com.ng"]);
  const COUNTRY_PHONE_OPTIONS = [
    { country: "NG", name: "Nigeria", phoneCc: "234" },
    { country: "GH", name: "Ghana", phoneCc: "233" },
    { country: "KE", name: "Kenya", phoneCc: "254" },
    { country: "ZA", name: "South Africa", phoneCc: "27" },
    { country: "EG", name: "Egypt", phoneCc: "20" },
    { country: "MA", name: "Morocco", phoneCc: "212" },
    { country: "ET", name: "Ethiopia", phoneCc: "251" },
    { country: "UG", name: "Uganda", phoneCc: "256" },
    { country: "TZ", name: "Tanzania", phoneCc: "255" },
    { country: "RW", name: "Rwanda", phoneCc: "250" },
    { country: "CM", name: "Cameroon", phoneCc: "237" },
    { country: "SN", name: "Senegal", phoneCc: "221" },
    { country: "CI", name: "Cote d'Ivoire", phoneCc: "225" },
    { country: "US", name: "United States", phoneCc: "1" },
    { country: "CA", name: "Canada", phoneCc: "1" },
    { country: "GB", name: "United Kingdom", phoneCc: "44" },
    { country: "IE", name: "Ireland", phoneCc: "353" },
    { country: "DE", name: "Germany", phoneCc: "49" },
    { country: "FR", name: "France", phoneCc: "33" },
    { country: "NL", name: "Netherlands", phoneCc: "31" },
    { country: "BE", name: "Belgium", phoneCc: "32" },
    { country: "ES", name: "Spain", phoneCc: "34" },
    { country: "IT", name: "Italy", phoneCc: "39" },
    { country: "PT", name: "Portugal", phoneCc: "351" },
    { country: "CH", name: "Switzerland", phoneCc: "41" },
    { country: "SE", name: "Sweden", phoneCc: "46" },
    { country: "NO", name: "Norway", phoneCc: "47" },
    { country: "DK", name: "Denmark", phoneCc: "45" },
    { country: "FI", name: "Finland", phoneCc: "358" },
    { country: "PL", name: "Poland", phoneCc: "48" },
    { country: "AT", name: "Austria", phoneCc: "43" },
    { country: "CZ", name: "Czech Republic", phoneCc: "420" },
    { country: "RO", name: "Romania", phoneCc: "40" },
    { country: "GR", name: "Greece", phoneCc: "30" },
    { country: "TR", name: "Turkey", phoneCc: "90" },
    { country: "AE", name: "United Arab Emirates", phoneCc: "971" },
    { country: "SA", name: "Saudi Arabia", phoneCc: "966" },
    { country: "QA", name: "Qatar", phoneCc: "974" },
    { country: "KW", name: "Kuwait", phoneCc: "965" },
    { country: "OM", name: "Oman", phoneCc: "968" },
    { country: "IN", name: "India", phoneCc: "91" },
    { country: "PK", name: "Pakistan", phoneCc: "92" },
    { country: "BD", name: "Bangladesh", phoneCc: "880" },
    { country: "LK", name: "Sri Lanka", phoneCc: "94" },
    { country: "NP", name: "Nepal", phoneCc: "977" },
    { country: "CN", name: "China", phoneCc: "86" },
    { country: "JP", name: "Japan", phoneCc: "81" },
    { country: "KR", name: "South Korea", phoneCc: "82" },
    { country: "SG", name: "Singapore", phoneCc: "65" },
    { country: "MY", name: "Malaysia", phoneCc: "60" },
    { country: "ID", name: "Indonesia", phoneCc: "62" },
    { country: "TH", name: "Thailand", phoneCc: "66" },
    { country: "PH", name: "Philippines", phoneCc: "63" },
    { country: "VN", name: "Vietnam", phoneCc: "84" },
    { country: "AU", name: "Australia", phoneCc: "61" },
    { country: "NZ", name: "New Zealand", phoneCc: "64" },
    { country: "BR", name: "Brazil", phoneCc: "55" },
    { country: "MX", name: "Mexico", phoneCc: "52" },
    { country: "AR", name: "Argentina", phoneCc: "54" },
    { country: "CL", name: "Chile", phoneCc: "56" },
    { country: "CO", name: "Colombia", phoneCc: "57" },
    { country: "PE", name: "Peru", phoneCc: "51" },
  ];

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

  function populateCountryAndPhoneCodeOptions() {
    if (!registrantCountryInput || !registrantPhoneCcInput) return;
    const currentCountry = String(registrantCountryInput.value || "").trim().toUpperCase();

    const countries = COUNTRY_PHONE_OPTIONS
      .slice()
      .sort(function (a, b) {
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
    registrantCountryInput.innerHTML = ['<option value="">Select country</option>']
      .concat(
        countries.map(function (item) {
          return `<option value="${escapeHtml(item.country)}">${escapeHtml(item.name)} (${escapeHtml(item.country)})</option>`;
        })
      )
      .join("");

    const codeMap = new Map();
    COUNTRY_PHONE_OPTIONS.forEach(function (item) {
      const code = String(item.phoneCc || "").trim();
      if (!code) return;
      if (!codeMap.has(code)) codeMap.set(code, []);
      codeMap.get(code).push(item.country);
    });
    const codes = Array.from(codeMap.keys()).sort(function (a, b) {
      return Number(a) - Number(b);
    });
    registrantPhoneCcInput.innerHTML = ['<option value="">Select code</option>']
      .concat(
        codes.map(function (code) {
          const countriesForCode = codeMap.get(code) || [];
          return `<option value="${escapeHtml(code)}">+${escapeHtml(code)} (${escapeHtml(countriesForCode.join(", "))})</option>`;
        })
      )
      .join("");

    function syncPhoneCodeFromCountry() {
      const country = String(registrantCountryInput.value || "").trim().toUpperCase();
      if (!country) return;
      const match = COUNTRY_PHONE_OPTIONS.find(function (item) {
        return item.country === country;
      });
      if (!match || !match.phoneCc) return;
      registrantPhoneCcInput.value = String(match.phoneCc);
    }

    registrantCountryInput.addEventListener("change", syncPhoneCodeFromCountry);

    const hasCurrentCountry = COUNTRY_PHONE_OPTIONS.some(function (item) {
      return item.country === currentCountry;
    });
    registrantCountryInput.value = hasCurrentCountry ? currentCountry : "NG";
    syncPhoneCodeFromCountry();
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
      setQuoteStatus("", true);
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
      const registrantAddress1 = String(registrantAddress1Input ? registrantAddress1Input.value : "").trim();
      const registrantCity = String(registrantCityInput ? registrantCityInput.value : "").trim();
      const registrantState = String(registrantStateInput ? registrantStateInput.value : "").trim();
      const registrantCountry = String(registrantCountryInput ? registrantCountryInput.value : "").trim();
      const registrantPostalCode = String(registrantPostalCodeInput ? registrantPostalCodeInput.value : "").trim();
      const registrantPhone = String(registrantPhoneInput ? registrantPhoneInput.value : "").trim();
      const registrantPhoneCc = String(registrantPhoneCcInput ? registrantPhoneCcInput.value : "").trim();
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
      if (
        !registrantAddress1 ||
        !registrantCity ||
        !registrantState ||
        !registrantCountry ||
        !registrantPostalCode ||
        !registrantPhone ||
        !registrantPhoneCc
      ) {
        setCustomerStatus("Address, city, state, country, postal code, phone, and phone country code are required.", false);
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
            registrantAddress1,
            registrantCity,
            registrantState,
            registrantCountry,
            registrantPostalCode,
            registrantPhone,
            registrantPhoneCc,
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

  if (suggestBtn) {
    suggestBtn.disabled = false;
    suggestBtn.removeAttribute("aria-disabled");
    suggestBtn.removeAttribute("title");
  }
  if (checkBtn) {
    checkBtn.disabled = false;
    checkBtn.removeAttribute("aria-disabled");
    checkBtn.removeAttribute("title");
  }
  if (registerBtn) {
    registerBtn.disabled = false;
    registerBtn.removeAttribute("aria-disabled");
    registerBtn.removeAttribute("title");
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
  populateCountryAndPhoneCodeOptions();
})();
