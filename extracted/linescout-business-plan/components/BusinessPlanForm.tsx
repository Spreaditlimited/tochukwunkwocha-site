"use client";

import React, { useMemo, useState } from "react";
import { callN8nWebhook } from "@/lib/n8n";
import { track } from "@/lib/metaPixel";

type Intake = {
  businessName: string;
  country: string;
  city: string;
  productLine: string;
  capacity: string;
  targetCustomers: string;
  startupCapital: number | "";
  ownerContribution: number | "";
  loanAmount: number | "";
  loanTenorYears: number | "";
  equityPartners: boolean;
  existingExperience: string;
  distributionChannels: string;
  pricingApproach: string;
  uniqueAngle: string;
  extraNotes: string;
};

type ResultState = {
  ok: boolean;
  canGenerate?: boolean;
  consumed?: boolean;
  message?: string;
  error?: string;
  code?: string;
  token?: string;
  type?: string;
  currency?: string;
  exchangeRate?: number;
  intake?: {
    businessName?: string;
    [key: string]: any;
  };
  planText?: string;
};

type Purpose = "loan" | "investor" | "internal" | "grant" | "other";

function isBlank(v: string) {
  return !v || v.trim().length === 0;
}

function toNumberOrEmpty(v: unknown): number | "" {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return "";
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : "";
  }
  return "";
}

// Prefill rules:
// - only fill empty strings
// - only fill number fields if current is ""
// - only set equityPartners if current is false and incoming is true
function mergeIntakePrefill(current: Intake, incoming: Partial<Intake>): Intake {
  const next: Intake = { ...current };

  // string fields
  if (isBlank(next.businessName) && typeof incoming.businessName === "string" && incoming.businessName.trim()) {
    next.businessName = incoming.businessName;
  }
  if (isBlank(next.country) && typeof incoming.country === "string" && incoming.country.trim()) {
    next.country = incoming.country;
  }
  if (isBlank(next.city) && typeof incoming.city === "string" && incoming.city.trim()) {
    next.city = incoming.city;
  }
  if (isBlank(next.productLine) && typeof incoming.productLine === "string" && incoming.productLine.trim()) {
    next.productLine = incoming.productLine;
  }
  if (isBlank(next.capacity) && typeof incoming.capacity === "string" && incoming.capacity.trim()) {
    next.capacity = incoming.capacity;
  }
  if (isBlank(next.targetCustomers) && typeof incoming.targetCustomers === "string" && incoming.targetCustomers.trim()) {
    next.targetCustomers = incoming.targetCustomers;
  }
  if (
    isBlank(next.existingExperience) &&
    typeof incoming.existingExperience === "string" &&
    incoming.existingExperience.trim()
  ) {
    next.existingExperience = incoming.existingExperience;
  }
  if (
    isBlank(next.distributionChannels) &&
    typeof incoming.distributionChannels === "string" &&
    incoming.distributionChannels.trim()
  ) {
    next.distributionChannels = incoming.distributionChannels;
  }
  if (isBlank(next.pricingApproach) && typeof incoming.pricingApproach === "string" && incoming.pricingApproach.trim()) {
    next.pricingApproach = incoming.pricingApproach;
  }
  if (isBlank(next.uniqueAngle) && typeof incoming.uniqueAngle === "string" && incoming.uniqueAngle.trim()) {
    next.uniqueAngle = incoming.uniqueAngle;
  }
  if (isBlank(next.extraNotes) && typeof incoming.extraNotes === "string" && incoming.extraNotes.trim()) {
    next.extraNotes = incoming.extraNotes;
  }

  // number | "" fields
  if (next.startupCapital === "" && incoming.startupCapital !== undefined) {
    next.startupCapital = toNumberOrEmpty(incoming.startupCapital);
  }
  if (next.ownerContribution === "" && incoming.ownerContribution !== undefined) {
    next.ownerContribution = toNumberOrEmpty(incoming.ownerContribution);
  }
  if (next.loanAmount === "" && incoming.loanAmount !== undefined) {
    next.loanAmount = toNumberOrEmpty(incoming.loanAmount);
  }
  if (next.loanTenorYears === "" && incoming.loanTenorYears !== undefined) {
    next.loanTenorYears = toNumberOrEmpty(incoming.loanTenorYears);
  }

  // boolean field
  if (next.equityPartners === false && incoming.equityPartners === true) {
    next.equityPartners = true;
  }

  return next;
}

