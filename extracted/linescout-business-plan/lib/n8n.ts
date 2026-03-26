export async function callN8nWebhook(path: string, payload: unknown) {
  const baseUrl = process.env.NEXT_PUBLIC_N8N_BASE_URL;

  if (!baseUrl) {
    console.error("NEXT_PUBLIC_N8N_BASE_URL is not set");
    throw new Error("n8n base URL is not configured");
  }

  const url = `${baseUrl}${path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    // ✅ use the payload parameter here
    body: JSON.stringify(payload),
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  // ❌ Don't throw on 4xx/5xx – return a normalized object
  if (!response.ok) {
    console.error("n8n webhook error:", response.status, data);
    return {
      ok: false,
      status: response.status,
      // merge any JSON from n8n (message, code, etc.)
      ...(data && typeof data === "object" ? data : {}),
    };
  }

  // ✅ 2xx – just return the parsed JSON
  return data;
}