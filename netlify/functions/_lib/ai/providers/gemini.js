function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function normalizeApiKey(value) {
  const raw = clean(value, 500);
  return raw.replace(/^['"]+|['"]+$/g, "").trim();
}

function getApiKey() {
  const key = normalizeApiKey(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
  if (!key) throw new Error("Missing GEMINI_API_KEY (or GOOGLE_AI_API_KEY)");
  return key;
}

function getModelCandidates() {
  const explicit = clean(process.env.GEMINI_MODEL, 120);
  const defaults = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash"];
  const seen = new Set();
  const ordered = [];

  [explicit].concat(defaults).forEach(function (name) {
    const key = clean(name, 120);
    if (!key || seen.has(key)) return;
    seen.add(key);
    ordered.push(key);
  });

  return ordered;
}

function requestTimeoutMs(input) {
  const fromInput = Number(input && input.timeoutMs);
  if (Number.isFinite(fromInput) && fromInput >= 3000) {
    return Math.min(fromInput, 120000);
  }

  const raw = Number(process.env.LEADPAGE_AI_TIMEOUT_MS || 12000);
  if (!Number.isFinite(raw) || raw < 3000) return 12000;
  return Math.min(raw, 120000);
}

async function generateText(input) {
  const apiKey = getApiKey();
  const models = getModelCandidates();

  const systemPrompt = clean(input.systemPrompt, 12000);
  const userPrompt = clean(input.userPrompt, 20000);

  if (!userPrompt) throw new Error("Gemini provider requires a userPrompt");

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          ...(systemPrompt ? [{ text: `System:\n${systemPrompt}` }] : []),
          { text: userPrompt },
        ],
      },
    ],
    generationConfig: {
      temperature: Number.isFinite(Number(input.temperature)) ? Number(input.temperature) : 0.4,
      maxOutputTokens: Number.isFinite(Number(input.maxTokens)) ? Number(input.maxTokens) : 1600,
    },
  };

  let lastError = null;
  for (const model of models) {
    const timeoutMs = requestTimeoutMs(input);
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs);

    let res;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }
      );
    } catch (error) {
      clearTimeout(timer);
      if (error && error.name === "AbortError") {
        throw new Error(`Gemini request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    const json = await res.json().catch(function () {
      return null;
    });

    if (!res.ok) {
      const message = clean(json && json.error && json.error.message, 400) || `Gemini request failed (${res.status})`;
      lastError = new Error(message);
      const lower = message.toLowerCase();
      const unavailable =
        res.status === 404 ||
        lower.includes("not found") ||
        lower.includes("no longer available") ||
        lower.includes("invalid model") ||
        lower.includes("unsupported model");
      if (unavailable) continue;
      throw lastError;
    }

    const text =
      json &&
      json.candidates &&
      json.candidates[0] &&
      json.candidates[0].content &&
      Array.isArray(json.candidates[0].content.parts)
        ? json.candidates[0].content.parts
            .map(function (p) {
              return clean(p && p.text, 500000);
            })
            .join("\n")
        : "";

    if (!text) throw new Error("Gemini response was empty");

    return {
      provider: "gemini",
      model,
      text,
      raw: json,
    };
  }

  throw lastError || new Error("No Gemini model candidate could be used");
}

module.exports = {
  generateText,
};
