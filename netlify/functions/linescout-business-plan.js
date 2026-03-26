const { json, badMethod } = require("./_lib/http");

function parseJsonBody(rawBody) {
  try {
    return JSON.parse(rawBody || "{}");
  } catch (_error) {
    return null;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const baseUrl = String(process.env.N8N_BASE_URL || process.env.NEXT_PUBLIC_N8N_BASE_URL || "").trim();
  if (!baseUrl) return json(500, { ok: false, error: "N8N_BASE_URL is not configured." });

  const body = parseJsonBody(event.body);
  if (!body) return json(400, { ok: false, error: "Invalid JSON body" });

  const token = String(body.token || "").trim();
  const type = String(body.type || "").trim();
  const currency = String(body.currency || "").trim().toUpperCase();
  const exchangeRate = body.exchangeRate;
  const intake = body.intake;
  const purpose = String(body.purpose || "loan").trim();

  if (!token || type !== "business_plan") {
    return json(400, { ok: false, error: "Valid token and type=business_plan are required." });
  }

  if (currency !== "NGN" && currency !== "USD") {
    return json(400, { ok: false, error: "Currency must be NGN or USD." });
  }

  if (currency === "NGN") {
    const numericRate = Number(exchangeRate);
    if (!Number.isFinite(numericRate) || numericRate <= 0) {
      return json(400, { ok: false, error: "A valid numeric exchangeRate is required for NGN." });
    }
  }

  if (!intake || typeof intake !== "object") {
    return json(400, { ok: false, error: "Business plan intake details are required." });
  }

  try {
    const response = await fetch(baseUrl + "/webhook/linescout_business_plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        type,
        currency,
        exchangeRate: currency === "NGN" ? Number(exchangeRate) : undefined,
        purpose,
        format: body.format || "both",
        intake,
      }),
    });

    const data = await response.json().catch(function () {
      return null;
    });

    if (!response.ok) {
      return json(502, {
        ok: false,
        error: "n8n workflow returned an error.",
        status: response.status,
        details: data,
      });
    }

    return json(200, data || { ok: false, error: "Unexpected empty response from n8n." });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Unexpected server error." });
  }
};
