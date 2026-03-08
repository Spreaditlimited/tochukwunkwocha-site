function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

function badMethod() {
  return json(405, { ok: false, error: "Method not allowed" });
}

module.exports = { json, badMethod };
