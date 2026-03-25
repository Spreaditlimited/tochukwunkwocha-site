const gemini = require("./ai/providers/gemini");
const openai = require("./ai/providers/openai");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function selectedProviderName() {
  const raw = clean(process.env.LEADPAGE_AI_PROVIDER || process.env.AI_PROVIDER, 40).toLowerCase();
  if (raw === "openai") return "openai";
  return "gemini";
}

function selectedProvider() {
  return selectedProviderName() === "openai" ? openai : gemini;
}

function hasKeyForProvider(name) {
  if (name === "openai") return Boolean(clean(process.env.OPENAI_API_KEY, 10));
  return Boolean(clean(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY, 10));
}

function allowMockFallback() {
  return String(process.env.LEADPAGE_AUTOMATION_ALLOW_MOCK || "1").trim() !== "0";
}

async function generateText(input) {
  const providerName = selectedProviderName();
  const provider = selectedProvider();

  if (!hasKeyForProvider(providerName)) {
    if (allowMockFallback()) {
      return {
        provider: providerName,
        model: "mock",
        text: clean(input && input.mockText, 200000) || "",
        raw: null,
        mock: true,
      };
    }
    throw new Error(`Missing API key for provider: ${providerName}`);
  }

  try {
    return await provider.generateText(input || {});
  } catch (error) {
    if (allowMockFallback()) {
      return {
        provider: providerName,
        model: "mock-fallback",
        text: clean(input && input.mockText, 200000) || "",
        raw: {
          fallbackReason: clean(error && error.message, 500) || "Provider request failed",
        },
        mock: true,
      };
    }
    throw error;
  }
}

module.exports = {
  selectedProviderName,
  hasKeyForProvider,
  generateText,
};