function getLineScoutSessionId(): string {
  const key = "linescout_session_id";
  let id = "";
  try {
    id = localStorage.getItem(key) || "";
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
  } catch {
    // ignore
  }
  return id;
}

export default function BusinessPlanForm() {
  const [token, setToken] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("loan");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [exchangeRate, setExchangeRate] = useState<string>("1500");

  const [intake, setIntake] = useState<Intake>({
    businessName: "",
    country: "Nigeria",
    city: "",
    productLine: "",
    capacity: "",
    targetCustomers: "",
    startupCapital: "",
    ownerContribution: "",
    loanAmount: "",
    loanTenorYears: "",
    equityPartners: false,
    existingExperience: "",
    distributionChannels: "",
    pricingApproach: "",
    uniqueAngle: "",
    extraNotes: "",
  });

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenUsed, setTokenUsed] = useState(false);

  // Prefill UI state
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);

  const showLoanFields = useMemo(() => purpose === "loan" || purpose === "investor", [purpose]);

  function updateField<K extends keyof Intake>(key: K, value: Intake[K]) {
    setIntake((prev) => ({ ...prev, [key]: value }));
  }

  async function handlePrefillFromChat() {
    setPrefillNote(null);

    const sessionId = getLineScoutSessionId();
    if (!sessionId) {
      setPrefillNote("No chat session found yet. Start the chat first, then come back here.");
      return;
    }

    setPrefillLoading(true);
    try {
      const res = await fetch("/api/linescout-business-plan/prefill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok || !data?.ok) {
        const msg = String(data?.error || data?.message || "Could not prefill from chat.");
        setPrefillNote(msg);
        return;
      }

      const draft = (data?.draft || data?.intake || {}) as Partial<Intake>;

      // Merge safely: only fill empty fields
      setIntake((prev) => mergeIntakePrefill(prev, draft));

      setPrefillNote("Done. We pulled what we could from your recent chat. Please review and complete the remaining fields.");
    } catch {
      setPrefillNote("Could not reach the server. Please try again.");
    } finally {
      setPrefillLoading(false);
    }
  }

  async function handleDownload(format: "pdf" | "docx") {
    try {
      if (!result || !result.planText || !result.planText.trim()) {
        alert("Please generate a plan first before downloading.");
        return;
      }

      const fileName = intake.businessName.trim() || "linescout-business-plan";

      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planText: result.planText, format, fileName }),
      });

      if (!response.ok) {
        console.error("Export error:", response.status);
        alert("Could not export file. Please try again.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = format === "pdf" ? `${fileName}.pdf` : `${fileName}.docx`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Something went wrong while downloading the file.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setProgress(0);

    if (!token.trim()) {
      setError("Please paste your valid business plan token.");
      return;
    }

    if (!intake.businessName || !intake.productLine) {
      setError("Please fill in at least the business name and project / product line.");
      return;
    }

    try {
      setLoading(true);
      setProgress(20);

      const payload = {
        token: token.trim(),
        type: "business_plan",
        currency,
        exchangeRate: currency === "NGN" ? exchangeRate : undefined,
        purpose,
        format: "both",
        intake: {
          ...intake,
          startupCapital: intake.startupCapital === "" ? 0 : Number(intake.startupCapital),
          ownerContribution: intake.ownerContribution === "" ? 0 : Number(intake.ownerContribution),
          loanAmount: intake.loanAmount === "" ? 0 : Number(intake.loanAmount),
          loanTenorYears: intake.loanTenorYears === "" ? 0 : Number(intake.loanTenorYears),
        },
      };

      const response = await callN8nWebhook("/webhook/linescout_business_plan", payload);
      setProgress(60);

      const next: ResultState = {
        ok: Boolean((response as any).ok),
        canGenerate: (response as any).canGenerate,
        consumed: (response as any).consumed,
        message: (response as any).message,
        error: (response as any).error,
        code: (response as any).code,
        token: (response as any).token,
        type: (response as any).type,
        currency: (response as any).currency,
        exchangeRate: (response as any).exchangeRate,
        intake: (response as any).intake,
        planText: (response as any).planText,
      };

      if (!next.ok || !next.planText) {
        const rawMsg =
          (typeof next.error === "string" && next.error) ||
          (typeof next.message === "string" && next.message) ||
          "";

        const lc = rawMsg.toLowerCase();
        let friendlyError = "";

        if (
          lc.includes("invalid or expired") ||
          lc.includes("invalid token") ||
          lc.includes("token not found") ||
          lc.includes("token not valid") ||
          lc.includes("token invalid")
        ) {
          friendlyError =
            "This business plan token is not valid or has expired. Please double-check it or get a new token.";
        } else if (lc.includes("already used") || lc.includes("already been used")) {
          friendlyError =
            "This business plan token has already been used to generate a plan. Each LineScout token is single-use. Please purchase a new token to generate another business plan.";
        } else {
          friendlyError =
            rawMsg ||
            "LineScout could not generate a plan. Please check your token and details, then try again.";
        }

        setError(friendlyError);
        setResult(next);
        setProgress(0);
        return;
      }

      setResult(next);
      setError(null);
      setProgress(100);
      setTokenUsed(true);
      track("Purchase", { content_name: "Business Plan Generated" });
    } catch (err: any) {
      console.error("Business plan error:", err);
      setError("Something went wrong while talking to LineScout backend.");
      setProgress(0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8 shadow-xl shadow-black/50">
      {/* Header + compact actions */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold text-white">Business Plan Writer</h2>
          <p className="mt-1 text-sm text-neutral-300">Paste your token. Complete the form. Generate a plan.</p>

          <div className="mt-2 text-xs text-neutral-400">
            Don’t have a token?{" "}
            <a
              href="https://paystack.shop/pay/linescoutbusinessplan"
              target="_blank"
              rel="noreferrer"
              className="text-white underline underline-offset-4 hover:text-neutral-200"
            >
              Get one here (₦20,000)
            </a>
            . You’ll receive your token by email.
          </div>
        </div>

        <div className="flex flex-col items-start gap-1 sm:items-end">
          <button
            type="button"
            onClick={handlePrefillFromChat}
            disabled={prefillLoading}
            className="
              inline-flex items-center justify-center
              rounded-xl
              border border-neutral-800
              bg-neutral-950
              px-3 py-2
              text-sm font-semibold
              text-neutral-200
              hover:border-neutral-700
              transition-colors
              whitespace-nowrap
              disabled:opacity-60
              disabled:cursor-not-allowed
            "
          >
            {prefillLoading ? "Prefilling..." : "Prefill from chat"}
          </button>

          <div className="text-xs text-neutral-500">Pulls from your recent chat. Fills empty fields only.</div>
        </div>
      </div>

      {/* Prefill feedback */}
      {prefillNote ? (
        <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300">
          {prefillNote}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Token */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-200">Business plan token</label>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
            placeholder="Paste token from your email, e.g. BP-XXXXXX-YYYYY"
          />
        </div>

        {/* Purpose & currency */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-200">Purpose of business plan</label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as Purpose)}
              className="w-full h-10 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:outline-none focus:border-neutral-700"
            >
              <option value="loan">Bank loan / financing</option>
              <option value="investor">Investor funding</option>
              <option value="internal">Internal planning</option>
              <option value="grant">Grant / donor funding</option>
              <option value="other">Other purpose</option>
            </select>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-neutral-200">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as "NGN" | "USD")}
                  className="w-full h-11 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:outline-none focus:border-neutral-700"
                >
                  <option value="NGN">NGN</option>
                  <option value="USD">USD</option>
                </select>
              </div>

              {currency === "NGN" && (
                <div className="space-y-2 sm:col-span-2">
                  <label className="block text-sm font-medium text-neutral-200">Exchange rate (₦ per $1)</label>
                  <input
                    type="number"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    placeholder="1500"
                    className="w-full h-11 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Basic info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-200">Business name</label>
            <input
              type="text"
              value={intake.businessName}
              onChange={(e) => updateField("businessName", e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
              placeholder="Spreadit Limited"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-200">City & country</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={intake.city}
                onChange={(e) => updateField("city", e.target.value)}
                className="w-1/2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
                placeholder="Lagos"
              />
              <input
                type="text"
                value={intake.country}
                onChange={(e) => updateField("country", e.target.value)}
                className="w-1/2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
                placeholder="Nigeria"
              />
            </div>
          </div>
        </div>

        {/* Line & capacity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-200">Product line / project</label>
            <input
              type="text"
              value={intake.productLine}
              onChange={(e) => updateField("productLine", e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
              placeholder="Groundnut/Peanut Oil Extraction Line"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-200">Planned capacity</label>
            <input
              type="text"
              value={intake.capacity}
              onChange={(e) => updateField("capacity", e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
              placeholder="5 tons per day"
            />
          </div>
        </div>

        {/* Customers & channels */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-200">Target customers</label>
          <input
            type="text"
            value={intake.targetCustomers}
            onChange={(e) => updateField("targetCustomers", e.target.value)}
            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
            placeholder="Wholesalers, supermarkets, bulk buyers"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-200">Distribution channels</label>
          <input
            type="text"
            value={intake.distributionChannels}
            onChange={(e) => updateField("distributionChannels", e.target.value)}
            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
            placeholder="Open markets, supermarkets, wholesalers"
          />
        </div>

        {/* Pricing & unique angle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-200">Pricing approach</label>
            <input
              type="text"
              value={intake.pricingApproach}
              onChange={(e) => updateField("pricingApproach", e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
              placeholder="Slightly below imported oil, premium packaging"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-200">Unique angle</label>
            <input
              type="text"
              value={intake.uniqueAngle}
              onChange={(e) => updateField("uniqueAngle", e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
              placeholder="Locally processed, healthier oil, transparent sourcing"
            />
          </div>
        </div>

        {/* Money section */}
        {showLoanFields && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <label className="block text-sm font-medium text-neutral-200">
                Total project cost (startup capital) in {currency}
              </label>
              <input
                type="number"
                value={intake.startupCapital}
                onChange={(e) => updateField("startupCapital", e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
                placeholder="150000000"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-200">Owner contribution ({currency})</label>
              <input
                type="number"
                value={intake.ownerContribution}
                onChange={(e) => updateField("ownerContribution", e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
                placeholder="30000000"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-200">Loan amount ({currency})</label>
              <input
                type="number"
                value={intake.loanAmount}
                onChange={(e) => updateField("loanAmount", e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
                placeholder="120000000"
              />
            </div>
          </div>
        )}

        {showLoanFields && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-200">Loan tenor (years)</label>
              <input
                type="number"
                value={intake.loanTenorYears}
                onChange={(e) => updateField("loanTenorYears", e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
                placeholder="5"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-200">Equity partners involved?</label>
              <select
                value={intake.equityPartners ? "yes" : "no"}
                onChange={(e) => updateField("equityPartners", e.target.value === "yes")}
                className="w-full h-10 rounded-xl border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 focus:outline-none focus:border-neutral-700"
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
          </div>
        )}

        {/* Experience & notes */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-200">Existing experience</label>
          <textarea
            value={intake.existingExperience}
            onChange={(e) => updateField("existingExperience", e.target.value)}
            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
            rows={2}
            placeholder="We already run a kulikuli business..."
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-200">Extra notes</label>
          <textarea
            value={intake.extraNotes}
            onChange={(e) => updateField("extraNotes", e.target.value)}
            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-700"
            rows={2}
            placeholder="Focus on Lagos and Ogun first, then expand..."
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Progress bar */}
        {loading && (
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-900">
            <div className="h-full bg-white transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        )}

        {tokenUsed ? (
          <div className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 h-6 w-6 flex items-center justify-center rounded-full bg-white text-neutral-950 text-sm">
                ✓
              </div>
              <div>
                <p className="text-sm sm:text-base font-semibold text-white">Your business plan is ready.</p>
                <p className="mt-1 text-xs sm:text-sm text-neutral-400">
                  This token has now been used. To write another plan, please get a new token.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <a
                href="https://paystack.shop/pay/linescoutbusinessplan"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200 transition-colors"
              >
                Get new token
              </a>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-700 transition-colors"
              >
                Start another plan
              </button>
            </div>
          </div>
        ) : (
          <button
            type="submit"
            disabled={loading || tokenUsed}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Writing plan..." : "Write business plan"}
          </button>
        )}
      </form>

      {/* Result */}
      {result && result.ok && result.planText && (
        <div className="mt-8 space-y-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-200">
            <p className="font-semibold text-white">Your business plan is ready.</p>
            <p className="text-neutral-400">You can review the preview below or download it as DOCX.</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleDownload("docx")}
              className="rounded-full border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-700"
            >
              Download DOCX
            </button>
          </div>

          <div className="mt-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 max-h-[480px] overflow-y-auto">
            <h3 className="text-base font-semibold text-white mb-3">Plan preview</h3>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-100">{result.planText}</pre>
          </div>
        </div>
      )}
    </div>
  );
}