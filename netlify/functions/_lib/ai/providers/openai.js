function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function getApiKey() {
  const key = clean(process.env.OPENAI_API_KEY, 500);
  if (!key) throw new Error("Missing OPENAI_API_KEY");
  return key;
}

function getModel() {
  return clean(process.env.OPENAI_MODEL, 120) || "gpt-4.1-mini";
}

function requestTimeoutMs() {
  const raw = Number(process.env.LEADPAGE_AI_TIMEOUT_MS || 45000);
  if (!Number.isFinite(raw) || raw < 3000) return 45000;
  return Math.min(raw, 120000);
}

async function generateText(input) {
  const apiKey = getApiKey();
  const model = getModel();

  const systemPrompt = clean(input.systemPrompt, 12000);
  const userPrompt = clean(input.userPrompt, 20000);

  if (!userPrompt) throw new Error("OpenAI provider requires a userPrompt");

  const body = {
    model,
    temperature: Number.isFinite(Number(input.temperature)) ? Number(input.temperature) : 0.4,
    max_tokens: Number.isFinite(Number(input.maxTokens)) ? Number(input.maxTokens) : 1600,
    messages: [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      { role: "user", content: userPrompt },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, requestTimeoutMs());

  let res;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`OpenAI request timed out after ${requestTimeoutMs()}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const json = await res.json().catch(function () {
    return null;
  });

  if (!res.ok) {
    throw new Error(
      (json && json.error && json.error.message) ||
        `OpenAI request failed (${res.status})`
    );
  }

  const text = clean(
    json && json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content
      : "",
    500000
  );

  if (!text) throw new Error("OpenAI response was empty");

  return {
    provider: "openai",
    model,
    text,
    raw: json,
  };
}

module.exports = {
  generateText,
};
