const { json, badMethod } = require("./_lib/http");
const { buildDomainCandidates, checkAvailabilityMany, selectedDomainProviderName } = require("./_lib/domain-client");

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const preferredName = clean(body.preferredName || body.preferred_name, 160);
  const limit = Math.max(3, Math.min(Number(body.limit) || 10, 20));
  if (!preferredName || preferredName.length < 3) {
    return json(400, { ok: false, error: "Enter a preferred name (at least 3 characters)." });
  }

  try {
    const candidates = buildDomainCandidates({
      preferredName,
      limit,
    });
    const suggestions = await checkAvailabilityMany({ domainNames: candidates, strict: true });
    const firstAvailable = (suggestions || []).find((item) => item && item.available) || null;
    const providerName = (suggestions && suggestions[0] && suggestions[0].provider) || selectedDomainProviderName();
    const total = Array.isArray(suggestions) ? suggestions.length : 0;
    const availableCount = (suggestions || []).filter(function (item) { return item && item.available; }).length;
    const reasonCounts = {};
    (suggestions || []).forEach(function (item) {
      const reason = String((item && item.reason) || "unknown");
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });
    console.log("[domain-suggest] result", {
      preferredName,
      provider: providerName,
      total,
      availableCount,
      reasonCounts,
    });
    return json(200, {
      ok: true,
      provider: providerName,
      suggestions: suggestions || [],
      firstAvailable: firstAvailable ? firstAvailable.domainName : "",
    });
  } catch (error) {
    console.error("[domain-suggest] failed", {
      message: error && error.message ? String(error.message) : "unknown",
      stack: error && error.stack ? String(error.stack) : "",
    });
    return json(503, {
      ok: false,
      error: "Domain suggestion service is temporarily unavailable. Please try again shortly.",
      details: error && error.message ? String(error.message) : "",
    });
  }
};
