const { json, badMethod } = require("./_lib/http");
const { checkAvailability, selectedDomainProviderName } = require("./_lib/domain-client");
const { normalizeDomain } = require("./_lib/domains");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const domainName = normalizeDomain(body.domainName || body.domain_name);
  if (!domainName) return json(400, { ok: false, error: "domainName is required" });

  try {
    const result = await checkAvailability({ domainName, strict: true });
    console.log("[domain-check] result", {
      domainName,
      provider: result.provider || selectedDomainProviderName(),
      available: Boolean(result.available),
      reason: result.reason || (result.available ? "available" : "unavailable"),
    });
    return json(200, {
      ok: true,
      provider: result.provider || selectedDomainProviderName(),
      domainName,
      available: Boolean(result.available),
      reason: result.reason || (result.available ? "available" : "unavailable"),
    });
  } catch (error) {
    console.error("[domain-check] failed", {
      domainName,
      message: error && error.message ? String(error.message) : "unknown",
      stack: error && error.stack ? String(error.stack) : "",
    });
    return json(503, {
      ok: false,
      error: "Domain lookup is temporarily unavailable. Please try again shortly.",
      details: error && error.message ? String(error.message) : "",
    });
  }
};
